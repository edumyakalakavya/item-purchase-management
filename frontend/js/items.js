/**
 * Item Master Management Module
 * Handles inventory CRUD, live search & multi-criteria filtering, stock indicators, and custom confirmation
 */

let allItemsCache = [];

function initItems() {
  const btnOpenAdd = document.getElementById('btn-open-add-item');
  const itemForm = document.getElementById('item-form');
  const formError = document.getElementById('item-form-error');

  // Filter toolbar inputs
  const searchInput = document.getElementById('items-search');
  const filterType = document.getElementById('items-filter-type');
  const filterStatus = document.getElementById('items-filter-status');
  const filterAvail = document.getElementById('items-filter-avail');
  const btnResetFilters = document.getElementById('btn-reset-item-filters');

  // Open "Add Item" modal
  btnOpenAdd.addEventListener('click', () => {
    resetItemForm();
    document.getElementById('item-modal-title').textContent = 'Add New Item';
    loadItemTypeDropdown();
    window.openModal('item-modal');
  });

  // Filter & Search Event Listeners
  if (searchInput) searchInput.addEventListener('input', applyItemFilters);
  if (filterType) filterType.addEventListener('change', applyItemFilters);
  if (filterStatus) filterStatus.addEventListener('change', applyItemFilters);
  if (filterAvail) filterAvail.addEventListener('change', applyItemFilters);

  if (btnResetFilters) {
    btnResetFilters.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterType) filterType.value = '';
      if (filterStatus) filterStatus.value = '';
      if (filterAvail) filterAvail.value = '';
      applyItemFilters();
    });
  }

  const emptyResetBtn = document.getElementById('btn-reset-filters-empty');
  if (emptyResetBtn) {
    emptyResetBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      if (filterType) filterType.value = '';
      if (filterStatus) filterStatus.value = '';
      if (filterAvail) filterAvail.value = '';
      applyItemFilters();
    });
  }

  // Submit Item Form (Create or Update)
  itemForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    formError.style.display = 'none';

    const itemId = document.getElementById('item-id').value;
    const name = document.getElementById('item-name').value.trim();
    const typeId = document.getElementById('item-type-select').value;
    const purchaseDate = document.getElementById('item-date').value;
    const stockAvailable = document.getElementById('item-stock').value;
    const active = document.getElementById('item-status').value === '1';

    // Client-side validations
    if (!name) {
      showFormError('Item name is required');
      return;
    }
    if (!typeId) {
      showFormError('Please select a category / item type');
      return;
    }
    if (!purchaseDate) {
      showFormError('Purchase date is required');
      return;
    }
    if (stockAvailable === '' || isNaN(parseInt(stockAvailable, 10)) || parseInt(stockAvailable, 10) < 0) {
      showFormError('Stock cannot be negative');
      return;
    }

    const payload = {
      name,
      item_type_id: parseInt(typeId, 10),
      purchase_date: purchaseDate,
      stock_available: parseInt(stockAvailable, 10),
      active
    };

    const saveBtn = document.getElementById('btn-save-item');

    try {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';

      if (itemId) {
        // Update existing item
        const res = await window.api.put(`/items/${itemId}`, payload);
        window.showNotification(res.message || 'Item updated successfully', 'success');
      } else {
        // Create new item
        const res = await window.api.post('/items', payload);
        window.showNotification(res.message || 'Item created successfully', 'success');
      }

      window.closeModal('item-modal');
      await loadItems();

      // Refresh cross-module state
      if (window.populateItemSelector) window.populateItemSelector();
      if (window.refreshDashboardStats) window.refreshDashboardStats();

    } catch (err) {
      showFormError(err.message || 'Failed to save item');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Item';
    }
  });

  function showFormError(msg) {
    formError.textContent = msg;
    formError.style.display = 'block';
  }

  function resetItemForm() {
    document.getElementById('item-id').value = '';
    document.getElementById('item-name').value = '';
    document.getElementById('item-type-select').value = '';
    document.getElementById('item-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('item-stock').value = '0';
    document.getElementById('item-status').value = '1';
    formError.style.display = 'none';
  }

  // Initial load
  loadItems();
  loadItemTypeDropdown();
}

