const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const app = require('./server');

async function runPhase4Tests() {
  console.log('==================================================');
  console.log('STARTING PHASE 4 AUTOMATED TEST SUITE: PURCHASE UPDATE');
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

    // Setup base purchase: PO-00001 with Laptop: 2 (Stock was 10 -> now 8)
    const createRes = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00001',
        purchase_date: '2026-08-25',
        items: [{ item_id: 1, quantity: 2 }]
      })
    });
    const createData = await createRes.json();
    const purchaseId = createData.data.id;

    const [stockAfterCreate] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    await assert(
      'Setup: Purchase PO-00001 created with Laptop quantity 2 (Stock: 10 -> 8)',
      createRes.status === 201 && stockAfterCreate[0].stock_available === 8,
      `status=${createRes.status}, stock=${stockAfterCreate[0]?.stock_available}`
    );

    // T1. Update purchase quantity upward: 2 -> 5 (diff = +3, stock: 8 -> 5)
    const resT1 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 5 }]
      })
    });
    const dataT1 = await resT1.json();
    const [stockAfterT1] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [piAfterT1] = await pool.query('SELECT quantity FROM purchase_items WHERE purchase_id = ? AND item_id = 1', [purchaseId]);

    await assert(
      'T1. Update quantity upward (2 -> 5): Stock decreases by 3 (8 -> 5)',
      resT1.status === 200 &&
      stockAfterT1[0].stock_available === 5 &&
      piAfterT1[0].quantity === 5 &&
      dataT1.data.items[0].quantity === 5,
      `status=${resT1.status}, stock=${stockAfterT1[0]?.stock_available}, piQty=${piAfterT1[0]?.quantity}`
    );

    // T2. Update quantity downward: 5 -> 2 (diff = -3, stock: 5 -> 8)
    const resT2 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 2 }]
      })
    });
    const dataT2 = await resT2.json();
    const [stockAfterT2] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [piAfterT2] = await pool.query('SELECT quantity FROM purchase_items WHERE purchase_id = ? AND item_id = 1', [purchaseId]);

    await assert(
      'T2. Update quantity downward (5 -> 2): Stock increases by 3 (5 -> 8)',
      resT2.status === 200 &&
      stockAfterT2[0].stock_available === 8 &&
      piAfterT2[0].quantity === 2 &&
      dataT2.data.items[0].quantity === 2,
      `status=${resT2.status}, stock=${stockAfterT2[0]?.stock_available}, piQty=${piAfterT2[0]?.quantity}`
    );

    // T3. Update quantity with no difference (2 -> 2)
    const resT3 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 2 }]
      })
    });
    const dataT3 = await resT3.json();
    const [stockAfterT3] = await pool.query('SELECT stock_available FROM items WHERE id = 1');

    await assert(
      'T3. Update quantity with no difference (2 -> 2): Stock unchanged (8)',
      resT3.status === 200 && stockAfterT3[0].stock_available === 8,
      `status=${resT3.status}, stock=${stockAfterT3[0]?.stock_available}`
    );

    // T4. Update purchase date only
    const resT4 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_date: '2026-08-30'
      })
    });
    const dataT4 = await resT4.json();
    const [stockAfterT4] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [purchaseAfterT4] = await pool.query('SELECT DATE_FORMAT(purchase_date, "%Y-%m-%d") as date FROM purchases WHERE id = ?', [purchaseId]);

    await assert(
      'T4. Update purchase date only: Date changes, stock unchanged',
      resT4.status === 200 &&
      purchaseAfterT4[0].date === '2026-08-30' &&
      stockAfterT4[0].stock_available === 8,
      `status=${resT4.status}, date=${purchaseAfterT4[0]?.date}, stock=${stockAfterT4[0]?.stock_available}`
    );

    // T5. Attempt quantity 0
    const resT5 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 0 }]
      })
    });
    const dataT5 = await resT5.json();
    const [stockAfterT5] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [piAfterT5] = await pool.query('SELECT quantity FROM purchase_items WHERE purchase_id = ? AND item_id = 1', [purchaseId]);

    await assert(
      'T5. Attempt quantity 0 rejected with 400, stock and purchase unchanged',
      resT5.status === 400 &&
      dataT5.message.includes('greater than zero') &&
      stockAfterT5[0].stock_available === 8 &&
      piAfterT5[0].quantity === 2,
      `status=${resT5.status}, stock=${stockAfterT5[0]?.stock_available}`
    );

    // T6. Attempt negative quantity
    const resT6 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: -4 }]
      })
    });
    const dataT6 = await resT6.json();
    const [stockAfterT6] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [piAfterT6] = await pool.query('SELECT quantity FROM purchase_items WHERE purchase_id = ? AND item_id = 1', [purchaseId]);

    await assert(
      'T6. Attempt negative quantity rejected with 400, stock and purchase unchanged',
      resT6.status === 400 &&
      dataT6.message.includes('greater than zero') &&
      stockAfterT6[0].stock_available === 8 &&
      piAfterT6[0].quantity === 2,
      `status=${resT6.status}, stock=${stockAfterT6[0]?.stock_available}`
    );

    // T7. Attempt increase beyond available stock (Part 7: quantity 2 -> 15 when stock is 8, diff = 13 > 8)
    const resT7 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 15 }]
      })
    });
    const dataT7 = await resT7.json();
    const [stockAfterT7] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    const [piAfterT7] = await pool.query('SELECT quantity FROM purchase_items WHERE purchase_id = ? AND item_id = 1', [purchaseId]);

    await assert(
      'T7. Attempt increase beyond available stock rejected with 400, stock unchanged',
      resT7.status === 400 &&
      dataT7.message.includes('Insufficient stock') &&
      stockAfterT7[0].stock_available === 8 &&
      piAfterT7[0].quantity === 2,
      `status=${resT7.status}, message=${dataT7.message}, stock=${stockAfterT7[0]?.stock_available}`
    );

    // T8. Update multiple items
    // First create a 3-item order: PO-00002 with Laptop: 2 (stock 8 -> 6), Mouse: 5 (stock 20 -> 15), Chair: 3 (stock 15 -> 12)
    const resCreateMulti = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-00002',
        purchase_date: '2026-08-25',
        items: [
          { item_id: 1, quantity: 2 },
          { item_id: 2, quantity: 5 },
          { item_id: 3, quantity: 3 }
        ]
      })
    });
    const dataCreateMulti = await resCreateMulti.json();
    const multiPurchaseId = dataCreateMulti.data.id;

    // Update PO-00002:
    // Laptop: 2 -> 4 (diff = +2, stock 6 -> 4)
    // Mouse: 5 -> 3 (diff = -2, stock 15 -> 17)
    // Chair: 3 -> 5 (diff = +2, stock 12 -> 10)
    const resT8 = await fetch(`${BASE_URL}/purchases/${multiPurchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { item_id: 1, quantity: 4 },
          { item_id: 2, quantity: 3 },
          { item_id: 3, quantity: 5 }
        ]
      })
    });
    const dataT8 = await resT8.json();

    const [stocksT8] = await pool.query('SELECT id, stock_available FROM items ORDER BY id ASC');
    const laptopStockT8 = stocksT8.find(i => i.id === 1)?.stock_available;
    const mouseStockT8 = stocksT8.find(i => i.id === 2)?.stock_available;
    const chairStockT8 = stocksT8.find(i => i.id === 3)?.stock_available;

    await assert(
      'T8. Multi-item update applies independent differences atomically (Laptop: 4, Mouse: 17, Chair: 10)',
      resT8.status === 200 && laptopStockT8 === 4 && mouseStockT8 === 17 && chairStockT8 === 10,
      `Laptop=${laptopStockT8}, Mouse=${mouseStockT8}, Chair=${chairStockT8}`
    );

    // T9. Multi-item update where one item fails (Laptop: 4 -> 5 is ok diff=+1, Chair: 5 -> 50 exceeds stock of 10)
    const resT9 = await fetch(`${BASE_URL}/purchases/${multiPurchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          { item_id: 1, quantity: 5 },
          { item_id: 3, quantity: 50 }
        ]
      })
    });
    const dataT9 = await resT9.json();

    const [stocksT9] = await pool.query('SELECT id, stock_available FROM items ORDER BY id ASC');
    const laptopStockT9 = stocksT9.find(i => i.id === 1)?.stock_available;
    const chairStockT9 = stocksT9.find(i => i.id === 3)?.stock_available;

    await assert(
      'T9. Multi-item update failure triggers complete rollback (no stock change for any item)',
      resT9.status === 400 &&
      dataT9.message.includes('Insufficient stock') &&
      laptopStockT9 === 4 &&
      chairStockT9 === 10,
      `status=${resT9.status}, laptop=${laptopStockT9}, chair=${chairStockT9}`
    );

    // T10. Update nonexistent Purchase
    const resT10 = await fetch(`${BASE_URL}/purchases/99999`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_date: '2026-08-30'
      })
    });
    const dataT10 = await resT10.json();
    await assert(
      'T10. Update nonexistent purchase returns 404',
      resT10.status === 404 && dataT10.message.includes('not found'),
      `status=${resT10.status}, message=${dataT10.message}`
    );

    // T11. Invalid purchase date
    const resT11 = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        purchase_date: 'invalid-date'
      })
    });
    const dataT11 = await resT11.json();
    await assert(
      'T11. Invalid purchase date rejected with 400',
      resT11.status === 400 && dataT11.message.includes('Valid purchase date is required'),
      `status=${resT11.status}, message=${dataT11.message}`
    );

    // T12. Verify Purchase Details after update (GET /api/purchases/:id returns updated quantities and joined info)
    const resT12 = await fetch(`${BASE_URL}/purchases/PO-00002`);
    const dataT12 = await resT12.json();

    const laptopLine = dataT12.data.items.find(i => i.item_id === 1);
    const mouseLine = dataT12.data.items.find(i => i.item_id === 2);
    const chairLine = dataT12.data.items.find(i => i.item_id === 3);

    await assert(
      'T12. Purchase Details reflects updated quantities via 4-table JOIN (Laptop: 4, Mouse: 3, Chair: 5)',
      resT12.status === 200 &&
      laptopLine.quantity === 4 &&
      mouseLine.quantity === 3 &&
      chairLine.quantity === 5 &&
      laptopLine.item_name === 'Laptop' &&
      mouseLine.type_name === 'Electronics',
      `Laptop=${laptopLine?.quantity}, Mouse=${mouseLine?.quantity}, Chair=${chairLine?.quantity}`
    );

    // Part 10 Verification: Ensure DELETE is still not implemented
    const resDeleteCheck = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'DELETE'
    });
    await assert(
      'Part 10 Verification: DELETE /api/purchases/:id remains prohibited (404/405)',
      resDeleteCheck.status === 404,
      `status=${resDeleteCheck.status}`
    );

    // Part 12: Database Cleanup - Restore clean initial seed state
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
    console.log(`PHASE 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

  } catch (err) {
    console.error('Fatal Phase 4 test error:', err);
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runPhase4Tests();
