const fs = require('fs');
const path = require('path');
const vm = require('vm');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
const app = require('./server');

async function testPhase5B() {
  console.log('==================================================');
  console.log('STARTING PHASE 5B TEST SUITE: COMPLETE FRONTEND');
  console.log('==================================================\n');

  const BASE_URL = `http://localhost:${process.env.PORT || 5000}`;
  let passed = 0;
  let failed = 0;

  function assert(testName, condition, details = '') {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} - ${details}`);
      failed++;
    }
  }

  try {
    // 1. Syntax check on all frontend JavaScript modules
    const jsFiles = [
      '../frontend/js/api.js',
      '../frontend/js/itemTypes.js',
      '../frontend/js/items.js',
      '../frontend/js/purchases.js',
      '../frontend/js/purchaseDetails.js'
    ];

    for (const relPath of jsFiles) {
      const fullPath = path.join(__dirname, relPath);
      const code = fs.readFileSync(fullPath, 'utf8');

      try {
        new vm.Script(code, { filename: path.basename(relPath) });
        assert(`1. Syntax validity: ${path.basename(relPath)}`, true);
      } catch (err) {
        assert(`1. Syntax validity: ${path.basename(relPath)}`, false, err.message);
      }
    }

    // 2. Fetch index.html over HTTP from the server
    const resHtml = await fetch(`${BASE_URL}/`);
    const html = await resHtml.text();

    assert('2. Server serves index.html at root (HTTP 200)', resHtml.status === 200);

    // 3. Check Item Type UI elements
    const hasItemTypeForm = html.includes('id="item-type-form"');
    const hasItemTypeName = html.includes('id="item-type-name"');
    const hasItemTypesTable = html.includes('id="item-types-table-body"');
    assert('3. Item Type UI components present (form, input, table body)', hasItemTypeForm && hasItemTypeName && hasItemTypesTable);

    // 4. Check Item Master UI elements
    const hasItemModal = html.includes('id="item-modal"');
    const hasItemForm = html.includes('id="item-form"');
    const hasItemTypeSelect = html.includes('id="item-type-select"');
    const hasItemStock = html.includes('id="item-stock"');
    const hasItemStatus = html.includes('id="item-status"');
    const hasItemsTable = html.includes('id="items-table-body"');
    const hasItemDetailsModal = html.includes('id="item-details-modal"');
    assert(
      '4. Item Master UI components present (modal, form, select, stock, table, details)',
      hasItemModal && hasItemForm && hasItemTypeSelect && hasItemStock && hasItemStatus && hasItemsTable && hasItemDetailsModal
    );

    // 5. Check Create Purchase UI elements
    const hasPurchaseOrderId = html.includes('id="purchase-order-id"');
    const hasPurchaseDate = html.includes('id="purchase-order-date"');
    const hasPurchaseItemSelect = html.includes('id="purchase-item-select"');
    const hasPurchaseItemQty = html.includes('id="purchase-item-qty"');
    const hasBtnAddToOrder = html.includes('id="btn-add-to-order"');
    const hasDraftTable = html.includes('id="purchase-draft-table-body"');
    const hasBtnSubmitPurchase = html.includes('id="btn-submit-purchase"');
    assert(
      '5. Create Purchase UI components present (header inputs, line selector, draft table, submit button)',
      hasPurchaseOrderId && hasPurchaseDate && hasPurchaseItemSelect && hasPurchaseItemQty && hasBtnAddToOrder && hasDraftTable && hasBtnSubmitPurchase
    );

    // 6. Check Purchase History & Details UI elements
    const hasPurchasesTable = html.includes('id="purchases-table-body"');
    const hasPurchaseDetailsModal = html.includes('id="purchase-details-modal"');
    const hasPurchaseEditModal = html.includes('id="purchase-edit-modal"');
    assert(
      '6. Purchase History & Details UI components present (history table, view modal, edit modal)',
      hasPurchasesTable && hasPurchaseDetailsModal && hasPurchaseEditModal
    );

    // 7. Verify NO Purchase Delete button exists anywhere in HTML or JavaScript
    const hasDeletePurchaseInHtml = html.toLowerCase().includes('delete purchase') || html.toLowerCase().includes('btn-delete-purchase');
    const purchaseDetailsCode = fs.readFileSync(path.join(__dirname, '../frontend/js/purchaseDetails.js'), 'utf8');
    const purchasesCode = fs.readFileSync(path.join(__dirname, '../frontend/js/purchases.js'), 'utf8');
    const hasDeletePurchaseInJs = purchaseDetailsCode.includes('api.delete(`/purchases') || purchasesCode.includes('api.delete(`/purchases');

    assert(
      '7. Strictly verified NO Purchase Delete button or API call exists (Prohibited by assignment)',
      !hasDeletePurchaseInHtml && !hasDeletePurchaseInJs
    );

    // 8. Verify API endpoint references in frontend JS
    const itemTypesCode = fs.readFileSync(path.join(__dirname, '../frontend/js/itemTypes.js'), 'utf8');
    const itemsCode = fs.readFileSync(path.join(__dirname, '../frontend/js/items.js'), 'utf8');

    const usesItemTypesGet = itemTypesCode.includes("api.get('/item-types')");
    const usesItemTypesPost = itemTypesCode.includes("api.post('/item-types'");
    const usesItemTypesPut = itemTypesCode.includes("api.put(`/item-types/");
    const usesItemTypesDelete = itemTypesCode.includes("api.delete(`/item-types/");

    const usesItemsGet = itemsCode.includes("api.get('/items')");
    const usesItemsGetId = itemsCode.includes("api.get(`/items/");
    const usesItemsPost = itemsCode.includes("api.post('/items'");
    const usesItemsPut = itemsCode.includes("api.put(`/items/");
    const usesItemsDelete = itemsCode.includes("api.delete(`/items/");

    const usesPurchasesGet = purchaseDetailsCode.includes("api.get('/purchases')");
    const usesPurchasesGetId = purchaseDetailsCode.includes("api.get(`/purchases/");
    const usesPurchasesPost = purchasesCode.includes("api.post('/purchases'");
    const usesPurchasesPut = purchaseDetailsCode.includes("api.put(`/purchases/");

    assert(
      '8. Verified all required REST API endpoints are referenced in frontend JavaScript',
      usesItemTypesGet && usesItemTypesPost && usesItemTypesPut && usesItemTypesDelete &&
      usesItemsGet && usesItemsGetId && usesItemsPost && usesItemsPut && usesItemsDelete &&
      usesPurchasesGet && usesPurchasesGetId && usesPurchasesPost && usesPurchasesPut
    );

    console.log('\n==================================================');
    console.log(`PHASE 5B TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

testPhase5B();
