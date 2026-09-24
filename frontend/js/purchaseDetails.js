/**
 * Purchase Details & History Module
 * Handles historical purchase listing, 4-table SQL JOIN inspection, and order quantity updates
 * NOTE: Purchase deletion is strictly prohibited per business requirements.
 */

let currentEditItems = [];
let allPurchasesCache = [];

function initPurchaseDetails() {
  const btnRefresh = document.getElementById('btn-refresh-purchases');
  const editForm = document.getElementById('purchase-edit-form');
  const searchInput = document.getElementById('purchases-search');
  const dateFilter = document.getElementById('purchases-filter-date');
  const btnReset = document.getElementById('btn-reset-purchase-filters');

  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      loadPurchases();
    });
  }

  // Live Search & Filter Event Listeners
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      applyPurchaseFilters();
    });
  }

  if (dateFilter) {
    dateFilter.addEventListener('change', () => {
      applyPurchaseFilters();
    });
    dateFilter.addEventListener('input', () => {
      applyPurchaseFilters();
    });
  }

  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (dateFilter) dateFilter.value = '';
      applyPurchaseFilters();
    });
  }

  // Edit Purchase Form Submit Handler
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const editError = document.getElementById('purchase-edit-error');
      if (editError) editError.style.display = 'none';

      const purchaseId = document.getElementById('edit-purchase-id').value;
      const orderId = document.getElementById('edit-order-id').value;
      const purchaseDate = document.getElementById('edit-purchase-date').value;

      if (!purchaseDate) {
        showEditError('Purchase date is required');
        return;
      }

      // Collect and validate updated line items
      const updatedLines = [];
      const qtyInputs = document.querySelectorAll('.edit-item-qty-input');

      for (const input of qtyInputs) {
        const itemId = parseInt(input.getAttribute('data-item-id'), 10);
        const oldQty = parseInt(input.getAttribute('data-old-qty'), 10);
        const currentStock = parseInt(input.getAttribute('data-stock'), 10);
        const qty = parseInt(input.value, 10);

        if (isNaN(qty) || qty <= 0) {
          showEditError('All quantities must be greater than zero');
          return;
        }

        const diff = qty - oldQty;
        if (diff > currentStock) {
          showEditError(`Cannot increase quantity by ${diff}; exceeds current available stock of ${currentStock}.`);
          return;
        }

        updatedLines.push({
          item_id: itemId,
          quantity: qty
        });
      }

      const proceedWithUpdate = async () => {
        const payload = {
          purchase_date: purchaseDate,
          items: updatedLines
        };

        const saveBtn = document.getElementById('btn-save-purchase-edit');
        const originalText = saveBtn ? saveBtn.innerHTML : 'Save Changes';
        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Saving...';
        }

        try {
          const res = await window.api.put(`/purchases/${purchaseId}`, payload);
          window.showNotification(res.message || 'Purchase updated and stock adjusted successfully!', 'success');

          window.closeModal('purchase-edit-modal');

          // Refresh all synchronized views
          await loadPurchases();
          if (window.loadItems) window.loadItems();
          if (window.populateItemSelector) window.populateItemSelector();
          if (window.refreshDashboardStats) window.refreshDashboardStats();

        } catch (err) {
          showEditError(err.message || 'Failed to update purchase');
        } finally {
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalText;
          }
        }
      };

      // Ask for confirmation before executing atomic stock adjustment
      if (window.customConfirm) {
        const confirmed = await window.customConfirm(
          'Confirm Order Update',
          `Are you sure you want to update order <strong>"${escapeHtml(orderId)}"</strong>?<br><br>
           <small style="color: var(--text-muted);">
             Item stocks will be adjusted atomically according to <code>difference = new_quantity - old_quantity</code>.
           </small>`,
          'Update Order',
          false
        );
        if (!confirmed) return;
      }

      await proceedWithUpdate();
    });
  }

  function showEditError(msg) {
    const editError = document.getElementById('purchase-edit-error');
    if (editError) {
      editError.textContent = msg;
      editError.style.display = 'block';
    }
  }

  // Initial load
  loadPurchases();
}

async function loadPurchases() {
  const loadingEl = document.getElementById('purchases-loading');
  const emptyEl = document.getElementById('purchases-empty');
  const tableContainer = document.getElementById('purchases-table-container');
  const tbody = document.getElementById('purchases-table-body');

  try {
    if (loadingEl) loadingEl.style.display = 'block';
    if (emptyEl) emptyEl.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'none';
    if (tbody) tbody.innerHTML = '';

    const res = await window.api.get('/purchases');
    allPurchasesCache = res.data || [];

    if (loadingEl) loadingEl.style.display = 'none';

    // Update Section Mini-Statistics
    updateHistoryMiniStats(allPurchasesCache);

    // Apply any active filters and render
    applyPurchaseFilters();

    // Also sync global dashboard stats
    if (window.refreshDashboardStats) {
      window.refreshDashboardStats();
    }

  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    window.showNotification(err.message || 'Failed to load purchase history', 'error');
  }
}

