const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const app = require('./server');

async function runPhase3Tests() {
  console.log('==================================================');
  console.log('STARTING PHASE 3 AUTOMATED TEST SUITE: PURCHASES');
  console.log('==================================================\n');

  const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;

  let passed = 0;
  let failed = 0;

  async function assert(testName, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 0. Reset to standard initial seed state
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE purchase_items');
    await pool.query('TRUNCATE TABLE purchases');
    await pool.query('TRUNCATE TABLE items');
    await pool.query('TRUNCATE TABLE item_types');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    await pool.query("INSERT INTO item_types (id, type_name) VALUES (1, 'Electronics'), (2, 'Furniture')");
    await pool.query(`
      INSERT INTO items (id, name, purchase_date, stock_available, item_type_id, active) VALUES
      (1, 'Laptop', '2026-08-25', 10, 1, 1),
      (2, 'Mouse', '2026-08-25', 20, 1, 1),
      (3, 'Chair', '2026-08-25', 15, 2, 1)
    `);

    // T1. Create a valid Purchase with one item
    const resT1 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-TEST-001',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: 1 }]
      })
    });
    const dataT1 = await resT1.json();
    const [stockAfterT1] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    await assert(
      'T1. Create valid Purchase with one item (stock 10 -> 9)',
      resT1.status === 201 && stockAfterT1[0].stock_available === 9 && dataT1.data.order_id === 'PO-TEST-001',
      `status=${resT1.status}, stock=${stockAfterT1[0]?.stock_available}`
    );

    // Reset Laptop back to 10 for T2 scenario
    await pool.query('UPDATE items SET stock_available = 10 WHERE id = 1');
    await pool.query('DELETE FROM purchase_items WHERE purchase_id = ?', [dataT1.data.id]);
    await pool.query('DELETE FROM purchases WHERE id = ?', [dataT1.data.id]);

    // T2. Create a Purchase containing multiple Items (Laptop: 2, Mouse: 5, Chair: 3)
    const resT2 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00001',
        purchase_date: '2026-08-25',
        items: [
          { item_id: 1, quantity: 2 },
          { item_id: 2, quantity: 5 },
          { item_id: 3, quantity: 3 }
        ]
      })
    });
    const dataT2 = await resT2.json();

    const [stocksT2] = await pool.query('SELECT id, name, stock_available FROM items ORDER BY id ASC');
    const laptopStock = stocksT2.find(i => i.id === 1)?.stock_available;
    const mouseStock = stocksT2.find(i => i.id === 2)?.stock_available;
    const chairStock = stocksT2.find(i => i.id === 3)?.stock_available;

    await assert(
      'T2. Multi-item purchase updates stocks (Laptop: 8, Mouse: 15, Chair: 12)',
      resT2.status === 201 && laptopStock === 8 && mouseStock === 15 && chairStock === 12,
      `Laptop=${laptopStock}, Mouse=${mouseStock}, Chair=${chairStock}`
    );

    // T3. Purchase quantity exceeds stock (Laptop stock = 8, Request = 10)
    const resT3 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00002',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: 10 }]
      })
    });
    const dataT3 = await resT3.json();
    const [stockAfterT3] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [orderCheckT3] = await pool.query('SELECT id FROM purchases WHERE order_id = "PO-00002"');

    await assert(
      'T3. Purchase quantity exceeds stock rejected, stock remains 8',
      resT3.status === 400 &&
      dataT3.message.includes('Insufficient stock') &&
      stockAfterT3[0].stock_available === 8 &&
      orderCheckT3.length === 0,
      `status=${resT3.status}, message=${dataT3.message}`
    );

    // T4. Purchase an inactive Item
    // Deactivate Chair
    await pool.query('UPDATE items SET active = 0 WHERE id = 3');

    const resT4 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00003',
        purchase_date: '2026-08-25',
        items: [{ item_id: 3, quantity: 1 }]
      })
    });
    const dataT4 = await resT4.json();
    const [stockAfterT4] = await pool.query('SELECT stock_available FROM items WHERE id = 3');

    await assert(
      'T4. Inactive item purchase rejected with 400',
      resT4.status === 400 &&
      dataT4.message.includes('inactive') &&
      stockAfterT4[0].stock_available === 12,
      `status=${resT4.status}, message=${dataT4.message}`
    );

    // Re-activate Chair
    await pool.query('UPDATE items SET active = 1 WHERE id = 3');

    // T5. Quantity = 0
    const resT5 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00004',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: 0 }]
      })
    });
    const dataT5 = await resT5.json();
    await assert(
      'T5. Quantity = 0 rejected with 400',
      resT5.status === 400 && dataT5.message.includes('greater than zero'),
      `status=${resT5.status}, message=${dataT5.message}`
    );

    // T6. Negative quantity
    const resT6 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00005',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: -2 }]
      })
    });
    const dataT6 = await resT6.json();
    await assert(
      'T6. Negative quantity rejected with 400',
      resT6.status === 400 && dataT6.message.includes('greater than zero'),
      `status=${resT6.status}, message=${dataT6.message}`
    );

    // T7. Missing item (ID 99999)
    const resT7 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00006',
        purchase_date: '2026-08-25',
        items: [{ item_id: 99999, quantity: 1 }]
      })
    });
    const dataT7 = await resT7.json();
    await assert(
      'T7. Missing item rejected with 404',
      resT7.status === 404 && dataT7.message.includes('Item not found'),
      `status=${resT7.status}, message=${dataT7.message}`
    );

    // T8. Duplicate item IDs in one order
    const resT8 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00007',
        purchase_date: '2026-08-25',
        items: [
          { item_id: 1, quantity: 1 },
          { item_id: 1, quantity: 2 }
        ]
      })
    });
    const dataT8 = await resT8.json();
    await assert(
      'T8. Duplicate item IDs rejected with 400',
      resT8.status === 400 && dataT8.message.includes('Duplicate items'),
      `status=${resT8.status}, message=${dataT8.message}`
    );

    // T9. Empty items array
    const resT9 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00008',
        purchase_date: '2026-08-25',
        items: []
      })
    });
    const dataT9 = await resT9.json();
    await assert(
      'T9. Empty items array rejected with 400',
      resT9.status === 400 && dataT9.message.includes('at least one item'),
      `status=${resT9.status}, message=${dataT9.message}`
    );

    // T10. Transaction rollback (One valid item, one with insufficient stock)
    // Laptop has 8 in stock (valid: 2), Mouse has 15 in stock (insufficient: 50)
    const [laptopBeforeT10] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [mouseBeforeT10] = await pool.query('SELECT stock_available FROM items WHERE id = 2');

    const resT10 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-ROLLBACK-TEST',
        purchase_date: '2026-08-25',
        items: [
          { item_id: 1, quantity: 2 },
          { item_id: 2, quantity: 50 }
        ]
      })
    });
    const dataT10 = await resT10.json();

    const [laptopAfterT10] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [mouseAfterT10] = await pool.query('SELECT stock_available FROM items WHERE id = 2');
    const [checkHeader] = await pool.query('SELECT id FROM purchases WHERE order_id = "PO-ROLLBACK-TEST"');

    await assert(
      'T10. Multi-item purchase rollback leaves all stock unchanged and creates no rows',
      resT10.status === 400 &&
      laptopBeforeT10[0].stock_available === laptopAfterT10[0].stock_available &&
      mouseBeforeT10[0].stock_available === mouseAfterT10[0].stock_available &&
      checkHeader.length === 0,
      `laptop=${laptopAfterT10[0].stock_available}, headerExists=${checkHeader.length > 0}`
    );

    // T11. Duplicate Order ID
    // PO-00001 was created in T2
    const resT11 = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00001',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: 1 }]
      })
    });
    const dataT11 = await resT11.json();
    await assert(
      'T11. Duplicate Order ID rejected with 409 Conflict',
      resT11.status === 409 && dataT11.message.includes('Order ID already exists'),
      `status=${resT11.status}, message=${dataT11.message}`
    );

    // T12. Purchase Details with JOIN
    const resT12 = await fetch(`${BASE_URL}/purchases/PO-00001`);
    const dataT12 = await resT12.json();

    const orderOk = dataT12.data && dataT12.data.order_id === 'PO-00001';
    const itemsOk = dataT12.data && dataT12.data.items && dataT12.data.items.length === 3;
    const joinedOk = itemsOk && dataT12.data.items.every(i => i.item_name && i.type_name && i.quantity > 0 && i.current_stock !== undefined);

    await assert(
      'T12. Purchase Details returns joined data across 4 tables',
      resT12.status === 200 && orderOk && joinedOk,
      `itemsLength=${dataT12.data?.items?.length}`
    );

    // T13. Purchase List
    const resT13 = await fetch(`${BASE_URL}/purchases`);
    const dataT13 = await resT13.json();
    const hasOrders = resT13.status === 200 && Array.isArray(dataT13.data) && dataT13.data.length >= 1;
    const hasOrderFields = hasOrders && dataT13.data[0].order_id && dataT13.data[0].item_count !== undefined;

    await assert(
      'T13. Purchase list returns historical purchases with item count',
      hasOrders && hasOrderFields,
      `ordersCount=${dataT13.data?.length}`
    );

    // Verify Part 9: Ensure NO DELETE route exists on /api/purchases/:id
    const resDeleteCheck = await fetch(`${BASE_URL}/purchases/1`, {
      method: 'DELETE'
    });
    await assert(
      'Part 9 Verification: DELETE /api/purchases/:id is not supported (404/405)',
      resDeleteCheck.status === 404,
      `status=${resDeleteCheck.status}`
    );

    // PART 12: Test Isolation - Restore clean initial seed data
    console.log('\nRestoring clean seed data to match Section 17...');
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE purchase_items');
    await pool.query('TRUNCATE TABLE purchases');
    await pool.query('TRUNCATE TABLE items');
    await pool.query('TRUNCATE TABLE item_types');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    await pool.query("INSERT INTO item_types (id, type_name) VALUES (1, 'Electronics'), (2, 'Furniture')");
    await pool.query(`
      INSERT INTO items (id, name, purchase_date, stock_available, item_type_id, active) VALUES
      (1, 'Laptop', '2026-08-25', 10, 1, 1),
      (2, 'Mouse', '2026-08-25', 20, 1, 1),
      (3, 'Chair', '2026-08-25', 15, 2, 1)
    `);
    console.log('Seed data restored: Electronics, Furniture; Laptop (10), Mouse (20), Chair (15).\n');

    console.log('==================================================');
    console.log(`PHASE 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

  } catch (err) {
    console.error('Fatal Phase 3 test error:', err);
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase3Tests();
