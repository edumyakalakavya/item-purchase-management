/**
 * Purchases Module
 * Handles multi-item purchase draft builder, stock validation, live summary, and confirmation
 */

let purchaseDraft = [];
let availableItemsCache = [];

function initPurchases() {
  const itemSelect = document.getElementById('purchase-item-select');
  const qtyInput = document.getElementById('purchase-item-qty');
  const btnAdd = document.getElementById('btn-add-to-order');
  const btnSubmit = document.getElementById('btn-submit-purchase');
  const btnClear = document.getElementById('btn-clear-draft');
  const draftError = document.getElementById('purchase-draft-error');
  const dateInput = document.getElementById('purchase-order-date');

  // Set default order date to today
  if (!dateInput.value) {
    dateInput.value = new Date().toISOString().split('T')[0];
  }

  // Populate active items dropdown
  populateItemSelector();

  // Dynamic stock indicator listeners
  if (itemSelect) {
    itemSelect.addEventListener('change', updateStockIndicator);
  }
  if (qtyInput) {
    qtyInput.addEventListener('input', updateStockIndicator);
  }

  // Add Item to Draft Handler
  btnAdd.addEventListener('click', () => {
    draftError.style.display = 'none';

    const selectedId = parseInt(itemSelect.value, 10);
    const qty = parseInt(qtyInput.value, 10);

    if (isNaN(selectedId) || selectedId <= 0) {
      showDraftError('Please select an active item to add to the order');
      return;
    }

    if (isNaN(qty) || qty <= 0) {
      showDraftError('Quantity must be greater than zero');
      return;
    }

    const selectedItem = availableItemsCache.find(i => i.id === selectedId);
    if (!selectedItem) {
      showDraftError('Selected item could not be found');
      return;
    }

    // Check if item is inactive
    if (!selectedItem.active) {
      showDraftError('Item is inactive and cannot be purchased');
      return;
    }

    // Rule: Duplicate item prevention (do not silently merge quantities)
    const existingIndex = purchaseDraft.findIndex(i => i.item_id === selectedId);
    if (existingIndex !== -1) {
      showDraftError(`"${selectedItem.name}" is already in this order. Duplicate items are not allowed in one order.`);
      return;
    }

    // Rule: Quantity must not exceed available stock
    if (qty > selectedItem.stock_available) {
      showDraftError(`Requested quantity (${qty}) exceeds available stock (${selectedItem.stock_available}) for ${selectedItem.name}`);
      return;
    }

    // Append to draft
    purchaseDraft.push({
      item_id: selectedItem.id,
      item_name: selectedItem.name,
      type_name: selectedItem.type_name,
      stock_available: selectedItem.stock_available,
      quantity: qty
    });

    // Reset inputs & refresh UI
    itemSelect.value = '';
    qtyInput.value = '';
    renderDraftTable();
    updatePurchaseSummary();
    updateStockIndicator();
  });

  // Clear Draft Handler
  btnClear.addEventListener('click', () => {
    purchaseDraft = [];
    renderDraftTable();
    updatePurchaseSummary();
    updateStockIndicator();
    draftError.style.display = 'none';
  });

  // Submit Complete Purchase Handler with Confirmation Dialog
  btnSubmit.addEventListener('click', async () => {
    draftError.style.display = 'none';

    const orderIdInput = document.getElementById('purchase-order-id').value.trim();
    const purchaseDate = dateInput.value;

    if (!purchaseDate) {
      showDraftError('Purchase date is required');
      return;
    }

    if (purchaseDraft.length === 0) {
      showDraftError('Purchase must contain at least one item');
      return;
    }

    const totalQty = purchaseDraft.reduce((sum, item) => sum + item.quantity, 0);
    const displayOrderId = orderIdInput || '(Auto-generated)';

    // Custom confirmation modal before submitting
    const confirmed = await window.customConfirm(
      'Confirm Purchase Order',
      `Submit purchase order <strong>${escapeHtml(displayOrderId)}</strong> on <strong>${purchaseDate}</strong>?<br><br>
       <strong>Order Breakdown:</strong><br>
       • Distinct Items: <strong>${purchaseDraft.length}</strong><br>
       • Total Units to Deduct: <strong>${totalQty}</strong>`,
      'Confirm & Create Order',
      false
    );

    if (!confirmed) return;

    const payload = {
      order_id: orderIdInput || undefined,
      purchase_date: purchaseDate,
      items: purchaseDraft.map(line => ({
        item_id: line.item_id,
        quantity: line.quantity
      }))
    };

    try {
      btnSubmit.disabled = true;
      btnSubmit.textContent = 'Creating Purchase...';

      const res = await window.api.post('/purchases', payload);

      window.showNotification(res.message || `Purchase ${res.data.order_id} created successfully!`, 'success');

      // Clear draft on success
      purchaseDraft = [];
      document.getElementById('purchase-order-id').value = '';
      renderDraftTable();
      updatePurchaseSummary();
      updateStockIndicator();

      // Refresh cross-module state & stats
      await populateItemSelector();
      if (window.loadItems) window.loadItems();
      if (window.loadPurchases) window.loadPurchases();
      if (window.refreshDashboardStats) window.refreshDashboardStats();

    } catch (err) {
      // Keep draft on failure so user can adjust quantities
      showDraftError(err.message || 'Failed to submit purchase');
    } finally {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<span>✓</span> Submit Purchase Order';
      updatePurchaseSummary();
    }
  });

  function showDraftError(msg) {
    draftError.textContent = msg;
    draftError.style.display = 'block';
  }

  // Initial table, summary, and indicator rendering
  renderDraftTable();
  updatePurchaseSummary();
  updateStockIndicator();
}

