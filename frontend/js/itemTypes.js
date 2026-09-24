/**
 * Item Types Management Module
 * Handles CRUD operations, associated item counts, and conflict-protected deletion
 */

let itemTypesCache = [];

function initItemTypes() {
  const form = document.getElementById('item-type-form');
  const nameInput = document.getElementById('item-type-name');
  const idInput = document.getElementById('item-type-id');
  const submitBtn = document.getElementById('item-type-submit-btn');
  const cancelBtn = document.getElementById('item-type-cancel-btn');
  const formTitle = document.getElementById('item-type-form-title');

  // Submit Handler (Create or Update)
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const typeName = nameInput.value.trim();
    const typeId = idInput.value;

    if (!typeName) {
      window.showNotification('Item type name is required', 'error');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Saving...';

      if (typeId) {
        // Edit existing type
        const res = await window.api.put(`/item-types/${typeId}`, { type_name: typeName });
        window.showNotification(res.message || 'Item type updated successfully', 'success');
      } else {
        // Create new type
        const res = await window.api.post('/item-types', { type_name: typeName });
        window.showNotification(res.message || 'Item type created successfully', 'success');
      }

      resetItemTypeForm();
      await loadItemTypes();

      // Refresh cross-module dropdowns and dashboard stats
      if (window.loadItemTypeDropdown) window.loadItemTypeDropdown();
      if (window.refreshDashboardStats) window.refreshDashboardStats();

    } catch (err) {
      window.showNotification(err.message || 'Failed to save item type', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = idInput.value ? 'Update Item Type' : 'Save Item Type';
    }
  });

  // Cancel edit handler
  cancelBtn.addEventListener('click', () => {
    resetItemTypeForm();
  });

  // Empty state "+ Add Item Type" focus handler
  const btnFocusAdd = document.getElementById('btn-focus-add-type');
  if (btnFocusAdd) {
    btnFocusAdd.addEventListener('click', () => {
      nameInput.focus();
      nameInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function resetItemTypeForm() {
    idInput.value = '';
    nameInput.value = '';
    submitBtn.textContent = 'Save Item Type';
    cancelBtn.style.display = 'none';
    formTitle.innerHTML = '<span>🏷️</span> Add Item Type';
  }

  // Initial load
  loadItemTypes();
}

async function loadItemTypes() {
  const loadingEl = document.getElementById('item-types-loading');
  const emptyEl = document.getElementById('item-types-empty');
  const tableContainer = document.getElementById('item-types-table-container');
  const tbody = document.getElementById('item-types-table-body');

  try {
    loadingEl.style.display = 'block';
    emptyEl.style.display = 'none';
    tableContainer.style.display = 'none';
    tbody.innerHTML = '';

    // Fetch item types and all items in parallel to count associations
    const [typesRes, itemsRes] = await Promise.all([
      window.api.get('/item-types'),
      window.api.get('/items').catch(() => ({ data: [] }))
    ]);

    const itemTypes = typesRes.data || [];
    const items = itemsRes.data || [];
    itemTypesCache = itemTypes;

    // Update dynamic KPI in Item Types page header
    const kpiEl = document.getElementById('stat-total-types');
    if (kpiEl) kpiEl.textContent = itemTypes.length;

    // Count items per type
    const countMap = {};
    items.forEach(item => {
      const tid = item.item_type_id;
      countMap[tid] = (countMap[tid] || 0) + 1;
    });

    loadingEl.style.display = 'none';

    if (itemTypes.length === 0) {
      emptyEl.style.display = 'block';
      return;
    }

    tableContainer.style.display = 'block';

    itemTypes.forEach(type => {
      const tr = document.createElement('tr');
      const count = countMap[type.id] || 0;
      
      // Singular / Plural formatting with compact badge
      let countBadge = '';
      if (count > 1) {
        countBadge = `<span class="badge badge-active">${count} items</span>`;
      } else if (count === 1) {
        countBadge = `<span class="badge badge-active">1 item</span>`;
      } else {
        countBadge = `<span class="badge badge-inactive">0 items · Unused</span>`;
      }

      tr.innerHTML = `
        <td style="text-align: center;"><strong>#${type.id}</strong></td>
        <td><strong style="color: var(--text-main); font-size: 14px;">${escapeHtml(type.type_name)}</strong></td>
        <td style="text-align: center;">${countBadge}</td>
        <td style="text-align: center;">
          <div class="btn-action-group">
            <button class="btn btn-edit-item btn-sm btn-edit-type" data-id="${type.id}" data-name="${escapeHtml(type.type_name)}" title="Edit Category">
              Edit
            </button>
            <button class="btn btn-delete-item btn-sm btn-delete-type" data-id="${type.id}" data-name="${escapeHtml(type.type_name)}" data-count="${count}" title="Delete Category">
              Delete
            </button>
          </div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Row action listeners
    tbody.querySelectorAll('.btn-edit-type').forEach(btn => {
      btn.addEventListener('click', () => {
        editItemType(btn.getAttribute('data-id'), btn.getAttribute('data-name'));
      });
    });

    tbody.querySelectorAll('.btn-delete-type').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const name = btn.getAttribute('data-name');
        const count = parseInt(btn.getAttribute('data-count'), 10);
        deleteItemType(id, name, count);
      });
    });

  } catch (err) {
    loadingEl.style.display = 'none';
    window.showNotification(err.message || 'Failed to load item types', 'error');
  }
}

function editItemType(id, name) {
  document.getElementById('item-type-id').value = id;
  document.getElementById('item-type-name').value = name;
  document.getElementById('item-type-submit-btn').textContent = 'Update Item Type';
  document.getElementById('item-type-cancel-btn').style.display = 'inline-block';
  document.getElementById('item-type-form-title').innerHTML = `<span>✏️</span> Edit Item Type #${id}`;
  document.getElementById('item-type-name').focus();
}

async function deleteItemType(id, name, count) {
  let warningMessage = `Are you sure you want to delete the item type <strong>"${escapeHtml(name)}"</strong>?`;
  if (count > 0) {
    warningMessage += `<br><br><span style="color: var(--danger-color); font-weight: 600;">Note:</span> This category is currently associated with <strong>${count}</strong> item(s). The backend will block deletion with a conflict error.`;
  }

  const confirmed = await window.customConfirm('Delete Item Type', warningMessage, 'Delete Type', true);
  if (!confirmed) return;

  try {
    const res = await window.api.delete(`/item-types/${id}`);
    window.showNotification(res.message || 'Item type deleted successfully', 'success');
    await loadItemTypes();

    if (window.loadItemTypeDropdown) window.loadItemTypeDropdown();
    if (window.refreshDashboardStats) window.refreshDashboardStats();

  } catch (err) {
    // 409 Conflict displayed clearly to the user
    window.showNotification(err.message || 'Cannot delete item type', 'error');
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

window.initItemTypes = initItemTypes;
window.loadItemTypes = loadItemTypes;
