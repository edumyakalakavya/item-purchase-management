const pool = require('../config/db');

/**
 * Controller for Purchases
 * NOTE: As per assignment rules, no DELETE operation is supported.
 */

// Helper to format Date to YYYY-MM-DD
function formatDate(date) {
  if (!date) return null;
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Helper to check valid date
function isValidDate(dateStr) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

// Helper to generate next unique Order ID if omitted
async function generateOrderId(conn) {
  const [rows] = await conn.query('SELECT COUNT(*) AS total FROM purchases');
  const nextNumber = rows[0].total + 1;
  const padded = String(nextNumber).padStart(5, '0');
  return `PO-${padded}`;
}

// GET /api/purchases
// Returns a list of historical purchases with item count and total quantity
exports.getAllPurchases = async (req, res, next) => {
  try {
    const query = `
      SELECT 
        p.id,
        p.order_id,
        DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date,
        COUNT(pi.id) AS item_count,
        COALESCE(SUM(pi.quantity), 0) AS total_quantity,
        p.created_at
      FROM purchases p
      LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
      GROUP BY p.id
      ORDER BY p.id DESC;
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

// GET /api/purchases/:id
// Returns complete Purchase Details using the mandatory 4-table SQL JOIN:
// purchases JOIN purchase_items JOIN items JOIN item_types
exports.getPurchaseById = async (req, res, next) => {
  try {
    const identifier = req.params.id;

    // Support lookup by either database primary key `id` or string `order_id`
    const isNumericId = !isNaN(parseInt(identifier, 10)) && String(parseInt(identifier, 10)) === identifier;

    let purchaseHeaderQuery = isNumericId
      ? 'SELECT id, order_id, DATE_FORMAT(purchase_date, "%Y-%m-%d") AS purchase_date, created_at FROM purchases WHERE id = ?'
      : 'SELECT id, order_id, DATE_FORMAT(purchase_date, "%Y-%m-%d") AS purchase_date, created_at FROM purchases WHERE order_id = ?';

    const [headers] = await pool.query(purchaseHeaderQuery, [identifier]);

    if (headers.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    const purchase = headers[0];

    // Mandatory SQL JOIN demonstrating 4-table relational lookup
    const joinQuery = `
      SELECT 
        p.order_id, 
        DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.id AS item_id, 
        i.name AS item_name, 
        it.type_name, 
        pi.quantity,
        i.stock_available AS current_stock
      FROM purchases p 
      JOIN purchase_items pi ON p.id = pi.purchase_id 
      JOIN items i ON pi.item_id = i.id 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE p.order_id = ?
      ORDER BY pi.id ASC;
    `;

    const [itemRows] = await pool.query(joinQuery, [purchase.order_id]);

    return res.status(200).json({
      success: true,
      data: {
        id: purchase.id,
        order_id: purchase.order_id,
        purchase_date: purchase.purchase_date,
        created_at: purchase.created_at,
        items: itemRows
      }
    });
  } catch (error) {
    next(error);
  }
};

// POST /api/purchases
// Creates a new purchase atomically using a MySQL transaction
exports.createPurchase = async (req, res, next) => {
  let conn;
  try {
    let { order_id, purchase_date, items } = req.body;

    // 1. Validate items array presence
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Purchase must contain at least one item'
      });
    }

    // 2. Validate purchase_date
    if (!purchase_date || !isValidDate(purchase_date)) {
      return res.status(400).json({
        success: false,
        message: 'Valid purchase date is required'
      });
    }
    const formattedDate = formatDate(purchase_date);

    // 3. Validate item lines and check for duplicate item IDs
    const seenItemIds = new Set();
    const validatedItems = [];

    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Malformed item data in order'
        });
      }

      const itemId = parseInt(item.item_id, 10);
      if (isNaN(itemId) || itemId <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valid item_id is required for every line item'
        });
      }

      if (seenItemIds.has(itemId)) {
        return res.status(400).json({
          success: false,
          message: 'Duplicate items are not allowed in one order'
        });
      }
      seenItemIds.add(itemId);

      const qty = parseInt(item.quantity, 10);
      if (isNaN(qty) || qty <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Quantity must be greater than zero'
        });
      }

      validatedItems.push({ item_id: itemId, quantity: qty });
    }

    // Acquire dedicated connection from pool for transaction
    conn = await pool.getConnection();

    // 4. Validate or generate order_id
    if (!order_id || typeof order_id !== 'string' || order_id.trim() === '') {
      order_id = await generateOrderId(conn);
    } else {
      order_id = order_id.trim();
    }

    // Check if order_id already exists
    const [existingOrder] = await conn.query(
      'SELECT id FROM purchases WHERE order_id = ?',
      [order_id]
    );
    if (existingOrder.length > 0) {
      conn.release();
      conn = null;
      return res.status(409).json({
        success: false,
        message: 'Order ID already exists'
      });
    }

    // ----------------------------------------------------
    // START DATABASE TRANSACTION
    // ----------------------------------------------------
    await conn.beginTransaction();

    // Lock requested item rows FOR UPDATE to guarantee atomic stock checks
    const itemIds = validatedItems.map(i => i.item_id);
    const placeholders = itemIds.map(() => '?').join(',');

    const [lockedRows] = await conn.query(
      `SELECT id, name, stock_available, active FROM items WHERE id IN (${placeholders}) FOR UPDATE`,
      itemIds
    );

    // Map locked items for fast access
    const lockedMap = new Map();
    for (const row of lockedRows) {
      lockedMap.set(row.id, row);
    }

    // Verify all requested items exist, are active, and have sufficient stock
    for (const item of validatedItems) {
      const dbItem = lockedMap.get(item.item_id);

      // Check existence
      if (!dbItem) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(404).json({
          success: false,
          message: 'Item not found'
        });
      }

      // Check active status
      if (dbItem.active !== 1 && dbItem.active !== true) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: 'Item is inactive and cannot be purchased'
        });
      }

      // Check stock sufficiency
      if (item.quantity > dbItem.stock_available) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: `Insufficient stock; available: ${dbItem.stock_available}`
        });
      }
    }

    // Insert Purchase header
    const [purchaseResult] = await conn.query(
      'INSERT INTO purchases (order_id, purchase_date) VALUES (?, ?)',
      [order_id, formattedDate]
    );
    const purchaseId = purchaseResult.insertId;

    // Insert Purchase Items and deduct stock
    for (const item of validatedItems) {
      // 1. Insert line item
      await conn.query(
        'INSERT INTO purchase_items (purchase_id, item_id, quantity) VALUES (?, ?, ?)',
        [purchaseId, item.item_id, item.quantity]
      );

      // 2. Deduct stock from item
      await conn.query(
        'UPDATE items SET stock_available = stock_available - ? WHERE id = ?',
        [item.quantity, item.item_id]
      );
    }

    // COMMIT the transaction
    await conn.commit();
    conn.release();
    conn = null;

    // Fetch the complete purchase details with JOIN to return in response
    const joinQuery = `
      SELECT 
        p.order_id, 
        DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.id AS item_id, 
        i.name AS item_name, 
        it.type_name, 
        pi.quantity,
        i.stock_available AS current_stock
      FROM purchases p 
      JOIN purchase_items pi ON p.id = pi.purchase_id 
      JOIN items i ON pi.item_id = i.id 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE p.order_id = ?
      ORDER BY pi.id ASC;
    `;
    const [details] = await pool.query(joinQuery, [order_id]);

    return res.status(201).json({
      success: true,
      message: 'Purchase created successfully',
      data: {
        id: purchaseId,
        order_id,
        purchase_date: formattedDate,
        items: details
      }
    });

  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('Error during transaction rollback:', rollbackErr);
      }
      conn.release();
    }
    next(error);
  }
};

// PUT /api/purchases/:id
// Updates an existing Purchase and adjusts Item stock using difference = new_quantity - old_quantity
exports.updatePurchase = async (req, res, next) => {
  let conn;
  try {
    const identifier = req.params.id;
    let { purchase_date, items } = req.body;

    // Validate identifier
    if (!identifier) {
      return res.status(400).json({
        success: false,
        message: 'Purchase identifier is required'
      });
    }

    const isNumericId = !isNaN(parseInt(identifier, 10)) && String(parseInt(identifier, 10)) === identifier;

    // Dedicated connection for atomic transaction
    conn = await pool.getConnection();
    await conn.beginTransaction();

    // 1. Lock the Purchase row
    const findPurchaseQuery = isNumericId
      ? 'SELECT id, order_id, DATE_FORMAT(purchase_date, "%Y-%m-%d") AS purchase_date FROM purchases WHERE id = ? FOR UPDATE'
      : 'SELECT id, order_id, DATE_FORMAT(purchase_date, "%Y-%m-%d") AS purchase_date FROM purchases WHERE order_id = ? FOR UPDATE';

    const [purchaseRows] = await conn.query(findPurchaseQuery, [identifier]);

    if (purchaseRows.length === 0) {
      await conn.rollback();
      conn.release();
      conn = null;
      return res.status(404).json({
        success: false,
        message: 'Purchase not found'
      });
    }

    const purchase = purchaseRows[0];
    const purchaseId = purchase.id;
    const orderId = purchase.order_id;

    // 2. Validate and update purchase_date if provided
    let updatedDate = purchase.purchase_date;
    if (purchase_date !== undefined) {
      if (!purchase_date || !isValidDate(purchase_date)) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: 'Valid purchase date is required'
        });
      }
      updatedDate = formatDate(purchase_date);
      await conn.query(
        'UPDATE purchases SET purchase_date = ? WHERE id = ?',
        [updatedDate, purchaseId]
      );
    }

    // 3. Process item quantity updates if provided
    if (items !== undefined) {
      if (!Array.isArray(items)) {
        await conn.rollback();
        conn.release();
        conn = null;
        return res.status(400).json({
          success: false,
          message: 'Items must be an array'
        });
      }

      // Fetch existing purchase_items
      const [existingItems] = await conn.query(
        'SELECT id, item_id, quantity FROM purchase_items WHERE purchase_id = ?',
        [purchaseId]
      );

      const existingMap = new Map();
      for (const row of existingItems) {
        existingMap.set(row.item_id, row);
      }

      // Validate incoming item updates and check duplicates
      const seenItemIds = new Set();
      const validatedUpdates = [];

      for (const itm of items) {
        if (!itm || typeof itm !== 'object') {
          await conn.rollback();
          conn.release();
          conn = null;
          return res.status(400).json({
            success: false,
            message: 'Malformed item data in update'
          });
        }

        const itemId = parseInt(itm.item_id, 10);
        if (isNaN(itemId) || itemId <= 0) {
          await conn.rollback();
          conn.release();
          conn = null;
          return res.status(400).json({
            success: false,
            message: 'Valid item_id is required'
          });
        }

        if (seenItemIds.has(itemId)) {
          await conn.rollback();
          conn.release();
          conn = null;
          return res.status(400).json({
            success: false,
            message: 'Duplicate items are not allowed in one order'
          });
        }
        seenItemIds.add(itemId);

        const qty = parseInt(itm.quantity, 10);
        if (isNaN(qty) || qty <= 0) {
          await conn.rollback();
          conn.release();
          conn = null;
          return res.status(400).json({
            success: false,
            message: 'Quantity must be greater than zero'
          });
        }

        // Must exist in the existing purchase items
        if (!existingMap.has(itemId)) {
          await conn.rollback();
          conn.release();
          conn = null;
          return res.status(400).json({
            success: false,
            message: `Item ID ${itemId} is not part of this purchase`
          });
        }

        validatedUpdates.push({
          item_id: itemId,
          new_quantity: qty,
          old_quantity: existingMap.get(itemId).quantity
        });
      }

      // Lock affected item rows FOR UPDATE to safely calculate and apply stock changes
      if (validatedUpdates.length > 0) {
        const itemIdsToLock = validatedUpdates.map(u => u.item_id);
        const placeholders = itemIdsToLock.map(() => '?').join(',');

        const [lockedItemRows] = await conn.query(
          `SELECT id, name, stock_available FROM items WHERE id IN (${placeholders}) FOR UPDATE`,
          itemIdsToLock
        );

        const stockMap = new Map();
        for (const row of lockedItemRows) {
          stockMap.set(row.id, row);
        }

        // First pass: Verify all quantity increases can be fulfilled
        for (const update of validatedUpdates) {
          const difference = update.new_quantity - update.old_quantity;
          const currentItem = stockMap.get(update.item_id);

          if (difference > 0) {
            if (difference > currentItem.stock_available) {
              await conn.rollback();
              conn.release();
              conn = null;
              return res.status(400).json({
                success: false,
                message: `Insufficient stock to increase quantity; available: ${currentItem.stock_available}`
              });
            }
          }
        }

        // Second pass: Apply stock adjustments and update purchase_items
        for (const update of validatedUpdates) {
          const difference = update.new_quantity - update.old_quantity;

          if (difference > 0) {
            // Case A: Increased quantity -> deduct difference from stock
            await conn.query(
              'UPDATE items SET stock_available = stock_available - ? WHERE id = ?',
              [difference, update.item_id]
            );
          } else if (difference < 0) {
            // Case B: Decreased quantity -> return difference to inventory
            const returnAmount = Math.abs(difference);
            await conn.query(
              'UPDATE items SET stock_available = stock_available + ? WHERE id = ?',
              [returnAmount, update.item_id]
            );
          }
          // Case C: difference === 0 -> no stock change

          // Update purchase_items line
          await conn.query(
            'UPDATE purchase_items SET quantity = ? WHERE purchase_id = ? AND item_id = ?',
            [update.new_quantity, purchaseId, update.item_id]
          );
        }
      }
    }

    // COMMIT the transaction
    await conn.commit();
    conn.release();
    conn = null;

    // Fetch updated purchase details with 4-table JOIN
    const joinQuery = `
      SELECT 
        p.order_id, 
        DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date, 
        i.id AS item_id, 
        i.name AS item_name, 
        it.type_name, 
        pi.quantity,
        i.stock_available AS current_stock
      FROM purchases p 
      JOIN purchase_items pi ON p.id = pi.purchase_id 
      JOIN items i ON pi.item_id = i.id 
      JOIN item_types it ON i.item_type_id = it.id 
      WHERE p.order_id = ?
      ORDER BY pi.id ASC;
    `;
    const [details] = await pool.query(joinQuery, [orderId]);

    return res.status(200).json({
      success: true,
      message: 'Purchase updated successfully',
      data: {
        id: purchaseId,
        order_id: orderId,
        purchase_date: updatedDate,
        items: details
      }
    });

  } catch (error) {
    if (conn) {
      try {
        await conn.rollback();
      } catch (rollbackErr) {
        console.error('Error during transaction rollback:', rollbackErr);
      }
      conn.release();
    }
    next(error);
  }
};

