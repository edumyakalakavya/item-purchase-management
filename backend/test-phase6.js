const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

const pool = require('./config/db');
const app = require('./server');

async function runPhase6Tests() {
  console.log('==================================================');
  console.log('STARTING PHASE 6 TEST SUITE: FULL INTEGRATION WORKFLOW');
  console.log('==================================================\n');

  const BASE_URL = `http://localhost:${process.env.PORT || 5000}/api`;

  let passed = 0;
  let failed = 0;

  async function assert(testNum, testName, condition, details = '') {
    if (condition) {
      console.log(`[PASS] Step ${testNum}: ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] Step ${testNum}: ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Reset / Seed database
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
    await assert(1, 'Reset and seed database cleanly', true);

    // 2. Verify item types
    const resTypes = await fetch(`${BASE_URL}/item-types`);
    const dataTypes = await resTypes.json();
    await assert(
      2,
      'Verify seeded item types (Electronics, Furniture)',
      resTypes.status === 200 && dataTypes.data.length === 2 && dataTypes.data[0].type_name === 'Electronics'
    );

    // 3. Verify items
    const resItems = await fetch(`${BASE_URL}/items`);
    const dataItems = await resItems.json();
    const seededNames = dataItems.data.map(i => i.name);
    await assert(
      3,
      'Verify seeded items (Laptop: 10, Mouse: 20, Chair: 15)',
      resItems.status === 200 &&
      seededNames.includes('Laptop') &&
      seededNames.includes('Mouse') &&
      seededNames.includes('Chair') &&
      dataItems.data.every(i => i.type_name) // JOIN check
    );

    // 4. Create an additional item type (Stationery)
    const resNewType = await fetch(`${BASE_URL}/item-types`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type_name: 'Stationery' })
    });
    const dataNewType = await resNewType.json();
    const stationeryId = dataNewType.data?.id;
    await assert(
      4,
      'Create additional Item Type: Stationery',
      resNewType.status === 201 && dataNewType.data.type_name === 'Stationery'
    );

    // 5. Create an additional item (Notebook under Stationery)
    const resNewItem = await fetch(`${BASE_URL}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Notebook',
        item_type_id: stationeryId,
        purchase_date: '2026-08-25',
        stock_available: 50,
        active: true
      })
    });
    const dataNewItem = await resNewItem.json();
    const notebookId = dataNewItem.data?.id;
    await assert(
      5,
      'Create additional Item: Notebook (Stock: 50, Category: Stationery)',
      resNewItem.status === 201 && dataNewItem.data.name === 'Notebook' && dataNewItem.data.type_name === 'Stationery'
    );

    // 6. Update the item (Rename Notebook to Premium Notebook, stock 55)
    const resUpdateItem = await fetch(`${BASE_URL}/items/${notebookId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Premium Notebook',
        stock_available: 55
      })
    });
    const dataUpdateItem = await resUpdateItem.json();
    await assert(
      6,
      'Update item name and stock (Premium Notebook, Stock: 55)',
      resUpdateItem.status === 200 && dataUpdateItem.data.name === 'Premium Notebook' && dataUpdateItem.data.stock_available === 55
    );

    // 7. Create a purchase containing multiple items (Laptop: 2, Mouse: 5, Chair: 3)
    const resPurchase = await fetch(`${BASE_URL}/purchases`, {
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
    const dataPurchase = await resPurchase.json();
    const purchaseId = dataPurchase.data?.id;
    await assert(
      7,
      'Create multi-item purchase PO-00001 (Laptop: 2, Mouse: 5, Chair: 3)',
      resPurchase.status === 201 && dataPurchase.data.order_id === 'PO-00001'
    );

    // 8. Verify stock deductions (Laptop 10->8, Mouse 20->15, Chair 15->12)
    const [stocksAfterP] = await pool.query('SELECT id, stock_available FROM items ORDER BY id ASC');
    const laptopStock8 = stocksAfterP.find(i => i.id === 1)?.stock_available;
    const mouseStock8 = stocksAfterP.find(i => i.id === 2)?.stock_available;
    const chairStock8 = stocksAfterP.find(i => i.id === 3)?.stock_available;
    await assert(
      8,
      'Verify stock deductions (Laptop: 8, Mouse: 15, Chair: 12)',
      laptopStock8 === 8 && mouseStock8 === 15 && chairStock8 === 12,
      `Laptop=${laptopStock8}, Mouse=${mouseStock8}, Chair=${chairStock8}`
    );

    // 9. Retrieve purchase details and verify the 4-table JOIN fields
    const resDetails = await fetch(`${BASE_URL}/purchases/PO-00001`);
    const dataDetails = await resDetails.json();
    const items = dataDetails.data?.items || [];
    const joinComplete = items.length === 3 && items.every(
      i => i.order_id === 'PO-00001' && i.purchase_date && i.item_id && i.item_name && i.type_name && i.quantity && i.current_stock !== undefined
    );
    await assert(
      9,
      'Verify mandatory 4-table SQL JOIN on purchase details (order_id, date, item_id, item_name, type_name, quantity, stock)',
      resDetails.status === 200 && joinComplete
    );

    // 10. Update purchase quantities upward (Laptop 2 -> 5, diff = +3, stock 8 -> 5)
    const resUpward = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 5 }]
      })
    });
    const dataUpward = await resUpward.json();
    await assert(
      10,
      'Update purchase quantity upward (Laptop: 2 -> 5)',
      resUpward.status === 200 && dataUpward.data.items.find(i => i.item_id === 1).quantity === 5
    );

    // 11. Verify stock decreases by the exact difference (Laptop stock: 8 -> 5)
    const [laptopStockAfterUp] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    await assert(
      11,
      'Verify stock decreased by difference (+3 -> stock 5)',
      laptopStockAfterUp[0].stock_available === 5
    );

    // 12. Update quantities downward (Laptop 5 -> 2, diff = -3, stock 5 -> 8)
    const resDownward = await fetch(`${BASE_URL}/purchases/${purchaseId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [{ item_id: 1, quantity: 2 }]
      })
    });
    const dataDownward = await resDownward.json();
    await assert(
      12,
      'Update purchase quantity downward (Laptop: 5 -> 2)',
      resDownward.status === 200 && dataDownward.data.items.find(i => i.item_id === 1).quantity === 2
    );

    // 13. Verify stock increases by the exact difference (Laptop stock: 5 -> 8)
    const [laptopStockAfterDown] = await pool.query('SELECT stock_available FROM items WHERE id = 1');
    await assert(
      13,
      'Verify stock returned to inventory (-3 -> stock 8)',
      laptopStockAfterDown[0].stock_available === 8
    );

    // 14. Attempt an invalid purchase and verify rollback (Chair has 12, request 100)
    const [chairStockBeforeFail] = await pool.query('SELECT stock_available FROM items WHERE id = 3');
    const resFailedPurchase = await fetch(`${BASE_URL}/purchases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: 'PO-FAIL-ROLLBACK',
        purchase_date: '2026-08-25',
        items: [
          { item_id: 1, quantity: 1 },
          { item_id: 3, quantity: 100 }
        ]
      })
    });
    const [chairStockAfterFail] = await pool.query('SELECT stock_available FROM items WHERE id = 3');
    const [checkFailOrder] = await pool.query('SELECT id FROM purchases WHERE order_id = "PO-FAIL-ROLLBACK"');
    await assert(
      14,
      'Attempt invalid purchase exceeding stock: Transaction rolled back completely',
      resFailedPurchase.status === 400 &&
      chairStockBeforeFail[0].stock_available === chairStockAfterFail[0].stock_available &&
      checkFailOrder.length === 0
    );

    // 15. Delete an unused item (Premium Notebook has no purchases) and verify physical deletion
    const resDeleteUnused = await fetch(`${BASE_URL}/items/${notebookId}`, {
      method: 'DELETE'
    });
    const dataDeleteUnused = await resDeleteUnused.json();
    const [checkUnusedRow] = await pool.query('SELECT id FROM items WHERE id = ?', [notebookId]);
    await assert(
      15,
      'Delete unused item without purchase history: Physically deleted',
      resDeleteUnused.status === 200 && dataDeleteUnused.deleted === true && checkUnusedRow.length === 0
    );

    // 16. Attempt deletion of an item with purchase history (Laptop is in PO-00001)
    const resDeleteHistory = await fetch(`${BASE_URL}/items/1`, {
      method: 'DELETE'
    });
    const dataDeleteHistory = await resDeleteHistory.json();
    const [checkHistoryRow] = await pool.query('SELECT id, active FROM items WHERE id = 1');
    await assert(
      16,
      'Delete item with purchase history: Preserved and deactivated (active = 0)',
      resDeleteHistory.status === 200 &&
      dataDeleteHistory.deactivated === true &&
      checkHistoryRow.length === 1 &&
      (checkHistoryRow[0].active === 0 || checkHistoryRow[0].active === false)
    );

    // 17. Verify purchase remains available and readable after item deactivation
    const resHistoryDetails = await fetch(`${BASE_URL}/purchases/PO-00001`);
    const dataHistoryDetails = await resHistoryDetails.json();
    const laptopStillVisible = dataHistoryDetails.data.items.some(i => i.item_id === 1 && i.item_name === 'Laptop');
    await assert(
      17,
      'Verify historical purchase remains fully readable with deactivated item data',
      resHistoryDetails.status === 200 && laptopStillVisible
    );

    // 18. Verify no purchase DELETE route exists
    const resDeleteRoute = await fetch(`${BASE_URL}/purchases/PO-00001`, {
      method: 'DELETE'
    });
    await assert(
      18,
      'Verify DELETE /api/purchases/:id is strictly prohibited (HTTP 404)',
      resDeleteRoute.status === 404
    );

    // 19. Restore the database to the clean seed state
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
    const [finalTypes] = await pool.query('SELECT COUNT(*) as c FROM item_types');
    const [finalItems] = await pool.query('SELECT COUNT(*) as c FROM items');
    const [finalPurchases] = await pool.query('SELECT COUNT(*) as c FROM purchases');
    await assert(
      19,
      'Restore database to clean seed state (Electronics, Furniture; Laptop: 10, Mouse: 20, Chair: 15; Purchases: 0)',
      finalTypes[0].c === 2 && finalItems[0].c === 3 && finalPurchases[0].c === 0
    );

    console.log('\n==================================================');
    console.log(`PHASE 6 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal Phase 6 test error:', err);
    process.exit(1);
  }
}

runPhase6Tests();
