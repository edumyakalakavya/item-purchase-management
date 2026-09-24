const pool = require('../config/db');

/**
 * Controller for Item Types
 */

// GET /api/item-types
exports.getAllItemTypes = async (req, res, next) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, type_name FROM item_types ORDER BY id ASC'
    );
    return res.status(200).json({
      success: true,
      data: rows
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/item-types
exports.createItemType = async (req, res, next) => {
  try {
    let { type_name } = req.body;

    if (!type_name || typeof type_name !== 'string' || type_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Item type name is required'
      });
    }

    type_name = type_name.trim();

    // Check for duplicate type name
    const [existing] = await pool.query(
      'SELECT id FROM item_types WHERE LOWER(type_name) = LOWER(?)',
      [type_name]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Item type already exists'
      });
    }

    const [result] = await pool.query(
      'INSERT INTO item_types (type_name) VALUES (?)',
      [type_name]
    );

    return res.status(201).json({
      success: true,
      message: 'Item type created successfully',
      data: {
        id: result.insertId,
        type_name
      }
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/item-types/:id
exports.updateItemType = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type ID'
      });
    }

    let { type_name } = req.body;
    if (!type_name || typeof type_name !== 'string' || type_name.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Item type name is required'
      });
    }

    type_name = type_name.trim();

    // Check if the item type exists
    const [existing] = await pool.query(
      'SELECT id FROM item_types WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item type not found'
      });
    }

    // Check duplicate name for another ID
    const [duplicate] = await pool.query(
      'SELECT id FROM item_types WHERE LOWER(type_name) = LOWER(?) AND id != ?',
      [type_name, id]
    );

    if (duplicate.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Another item type with this name already exists'
      });
    }

    await pool.query(
      'UPDATE item_types SET type_name = ? WHERE id = ?',
      [type_name, id]
    );

    return res.status(200).json({
      success: true,
      message: 'Item type updated successfully',
      data: {
        id,
        type_name
      }
    });
  } catch (error) {
    next(error);
  }
};

// DELETE /api/item-types/:id
exports.deleteItemType = async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id) || id <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid item type ID'
      });
    }

    // Check if item type exists
    const [existing] = await pool.query(
      'SELECT id FROM item_types WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Item type not found'
      });
    }

    // Check if any items are associated with this item type
    const [items] = await pool.query(
      'SELECT COUNT(*) AS itemCount FROM items WHERE item_type_id = ?',
      [id]
    );

    if (items[0].itemCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Item type cannot be deleted because items are associated with it'
      });
    }

    // Delete unused item type
    await pool.query('DELETE FROM item_types WHERE id = ?', [id]);

    return res.status(200).json({
      success: true,
      message: 'Item type deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};
