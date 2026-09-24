const http = require('http');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = require('./server');
const pool = require('./config/db');

async function runTests() {
  console.log('==================================================');
  console.log('STARTING PHASE 2 AUTOMATED TEST SUITE');
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
    // Reset DB to clean state for test run
    await pool.query('SET FOREIGN_KEY_CHECKS = 0');
    await pool.query('TRUNCATE TABLE purchase_items');
    await pool.query('TRUNCATE TABLE purchases');
    await pool.query('TRUNCATE TABLE items');
    await pool.query('TRUNCATE TABLE item_types');
    await pool.query('SET FOREIGN_KEY_CHECKS = 1');

    // 1. Create Electronics
    const res1 = await fetch(`${BASE_URL}/item-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_name: 'Electronics' })
    });
    const data1 = await res1.json();
    await assert('1. Create Item Type: Electronics', res1.status === 201 && data1.data.type_name === 'Electronics');
    const electronicsId = data1.data.id;

    // 2. Create Furniture
    const res2 = await fetch(`${BASE_URL}/item-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_name: 'Furniture' })
    });
    const data2 = await res2.json();
    await assert('2. Create Item Type: Furniture', res2.status === 201 && data2.data.type_name === 'Furniture');
    const furnitureId = data2.data.id;

    // 3. Get item types
    const res3 = await fetch(`${BASE_URL}/item-types`);
    const data3 = await res3.json();
    await assert('3. Get all Item Types', res3.status === 200 && data3.data.length >= 2);

    // 4. Update an item type
    // Create temporary type "Stationary" then update to "Stationery"
    const resTempType = await fetch(`${BASE_URL}/item-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_name: 'Stationary' })
    });
    const dataTempType = await resTempType.json();
    const tempTypeId = dataTempType.data.id;

    const res4 = await fetch(`${BASE_URL}/item-types/${tempTypeId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_name: 'Stationery' })
    });
    const data4 = await res4.json();
    await assert('4. Update an Item Type', res4.status === 200 && data4.data.type_name === 'Stationery');

    // 5. Delete an unused item type (Stationery has no items)
    const res5 = await fetch(`${BASE_URL}/item-types/${tempTypeId}`, {
      method: 'DELETE'
    });
    const data5 = await res5.json();
    await assert('5. Delete an unused Item Type', res5.status === 200 && data5.success === true);

    // 7. Create Laptop with stock 10
    const res7 = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Laptop',
        item_type_id: electronicsId,
        purchase_date: '2026-08-25',
        stock_available: 10,
        active: true
      })
    });
    const data7 = await res7.json();
    await assert('7. Create Laptop (Stock 10)', res7.status === 201 && data7.data.stock_available === 10 && data7.data.type_name === 'Electronics');
    const laptopId = data7.data.id;

    // 6. Attempt to delete an item type that has items (Electronics has Laptop)
    const res6 = await fetch(`${BASE_URL}/item-types/${electronicsId}`, {
      method: 'DELETE'
    });
    const data6 = await res6.json();
    await assert('6. Attempt to delete Item Type with items (Conflict 409)', res6.status === 409 && data6.message.includes('associated with it'));

    // 8. Create Mouse with stock 20
    const res8 = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Mouse',
        item_type_id: electronicsId,
        purchase_date: '2026-08-25',
        stock_available: 20,
        active: true
      })
    });
    const data8 = await res8.json();
    await assert('8. Create Mouse (Stock 20)', res8.status === 201 && data8.data.stock_available === 20 && data8.data.type_name === 'Electronics');
    const mouseId = data8.data.id;

    // 9. Create Chair with stock 15
    const res9 = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Chair',
        item_type_id: furnitureId,
        purchase_date: '2026-08-25',
        stock_available: 15,
        active: true
      })
    });
    const data9 = await res9.json();
    await assert('9. Create Chair (Stock 15)', res9.status === 201 && data9.data.stock_available === 15 && data9.data.type_name === 'Furniture');
    const chairId = data9.data.id;

    // 10. Attempt to create an item with negative stock
    const res10 = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Desk',
        item_type_id: furnitureId,
        purchase_date: '2026-08-25',
        stock_available: -5,
        active: true
      })
    });
    const data10 = await res10.json();
    await assert('10. Reject Item with negative stock (400)', res10.status === 400 && data10.message.includes('negative'));

    // 11. Attempt to create an item with invalid item_type_id
    const res11 = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Monitor',
        item_type_id: 99999,
        purchase_date: '2026-08-25',
        stock_available: 5,
        active: true
      })
    });
    const data11 = await res11.json();
    await assert('11. Reject Item with non-existent item_type_id (400)', res11.status === 400 && data11.message.includes('Invalid item type'));

    // 12. Get all items and verify the item type comes from the JOIN
    const res12 = await fetch(`${BASE_URL}/items`);
    const data12 = await res12.json();
    const joinVerified = data12.data.every(item => item.type_name && (item.type_name === 'Electronics' || item.type_name === 'Furniture'));
    await assert('12. Get all items verifies type_name populated via SQL JOIN', res12.status === 200 && data12.data.length === 3 && joinVerified);

    // 13. Get one item and verify its JOINed type
    const res13 = await fetch(`${BASE_URL}/items/${laptopId}`);
    const data13 = await res13.json();
    await assert('13. Get single item with JOINed type_name', res13.status === 200 && data13.data.name === 'Laptop' && data13.data.type_name === 'Electronics');

    // 14. Update an item (update Chair stock to 18)
    const res14 = await fetch(`${BASE_URL}/items/${chairId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stock_available: 18
      })
    });
    const data14 = await res14.json();
    await assert('14. Update Item stock', res14.status === 200 && data14.data.stock_available === 18);

    // 15. Deactivate an item
    const res15 = await fetch(`${BASE_URL}/items/${chairId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        active: false
      })
    });
    const data15 = await res15.json();
    await assert('15. Deactivate an Item', res15.status === 200 && (data15.data.active === 0 || data15.data.active === false));

    // 16. Attempt to delete an item with no purchase history and verify physical deletion
    // Create temporary item
    const resTempItem = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Temp Item',
        item_type_id: electronicsId,
        purchase_date: '2026-08-25',
        stock_available: 5,
        active: true
      })
    });
    const dataTempItem = await resTempItem.json();
    const tempItemId = dataTempItem.data.id;

    const res16 = await fetch(`${BASE_URL}/items/${tempItemId}`, {
      method: 'DELETE'
    });
    const data16 = await res16.json();
    // Check that it no longer exists
    const resCheck = await fetch(`${BASE_URL}/items/${tempItemId}`);
    await assert('16. Delete Item with no purchase history (Physical deletion)', res16.status === 200 && data16.deleted === true && resCheck.status === 404);

    // Bonus verification: Item with purchase history is deactivated instead of physically deleted
    // Insert a dummy purchase record and purchase_item for Laptop to test Case B
    const [pResult] = await pool.query('INSERT INTO purchases (order_id, purchase_date) VALUES (?, ?)', ['PO-TEST-001', '2026-08-25']);
    await pool.query('INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES (?, ?, ?)', [pResult.insertId, laptopId, 2]);

    const resDeleteWithHistory = await fetch(`${BASE_URL}/items/${laptopId}`, {
      method: 'DELETE'
    });
    const dataDeleteWithHistory = await resDeleteWithHistory.json();

    // Verify Laptop still exists in DB but active = 0
    const resCheckLaptop = await fetch(`${BASE_URL}/items/${laptopId}`);
    const dataCheckLaptop = await resCheckLaptop.json();

    await assert(
      'Bonus: Delete Item with purchase history deactivates item instead of deleting',
      resDeleteWithHistory.status === 200 &&
      dataDeleteWithHistory.deactivated === true &&
      resCheckLaptop.status === 200 &&
      (dataCheckLaptop.data.active === 0 || dataCheckLaptop.data.active === false)
    );

    // Clean up test purchase to restore pristine state
    await pool.query('DELETE FROM purchase_items WHERE purchase_id = ?', [pResult.insertId]);
    await pool.query('DELETE FROM purchases WHERE id = ?', [pResult.insertId]);

    // Restore seed items
    await pool.query('UPDATE items SET active = 1 WHERE id = ?', [laptopId]);
    await pool.query('UPDATE items SET active = 1, stock_available = 15 WHERE id = ?', [chairId]);

    console.log('\n==================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

  } catch (err) {
    console.error('Fatal test error:', err);
  } finally {
    await pool.end();
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTests();