function updateStockIndicator() {
  const indicator = document.getElementById('purchase-stock-indicator');
  const select = document.getElementById('purchase-item-select');
  const qtyInput = document.getElementById('purchase-item-qty');
  if (!indicator || !select) return;

  const selectedId = parseInt(select.value, 10);
  if (isNaN(selectedId) || selectedId <= 0) {
    indicator.className = 'purchase-stock-indicator stock-indicator-none';
    indicator.innerHTML = 'Select an item to view available stock';
    return;
  }

  const item = availableItemsCache.find(i => i.id === selectedId);
  if (!item) {
    indicator.className = 'purchase-stock-indicator stock-indicator-none';
    indicator.innerHTML = 'Select an item to view available stock';
    return;
  }

  const available = item.stock_available;
  const qty = parseInt(qtyInput && qtyInput.value ? qtyInput.value : 0, 10);

  if (available === 0) {
    indicator.className = 'purchase-stock-indicator stock-indicator-exceeded';
    indicator.innerHTML = '<strong>Available:</strong> 0 units (Out of Stock)';
  } else if (qty > available) {
    indicator.className = 'purchase-stock-indicator stock-indicator-exceeded';
    indicator.innerHTML = `<strong>Available:</strong> ${available} units (Requested ${qty} exceeds stock)`;
  } else if (available <= 5) {
    indicator.className = 'purchase-stock-indicator stock-indicator-low';
    indicator.innerHTML = `<strong>Available:</strong> ${available} units (Low Stock)`;
  } else {
    indicator.className = 'purchase-stock-indicator stock-indicator-sufficient';
    indicator.innerHTML = `<strong>Available:</strong> ${available} units`;
  }
}

async function populateItemSelector() {
  const itemSelect = document.getElementById('purchase-item-select');
  if (!itemSelect) return;

  try {
    const res = await window.api.get('/items');
    const items = res.data || [];
    availableItemsCache = items;

    itemSelect.innerHTML = '<option value="">-- Choose an Active Item --</option>';

    // Filter to show ONLY Active items as mandated by assignment
    const activeItems = items.filter(i => i.active);

    activeItems.forEach(item => {
      const opt = document.createElement('option');
      opt.value = item.id;
      opt.textContent = `${item.name} (${item.type_name}) — Stock: ${item.stock_available}`;
      // Disable if out of stock
      if (item.stock_available <= 0) {
        opt.disabled = true;
        opt.textContent += ' [OUT OF STOCK]';
      }
      itemSelect.appendChild(opt);
    });

    updateStockIndicator();

  } catch (err) {
    console.error('Failed to populate purchase items selector:', err);
  }
}