async function loadItemTypeDropdown(selectedId = null) {
  const select = document.getElementById('item-type-select');
  const filterSelect = document.getElementById('items-filter-type');
  if (!select) return;

  try {
    const res = await window.api.get('/item-types');
    const types = res.data || [];

    // Populate modal select
    select.innerHTML = '<option value="">-- Select Item Type --</option>';
    types.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.type_name;
      if (selectedId && String(t.id) === String(selectedId)) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    // Populate toolbar filter select if available
    if (filterSelect) {
      const currentVal = filterSelect.value;
      filterSelect.innerHTML = '<option value="">All Categories</option>';
      types.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = t.type_name;
        if (currentVal && String(t.id) === String(currentVal)) {
          opt.selected = true;
        }
        filterSelect.appendChild(opt);
      });
    }

  } catch (err) {
    console.error('Failed to load item types dropdown:', err);
  }
}

async function loadItems() {
  const loadingEl = document.getElementById('items-loading');
  const emptyEl = document.getElementById('items-empty');
  const tableContainer = document.getElementById('items-table-container');

  try {
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    tableContainer.style.display = 'none';

    const res = await window.api.get('/items');
    allItemsCache = res.data || [];

    loadingEl.style.display = 'none';

    applyItemFilters();

  } catch (err) {
    loadingEl.style.display = 'none';
    window.showNotification(err.message || 'Failed to load items', 'error');
  }
}

function applyItemFilters() {
  const searchInput = document.getElementById('items-search');
  const filterType = document.getElementById('items-filter-type');
  const filterStatus = document.getElementById('items-filter-status');
  const filterAvail = document.getElementById('items-filter-avail');

  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const typeId = filterType ? filterType.value : '';
  const statusVal = filterStatus ? filterStatus.value : '';
  const availVal = filterAvail ? filterAvail.value : '';

  let filtered = allItemsCache.filter(item => {
    // 1. Text Search (name or category)
    if (searchTerm) {
      const nameMatch = item.name && item.name.toLowerCase().includes(searchTerm);
      const typeMatch = item.type_name && item.type_name.toLowerCase().includes(searchTerm);
      if (!nameMatch && !typeMatch) return false;
    }

    // 2. Type Filter
    if (typeId && String(item.item_type_id) !== String(typeId)) {
      return false;
    }

    // 3. Status Filter (Active / Inactive)
    if (statusVal !== '') {
      const isActive = item.active === 1 || item.active === true;
      if (statusVal === '1' && !isActive) return false;
      if (statusVal === '0' && isActive) return false;
    }

    // 4. Availability Filter
    if (availVal === 'in' && item.stock_available <= 5) return false;
    if (availVal === 'low' && (item.stock_available <= 0 || item.stock_available > 5)) return false;
    if (availVal === 'out' && item.stock_available !== 0) return false;

    return true;
  });

  renderItemsTable(filtered);
}