function updateHistoryMiniStats(purchases) {
  const ordersEl = document.getElementById('history-stat-orders');
  const unitsEl = document.getElementById('history-stat-units');
  const latestEl = document.getElementById('history-stat-latest');
  const latestDateEl = document.getElementById('history-stat-latest-date');

  if (ordersEl) ordersEl.textContent = purchases.length;

  if (unitsEl) {
    const totalUnits = purchases.reduce((sum, p) => sum + (parseInt(p.total_quantity, 10) || 0), 0);
    unitsEl.textContent = totalUnits.toLocaleString();
  }

  if (latestEl) {
    latestEl.textContent = purchases.length > 0 ? purchases[0].order_id : '-';
  }

  if (latestDateEl) {
    latestDateEl.textContent = purchases.length > 0 ? (purchases[0].purchase_date || 'Date N/A') : 'No purchases yet';
  }
}

function applyPurchaseFilters() {
  const searchInput = document.getElementById('purchases-search');
  const dateFilter = document.getElementById('purchases-filter-date');
  const emptyEl = document.getElementById('purchases-empty');
  const tableContainer = document.getElementById('purchases-table-container');
  const tbody = document.getElementById('purchases-table-body');

  if (!tbody) return;

  const search = (searchInput?.value || '').trim().toLowerCase();
  const date = (dateFilter?.value || '').trim();

  const filtered = allPurchasesCache.filter(p => {
    const matchesSearch = !search || (p.order_id && p.order_id.toLowerCase().includes(search));
    const matchesDate = !date || (p.purchase_date && p.purchase_date.startsWith(date));
    return matchesSearch && matchesDate;
  });

  if (allPurchasesCache.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    if (tableContainer) tableContainer.style.display = 'none';
    tbody.innerHTML = '';
    return;
  }

  if (filtered.length === 0) {
    if (emptyEl) emptyEl.style.display = 'none';
    if (tableContainer) tableContainer.style.display = 'block';
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="state-message">
          No purchases match your search or date filter.
          <button type="button" class="btn btn-secondary btn-sm" id="btn-clear-inner-purchases" style="margin-left: 8px;">Reset Filters</button>
        </td>
      </tr>
    `;
    const clearBtn = document.getElementById('btn-clear-inner-purchases');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        if (dateFilter) dateFilter.value = '';
        applyPurchaseFilters();
      });
    }
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';
  if (tableContainer) tableContainer.style.display = 'block';
  tbody.innerHTML = '';

  filtered.forEach(p => {
    const tr = document.createElement('tr');
    const createdAt = p.created_at ? new Date(p.created_at).toLocaleString() : '-';

    tr.innerHTML = `
      <td><strong>📦 ${escapeHtml(p.order_id)}</strong></td>
      <td>${p.purchase_date || '-'}</td>
      <td><span class="badge" style="background: #f1f5f9; color: var(--text-main); font-weight: 600;">${p.item_count} distinct item(s)</span></td>
      <td style="text-align: right;"><strong>${p.total_quantity} units</strong></td>
      <td style="font-size: 13px; color: var(--text-muted);">${createdAt}</td>
      <td style="text-align: center;">
        <div class="btn-action-group">
          <button class="btn btn-secondary btn-sm btn-view-purchase" data-id="${p.id}" data-order="${escapeHtml(p.order_id)}">View Details</button>
          <button class="btn btn-secondary btn-sm btn-edit-purchase" data-id="${p.id}" data-order="${escapeHtml(p.order_id)}">Edit Order</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach Row Action Listeners
  tbody.querySelectorAll('.btn-view-purchase').forEach(btn => {
    btn.addEventListener('click', () => {
      openPurchaseDetails(btn.getAttribute('data-order') || btn.getAttribute('data-id'));
    });
  });

  tbody.querySelectorAll('.btn-edit-purchase').forEach(btn => {
    btn.addEventListener('click', () => {
      openEditPurchase(btn.getAttribute('data-order') || btn.getAttribute('data-id'));
    });
  });
}

async function openPurchaseDetails(identifier) {
  try {
    const res = await window.api.get(`/purchases/${identifier}`);
    const purchase = res.data;
    if (!purchase) return;

    document.getElementById('purchase-details-title').textContent = `Purchase Details: ${purchase.order_id}`;

    const items = purchase.items || [];
    const totalQty = items.reduce((sum, item) => sum + (parseInt(item.quantity, 10) || 0), 0);

    const headerContainer = document.getElementById('purchase-details-header');
    headerContainer.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">Order ID</div>
        <div class="detail-value" style="color: var(--primary-color);">📦 ${escapeHtml(purchase.order_id)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Purchase Date</div>
        <div class="detail-value">${purchase.purchase_date || '-'}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Distinct Lines</div>
        <div class="detail-value">${items.length} items</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Total Units Ordered</div>
        <div class="detail-value">${totalQty} units</div>
      </div>
    `;

    const tbody = document.getElementById('purchase-details-items-body');
    tbody.innerHTML = '';

    items.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><code>#${item.item_id}</code></td>
        <td><strong>${escapeHtml(item.item_name)}</strong></td>
        <td><span class="badge" style="background: #f1f5f9; color: var(--text-main);">${escapeHtml(item.type_name)}</span></td>
        <td style="text-align: right;"><strong style="font-size: 14px;">${item.quantity}</strong></td>
        <td style="text-align: right;"><span class="badge badge-in-stock">${item.current_stock} units available</span></td>
      `;
      tbody.appendChild(tr);
    });

    window.openModal('purchase-details-modal');

  } catch (err) {
    window.showNotification(err.message || 'Failed to view purchase details', 'error');
  }
}

