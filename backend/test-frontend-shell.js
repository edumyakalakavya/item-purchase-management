const http = require('http');
const path = require('path');
const fs = require('fs');
const vm = require('vm');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
const app = require('./server');

async function testFrontendShell() {
  console.log('==================================================');
  console.log('STARTING PHASE 5A TEST SUITE: FRONTEND SHELL');
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
    // 1. Verify GET / serves index.html
    const resRoot = await fetch(`${BASE_URL}/`);
    const htmlText = await resRoot.text();
    assert(
      '1. Static server delivers index.html at root (HTTP 200)',
      resRoot.status === 200 && htmlText.includes('Item & Purchase Management System'),
      `status=${resRoot.status}`
    );

    // 2. Verify all 4 navigation tabs exist in index.html
    const hasItemMasterTab = htmlText.includes('id="tab-items"') && htmlText.includes('data-tab="items"');
    const hasItemTypesTab = htmlText.includes('id="tab-item-types"') && htmlText.includes('data-tab="item-types"');
    const hasCreatePurchaseTab = htmlText.includes('id="tab-create-purchase"') && htmlText.includes('data-tab="create-purchase"');
    const hasPurchaseHistoryTab = htmlText.includes('id="tab-purchase-history"') && htmlText.includes('data-tab="purchase-history"');

    assert(
      '2. Navigation bar contains all 4 required tab buttons with data-tab attributes',
      hasItemMasterTab && hasItemTypesTab && hasCreatePurchaseTab && hasPurchaseHistoryTab
    );

    // 3. Verify all 4 content sections exist in index.html
    const hasItemMasterSection = htmlText.includes('id="section-items"');
    const hasItemTypesSection = htmlText.includes('id="section-item-types"');
    const hasCreatePurchaseSection = htmlText.includes('id="section-create-purchase"');
    const hasPurchaseHistorySection = htmlText.includes('id="section-purchase-history"');

    assert(
      '3. DOM contains all 4 content sections with matching section IDs',
      hasItemMasterSection && hasItemTypesSection && hasCreatePurchaseSection && hasPurchaseHistorySection
    );

    // 4. Verify CSS delivery
    const resCss = await fetch(`${BASE_URL}/css/styles.css`);
    const cssText = await resCss.text();
    assert(
      '4. Static server delivers CSS stylesheet (HTTP 200)',
      resCss.status === 200 && cssText.includes('--primary-color') && cssText.includes('.nav-tabs'),
      `status=${resCss.status}`
    );

    // 5. Verify JS modules delivery
    const jsFiles = [
      'js/api.js',
      'js/itemTypes.js',
      'js/items.js',
      'js/purchases.js',
      'js/purchaseDetails.js'
    ];

    for (const jsFile of jsFiles) {
      const resJs = await fetch(`${BASE_URL}/${jsFile}`);
      const jsContent = await resJs.text();
      assert(
        `5. Static server delivers ${jsFile} (HTTP 200)`,
        resJs.status === 200 && jsContent.length > 0,
        `status=${resJs.status}`
      );

      // Validate JS syntax without runtime errors
      try {
        new vm.Script(jsContent, { filename: jsFile });
        assert(`   -> Syntax check passed for ${jsFile}`, true);
      } catch (syntaxErr) {
        assert(`   -> Syntax check failed for ${jsFile}`, false, syntaxErr.message);
      }
    }

    // 6. Verify Backend Health check remains functional
    const resHealth = await fetch(`${BASE_URL}/api/health`);
    const healthJson = await resHealth.json();
    assert(
      '6. Health endpoint responds with status OK',
      resHealth.status === 200 && healthJson.status === 'OK'
    );

    console.log('\n==================================================');
    console.log(`PHASE 5A TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('==================================================');

    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error('Fatal test error:', err);
    process.exit(1);
  }
}

testFrontendShell();