function renderItemsTable(items) {
  const emptyEl = document.getElementById('items-empty');
  const tableContainer = document.getElementById('items-table-container');
  const tbody = document.getElementById('items-table-body');

  tbody.innerHTML = '';

  if (items.length === 0) {
    tableContainer.style.display = 'none';
    emptyEl.style.display = 'block';
    return;
  }

  emptyEl.style.display = 'none';
  tableContainer.style.display = 'block';

  items.forEach(item => {
    const tr = document.createElement('tr');

    // Availability Badge with Icon
    let availBadge = '';
    if (item.stock_available > 5) {
      availBadge = '<span class="badge badge-in-stock">● In Stock</span>';
    } else if (item.stock_available > 0 && item.stock_available <= 5) {
      availBadge = '<span class="badge badge-low-stock">▲ Low Stock</span>';
    } else {
      availBadge = '<span class="badge badge-out-of-stock">✕ Out of Stock</span>';
    }

    // Status Badge
    const statusBadge = (item.active === 1 || item.active === true)
      ? '<span class="badge badge-active">● Active</span>'
      : '<span class="badge badge-inactive">○ Inactive</span>';

    tr.innerHTML = `
      <td><strong>#${item.id}</strong></td>
      <td><strong style="color: var(--text-main); font-size: 14px;">${escapeHtml(item.name)}</strong></td>
      <td><span class="badge badge-category">${escapeHtml(item.type_name)}</span></td>
      <td>${item.purchase_date || '-'}</td>
      <td style="text-align: right;"><strong class="stock-emphasis">${item.stock_available} units</strong></td>
      <td>${availBadge}</td>
      <td>${statusBadge}</td>
      <td style="text-align: center;">
        <div class="btn-action-group">
          <button class="btn btn-view-item btn-sm" data-id="${item.id}" title="View Details">View</button>
          <button class="btn btn-edit-item btn-sm" data-id="${item.id}" title="Edit Item">Edit</button>
          <button class="btn btn-delete-item btn-sm" data-id="${item.id}" data-name="${escapeHtml(item.name)}" title="Delete Item">Delete</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // Attach action buttons
  tbody.querySelectorAll('.btn-view-item').forEach(btn => {
    btn.addEventListener('click', () => viewItemDetails(btn.getAttribute('data-id')));
  });

  tbody.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => openEditItem(btn.getAttribute('data-id')));
  });

  tbody.querySelectorAll('.btn-delete-item').forEach(btn => {
    btn.addEventListener('click', () => deleteItem(btn.getAttribute('data-id'), btn.getAttribute('data-name')));
  });
}

async function viewItemDetails(id) {
  try {
    const res = await window.api.get(`/items/${id}`);
    const item = res.data;
    if (!item) return;

    let availBadge = '';
    if (item.stock_available > 5) {
      availBadge = '<span class="badge badge-in-stock">● In Stock</span>';
    } else if (item.stock_available > 0 && item.stock_available <= 5) {
      availBadge = '<span class="badge badge-low-stock">▲ Low Stock</span>';
    } else {
      availBadge = '<span class="badge badge-out-of-stock">✕ Out of Stock</span>';
    }

    const statusBadge = (item.active === 1 || item.active === true)
      ? '<span class="badge badge-active">● Active</span>'
      : '<span class="badge badge-inactive">○ Inactive</span>';

    const container = document.getElementById('item-details-content');
    container.innerHTML = `
      <div class="detail-item">
        <div class="detail-label">Item Identifier</div>
        <div class="detail-value">#${item.id}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Item Name</div>
        <div class="detail-value">${escapeHtml(item.name)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Category (Joined)</div>
        <div class="detail-value">${escapeHtml(item.type_name)}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Purchase Date</div>
        <div class="detail-value">${item.purchase_date || '-'}</div>
      </div>
      <div class="detail-item" style="background: var(--primary-light); border-color: var(--primary-border);">
        <div class="detail-label" style="color: var(--primary-color);">Current Stock Available</div>
        <div class="detail-value" style="font-size: 24px; color: var(--primary-color);">${item.stock_available} units</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Availability Status</div>
        <div class="detail-value">${availBadge}</div>
      </div>
      <div class="detail-item">
        <div class="detail-label">Record Status</div>
        <div class="detail-value">${statusBadge}</div>
      </div>
    `;

    window.openModal('item-details-modal');
  } catch (err) {
    window.showNotification(err.message || 'Failed to load item details', 'error');
  }
}

async function openEditItem(id) {
  try {
    const res = await window.api.get(`/items/${id}`);
    const item = res.data;
    if (!item) return;

    document.getElementById('item-modal-title').textContent = `Edit Item #${item.id}`;
    document.getElementById('item-id').value = item.id;
    document.getElementById('item-name').value = item.name;
    document.getElementById('item-date').value = item.purchase_date || '';
    document.getElementById('item-stock').value = item.stock_available;
    document.getElementById('item-status').value = item.active ? '1' : '0';

    await loadItemTypeDropdown(item.item_type_id);

    document.getElementById('item-form-error').style.display = 'none';
    window.openModal('item-modal');
  } catch (err) {
    window.showNotification(err.message || 'Failed to fetch item for editing', 'error');
  }
}

async function deleteItem(id, name) {
  const confirmed = await window.customConfirm(
    'Delete Item',
    `Are you sure you want to delete <strong>"${escapeHtml(name)}"</strong>?<br><br>
     <small style="color: var(--text-muted);">
       If this item has already been referenced in historical purchase orders, 
       it will be preserved and marked <strong>Inactive</strong> to protect historical audit records.
     </small>`,
    'Delete Item',
    true
  );

  if (!confirmed) return;

  try {
    const res = await window.api.delete(`/items/${id}`);

    if (res.deactivated) {
      window.showNotification(res.message, 'warning');
    } else {
      window.showNotification(res.message || 'Item deleted successfully', 'success');
    }

    await loadItems();

    if (window.populateItemSelector) window.populateItemSelector();
    if (window.refreshDashboardStats) window.refreshDashboardStats();

  } catch (err) {
    window.showNotification(err.message || 'Failed to delete item', 'error');
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

window.initItems = initItems;
window.loadItems = loadItems;
window.loadItemTypeDropdown = loadItemTypeDropdown;