async function openEditPurchase(identifier) {
  try {
    const res = await window.api.get(`/purchases/${identifier}`);
    const purchase = res.data;
    if (!purchase) return;

    document.getElementById('edit-purchase-id').value = purchase.id;
    document.getElementById('edit-order-id').value = purchase.order_id;
    document.getElementById('edit-purchase-date').value = purchase.purchase_date || '';
    const editError = document.getElementById('purchase-edit-error');
    if (editError) editError.style.display = 'none';

    currentEditItems = purchase.items || [];

    const tbody = document.getElementById('purchase-edit-items-body');
    tbody.innerHTML = '';

    currentEditItems.forEach(item => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${escapeHtml(item.item_name)}</strong></td>
        <td><span class="badge" style="background: #f1f5f9; color: var(--text-main);">${escapeHtml(item.type_name)}</span></td>
        <td style="text-align: right;">${item.current_stock} units</td>
        <td style="text-align: right;"><strong>${item.quantity}</strong></td>
        <td style="text-align: center;">
          <div class="qty-stepper">
            <button type="button" class="qty-stepper-btn btn-edit-minus" data-item-id="${item.item_id}">−</button>
            <input type="number" 
                   class="edit-item-qty-input qty-stepper-input" 
                   data-item-id="${item.item_id}" 
                   data-old-qty="${item.quantity}" 
                   data-stock="${item.current_stock}"
                   value="${item.quantity}" 
                   min="1">
            <button type="button" class="qty-stepper-btn btn-edit-plus" data-item-id="${item.item_id}">+</button>
          </div>
        </td>
        <td>
          <span class="delta-badge none" id="delta-${item.item_id}">
            No change (0)
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach Stepper Button Listeners
    tbody.querySelectorAll('.btn-edit-minus').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.getAttribute('data-item-id');
        const input = tbody.querySelector(`.edit-item-qty-input[data-item-id="${itemId}"]`);
        if (input) {
          const currentVal = parseInt(input.value, 10) || 1;
          if (currentVal > 1) {
            input.value = currentVal - 1;
            updateDeltaDisplay(input);
          }
        }
      });
    });

    tbody.querySelectorAll('.btn-edit-plus').forEach(btn => {
      btn.addEventListener('click', () => {
        const itemId = btn.getAttribute('data-item-id');
        const input = tbody.querySelector(`.edit-item-qty-input[data-item-id="${itemId}"]`);
        if (input) {
          const currentVal = parseInt(input.value, 10) || 0;
          input.value = currentVal + 1;
          updateDeltaDisplay(input);
        }
      });
    });

    // Attach direct input event listeners
    tbody.querySelectorAll('.edit-item-qty-input').forEach(input => {
      input.addEventListener('input', () => {
        updateDeltaDisplay(input);
      });
    });

    window.openModal('purchase-edit-modal');

  } catch (err) {
    window.showNotification(err.message || 'Failed to fetch purchase for editing', 'error');
  }
}

function updateDeltaDisplay(input) {
  const itemId = input.getAttribute('data-item-id');
  const oldQty = parseInt(input.getAttribute('data-old-qty'), 10);
  const currentStock = parseInt(input.getAttribute('data-stock'), 10);
  const newQty = parseInt(input.value, 10);
  const deltaLabel = document.getElementById(`delta-${itemId}`);

  if (!deltaLabel) return;

  if (isNaN(newQty) || newQty <= 0) {
    deltaLabel.className = 'delta-badge deduct';
    deltaLabel.textContent = 'Invalid quantity';
    return;
  }

  const diff = newQty - oldQty;

  if (diff > 0) {
    if (diff > currentStock) {
      deltaLabel.className = 'delta-badge deduct';
      deltaLabel.textContent = `+${diff} (Exceeds stock of ${currentStock}!)`;
    } else {
      deltaLabel.className = 'delta-badge deduct';
      deltaLabel.textContent = `+${diff} (Deduct ${diff} from stock)`;
    }
  } else if (diff < 0) {
    const returnAmount = Math.abs(diff);
    deltaLabel.className = 'delta-badge return';
    deltaLabel.textContent = `${diff} (Return ${returnAmount} to stock)`;
  } else {
    deltaLabel.className = 'delta-badge none';
    deltaLabel.textContent = 'No change (0)';
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

window.initPurchaseDetails = initPurchaseDetails;
window.loadPurchases = loadPurchases;
window.openPurchaseDetails = openPurchaseDetails;
window.openEditPurchase = openEditPurchase;