function renderDraftTable() {
  const emptyEl = document.getElementById('purchase-draft-empty');
  const tableContainer = document.getElementById('purchase-draft-table-container');
  const tbody = document.getElementById('purchase-draft-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (purchaseDraft.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'none';
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'block';

  purchaseDraft.forEach((line, index) => {
    const tr = document.createElement('tr');

    // Live status badge for draft line
    let lineBadge = '<span class="badge badge-in-stock">● Available</span>';
    if (line.quantity > line.stock_available) {
      lineBadge = '<span class="badge badge-out-of-stock">✕ Exceeds Stock</span>';
    } else if (line.stock_available - line.quantity <= 3) {
      lineBadge = '<span class="badge badge-low-stock">▲ Near Limit</span>';
    }

    tr.innerHTML = `
      <td style="text-align: center;"><strong>#${line.item_id}</strong></td>
      <td><strong style="color: var(--text-main); font-size: 14px;">${escapeHtml(line.item_name)}</strong></td>
      <td><span class="badge-category">${escapeHtml(line.type_name)}</span></td>
      <td style="text-align: right;"><span class="stock-emphasis">${line.stock_available} units</span></td>
      <td style="text-align: center;">
        <div class="qty-stepper">
          <button type="button" class="qty-stepper-btn btn-qty-dec" data-index="${index}" aria-label="Decrease quantity" ${line.quantity <= 1 ? 'disabled' : ''}>-</button>
          <input type="number" class="qty-stepper-input draft-qty-input" data-index="${index}" value="${line.quantity}" min="1" max="${line.stock_available}" aria-label="Quantity for ${escapeHtml(line.item_name)}">
          <button type="button" class="qty-stepper-btn btn-qty-inc" data-index="${index}" aria-label="Increase quantity" ${line.quantity >= line.stock_available ? 'disabled' : ''}>+</button>
        </div>
      </td>
      <td style="text-align: center;">${lineBadge}</td>
      <td style="text-align: center;">
        <button type="button" class="btn btn-delete-item btn-sm btn-remove-draft" data-index="${index}" title="Remove line">
          Remove
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Quantity stepper dec
  tbody.querySelectorAll('.btn-qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (purchaseDraft[idx].quantity > 1) {
        purchaseDraft[idx].quantity -= 1;
        renderDraftTable();
        updatePurchaseSummary();
      }
    });
  });

  // Quantity stepper inc
  tbody.querySelectorAll('.btn-qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      if (purchaseDraft[idx].quantity < purchaseDraft[idx].stock_available) {
        purchaseDraft[idx].quantity += 1;
        renderDraftTable();
        updatePurchaseSummary();
      } else {
        window.showToast(`Cannot exceed available stock (${purchaseDraft[idx].stock_available}) for ${purchaseDraft[idx].item_name}`, 'warning');
      }
    });
  });

  // Quantity input change
  tbody.querySelectorAll('.draft-qty-input').forEach(input => {
    input.addEventListener('change', () => {
      const idx = parseInt(input.getAttribute('data-index'), 10);
      const val = parseInt(input.value, 10);
      if (isNaN(val) || val <= 0) {
        input.value = purchaseDraft[idx].quantity;
        return;
      }
      purchaseDraft[idx].quantity = val;
      renderDraftTable();
      updatePurchaseSummary();
    });
  });

  // Attach remove buttons
  tbody.querySelectorAll('.btn-remove-draft').forEach(btn => {
    btn.addEventListener('click', () => {
      const index = parseInt(btn.getAttribute('data-index'), 10);
      purchaseDraft.splice(index, 1);
      renderDraftTable();
      updatePurchaseSummary();
    });
  });
}

function updatePurchaseSummary() {
  const uniqueItemsEl = document.getElementById('summary-unique-items');
  const totalQtyEl = document.getElementById('summary-total-qty');
  const impactBadge = document.getElementById('summary-impact-badge');
  const totalDisplay = document.getElementById('summary-total-display');
  const btnSubmit = document.getElementById('btn-submit-purchase');

  if (!uniqueItemsEl || !totalQtyEl) return;

  const totalLines = purchaseDraft.length;
  const totalQty = purchaseDraft.reduce((sum, item) => sum + item.quantity, 0);

  uniqueItemsEl.textContent = totalLines;
  totalQtyEl.textContent = `${totalQty} unit${totalQty === 1 ? '' : 's'}`;
  if (totalDisplay) totalDisplay.textContent = totalQty;

  // Inventory impact validation
  const hasExceeding = purchaseDraft.some(item => item.quantity > item.stock_available);
  if (hasExceeding) {
    impactBadge.className = 'badge badge-out-of-stock';
    impactBadge.textContent = '✕ Stock Exceeded';
  } else if (totalLines > 0) {
    impactBadge.className = 'badge badge-in-stock';
    impactBadge.textContent = '✓ Sufficient Stock';
  } else {
    impactBadge.className = 'badge badge-inactive';
    impactBadge.textContent = 'Draft Empty';
  }

  // Visually & statefully manage Submit button
  if (btnSubmit) {
    btnSubmit.disabled = (totalLines === 0 || hasExceeding);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.initPurchases = initPurchases;
window.populateItemSelector = populateItemSelector;
