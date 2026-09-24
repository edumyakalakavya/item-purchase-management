const pool = require('../config/db');

/**
 * Controller for Items
 */

// Helper to validate and format ISO date YYYY-MM-DD
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// GET /api/items
// Retrieves items with their category type_name using SQL JOIN
exports.getAllItems = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        i.id, 
        i.name, 
        it.type_name, 
        i.item_type_id,
        DATE_FORMAT(i.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.stock_available, 
        i.active 
      FROM items i 
      JOIN item_types it ON i.item_type_id = it.id 
      ORDER BY i.id ASC;
    `;
    const [rows] = await pool.query(query);

    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/items/:id
// Retrieves a single item joined with its item type
exports.getItemById = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID'
      });
    }

    const query = `
      SELECT 
        i.id, 
        i.name, 
        it.type_name, 
        i.item_type_id,
        DATE_FORMAT(i.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.stock_available, 
        i.active 
      FROM items i 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE i.id = ?;
    `;
    const [rows] = await pool.query(query, [id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: rows[0]
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/items
// Creates a new item with mandatory validations
exports.createItem = async (req, res, next) => {
  try {
    let { name, item_type_id, purchase_date, stock_available, active } = req.body;

    // 1. Validate Item Name
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Item name is required'
      });
    }
    name = name.trim();

    // 2. Validate Item Type ID
    const typeId = parseInt(item_type_id, 10);
    if (isNaN(typeId) || typeId <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type'
      });
    }

    const [typeRows] = await pool.query(
      'SELECT id, type_name FROM item_types WHERE id = ?',
      [typeId]
    );
    if (typeRows.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type'
      });
    }

    // 3. Validate Purchase Date
    if (!purchase_date || !isValidDate(purchase_date)) {
      return res.status(400).json({
        success: false,
        message: 'Valid purchase date is required'
      });
    }
    const formattedDate = formatDate(purchase_date);

    // 4. Validate Stock
    if (stock_available === undefined || stock_available === null || stock_available === '') {
      return res.status(400).json({
        success: false,
        message: 'Stock is required'
      });
    }
    const stock = parseInt(stock_available, 10);
    if (isNaN(stock)) {
      return res.status(400).json({
        success: false,
        message: 'Stock must be a valid number'
      });
    }
    if (stock < 0) {
      return res.status(400).json({
        success: false,
        message: 'Stock cannot be negative'
      });
    }

    // 5. Validate Active status
    let isActive = true;
    if (active !== undefined) {
      if (typeof active === 'boolean') {
        isActive = active;
      } else if (active === 1 || active === '1' || active === 'true') {
        isActive = true;
      } else if (active === 0 || active === '0' || active === 'false') {
        isActive = false;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Active status must be a boolean'
        });
      }
    }

    // Insert new item
    const insertQuery = `
      INSERT INTO items (name, item_type_id, purchase_date, stock_available, active)
      VALUES (?, ?, ?, ?, ?)
    `;
    const [result] = await pool.query(insertQuery, [
      name,
      typeId,
      formattedDate,
      stock,
      isActive
    ]);

    // Return the newly created item joined with item_types
    const [newItemRows] = await pool.query(`
      SELECT 
        i.id, 
        i.name, 
        it.type_name, 
        i.item_type_id,
        DATE_FORMAT(i.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.stock_available, 
        i.active 
      FROM items i 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE i.id = ?
    `, [result.insertId]);

    return res.status(201).json({
      success: true,
      message: 'Item created successfully',
      data: newItemRows[0]
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/items/:id
// Updates item details and active status
exports.updateItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID'
      });
    }

    // Check if the item exists
    const [existingRows] = await pool.query(
      'SELECT id, name, item_type_id, purchase_date, stock_available, active FROM items WHERE id = ?',
      [id]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    const currentItem = existingRows[0];
    let { name, item_type_id, purchase_date, stock_available, active } = req.body;

    // Validate name if supplied
    let updatedName = currentItem.name;
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim() === '') {
        return res.status(400).json({
          success: false,
          message: 'Item name is required'
        });
      }
      updatedName = name.trim();
    }

    // Validate item_type_id if supplied
    let updatedTypeId = currentItem.item_type_id;
    if (item_type_id !== undefined) {
      const typeId = parseInt(item_type_id, 10);
      if (isNaN(typeId) || typeId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type'
        });
      }

      const [typeRows] = await pool.query(
        'SELECT id FROM item_types WHERE id = ?',
        [typeId]
      );
      if (typeRows.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid item type'
        });
      }
      updatedTypeId = typeId;
    }

    // Validate purchase_date if supplied
    let updatedDate = formatDate(currentItem.purchase_date);
    if (purchase_date !== undefined) {
      if (!isValidDate(purchase_date)) {
        return res.status(400).json({
          success: false,
          message: 'Valid purchase date is required'
        });
      }
      updatedDate = formatDate(purchase_date);
    }

    // Validate stock_available if supplied
    let updatedStock = currentItem.stock_available;
    if (stock_available !== undefined) {
      const stock = parseInt(stock_available, 10);
      if (isNaN(stock)) {
        return res.status(400).json({
          success: false,
          message: 'Stock must be a valid number'
        });
      }
      if (stock < 0) {
        return res.status(400).json({
          success: false,
          message: 'Stock cannot be negative'
        });
      }
      updatedStock = stock;
    }

    // Validate active if supplied
    let updatedActive = currentItem.active === 1 || currentItem.active === true;
    if (active !== undefined) {
      if (typeof active === 'boolean') {
        updatedActive = active;
      } else if (active === 1 || active === '1' || active === 'true') {
        updatedActive = true;
      } else if (active === 0 || active === '0' || active === 'false') {
        updatedActive = false;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Active status must be a boolean'
        });
      }
    }

    // Update the record
    await pool.query(
      `UPDATE items 
       SET name = ?, item_type_id = ?, purchase_date = ?, stock_available = ?, active = ? 
       WHERE id = ?`,
      [updatedName, updatedTypeId, updatedDate, updatedStock, updatedActive, id]
    );

    // Return the updated item joined with item_types
    const [updatedRows] = await pool.query(`
      SELECT 
        i.id, 
        i.name, 
        it.type_name, 
        i.item_type_id,
        DATE_FORMAT(i.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.stock_available, 
        i.active 
      FROM items i 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE i.id = ?
    `, [id]);

    return res.status(200).json({
      success: true,
      message: 'Item updated successfully',
      data: updatedRows[0]
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/items/:id
// Follows the assignment rule:
// - If no purchase history exists: physically delete.
// - If purchase history exists: preserve and mark Inactive.
exports.deleteItem = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item ID'
      });
    }

    // Check if the item exists
    const [existing] = await pool.query(
      'SELECT id, name, active FROM items WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item not found'
      });
    }

    // Check purchase history in purchase_items
    const [purchaseHistory] = await pool.query(
      'SELECT COUNT(*) AS count FROM purchase_items WHERE item_id = ?',
      [id]
    );

    const hasPurchaseHistory = purchaseHistory[0].count > 0;

    if (!hasPurchaseHistory) {
      // CASE A: No purchase history -> Physically delete the item
      await pool.query('DELETE FROM items WHERE id = ?', [id]);
      return res.status(200).json({
        success: true,
        message: 'Item deleted successfully',
        deleted: true
      });
    } else {
      // CASE B: Purchase history exists -> Preserve record and set active = FALSE
      await pool.query('UPDATE items SET active = FALSE WHERE id = ?', [id]);
      return res.status(200).json({
        success: true,
        message: 'Item has purchase history. It has been deactivated instead of physically deleted to preserve historical records.',
        deactivated: true
      });
    }
  } catch (error) {
    next(error);
  }
};
