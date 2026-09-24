# Item & Purchase Management System — API Documentation

Base URL: `http://localhost:5000/api`

---

## Overview

The Item & Purchase Management System exposes RESTful APIs for managing item categories (Item Types), inventory records (Items Master), and purchase transactions with atomic stock adjustments.

### Key Architectural Rules
* **Relational Integrity**: Foreign keys enforce relations between `item_types`, `items`, `purchases`, and `purchase_items`.
* **Atomic Transactions**: Purchases and purchase updates execute inside MySQL ACID transactions with `FOR UPDATE` locking.
* **Stock Protection**: Stock is strictly non-negative and is validated on the backend.
* **Audit Immutability**: `DELETE /api/purchases/:id` is strictly **NOT** implemented; historical purchase transactions cannot be deleted.
* **History-Safe Deletion**: Items referenced by purchase history are preserved and deactivated (`active = FALSE`) instead of physically removed.

---

## 1. System Health

### Check Health
* **URL**: `/health`
* **Method**: `GET`
* **Purpose**: Verify backend connectivity and service availability.
* **Response `200 OK`**:
```json
{
  "status": "OK",
  "message": "Item & Purchase Management API is running",
  "timestamp": "2026-09-24T12:00:00.000Z"
}
```

---

## 2. Item Types API (`/api/item-types`)

### 2.1 Get All Item Types
* **URL**: `/item-types`
* **Method**: `GET`
* **Purpose**: Retrieve all categories ordered by ID.
* **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    { "id": 1, "type_name": "Electronics" },
    { "id": 2, "type_name": "Furniture" }
  ]
}
```

### 2.2 Create Item Type
* **URL**: `/item-types`
* **Method**: `POST`
* **Purpose**: Create a new category.
* **Request Body**:
```json
{
  "type_name": "Stationery"
}
```
* **Validation & Errors**:
  * `400 Bad Request`: `type_name` missing or blank (`"Item type name is required"`).
  * `409 Conflict`: Duplicate name exists (`"Item type already exists"`).
* **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Item type created successfully",
  "data": {
    "id": 3,
    "type_name": "Stationery"
  }
}
```

### 2.3 Update Item Type
* **URL**: `/item-types/:id`
* **Method**: `PUT`
* **Purpose**: Rename an existing category.
* **Request Body**:
```json
{
  "type_name": "Office Supplies"
}
```
* **Validation & Errors**:
  * `400 Bad Request`: Invalid ID or missing name.
  * `404 Not Found`: Item type does not exist (`"Item type not found"`).
  * `409 Conflict`: Name already taken by another type (`"Another item type with this name already exists"`).
* **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Item type updated successfully",
  "data": {
    "id": 3,
    "type_name": "Office Supplies"
  }
}
```

### 2.4 Delete Item Type
* **URL**: `/item-types/:id`
* **Method**: `DELETE`
* **Purpose**: Delete an unused category.
* **Validation & Errors**:
  * `404 Not Found`: Category does not exist.
  * `409 Conflict`: Category is linked to one or more items (`"Item type cannot be deleted because items are associated with it"`).
* **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Item type deleted successfully"
}
```

---

## 3. Items Master API (`/api/items`)

### 3.1 Get All Items (SQL JOIN)
* **URL**: `/items`
* **Method**: `GET`
* **Purpose**: Retrieve all inventory items joined with their category name.
* **Mandatory SQL JOIN**:
  ```sql
  SELECT i.id, i.name, it.type_name, i.item_type_id, DATE_FORMAT(i.purchase_date, '%Y-%m-%d') AS purchase_date, i.stock_available, i.active
  FROM items i JOIN item_types it ON i.item_type_id = it.id ORDER BY i.id ASC;
  ```
* **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "name": "Laptop",
      "type_name": "Electronics",
      "item_type_id": 1,
      "purchase_date": "2026-08-25",
      "stock_available": 10,
      "active": 1
    },
    {
      "id": 2,
      "name": "Mouse",
      "type_name": "Electronics",
      "item_type_id": 1,
      "purchase_date": "2026-08-25",
      "stock_available": 20,
      "active": 1
    }
  ]
}
```

### 3.2 Get Single Item
* **URL**: `/items/:id`
* **Method**: `GET`
* **Purpose**: Retrieve single item with its joined category.
* **Validation & Errors**:
  * `404 Not Found`: Item does not exist (`"Item not found"`).
* **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "name": "Laptop",
    "type_name": "Electronics",
    "item_type_id": 1,
    "purchase_date": "2026-08-25",
    "stock_available": 10,
    "active": 1
  }
}
```

### 3.3 Create Item
* **URL**: `/items`
* **Method**: `POST`
* **Purpose**: Create a new inventory record.
* **Request Body**:
```json
{
  "name": "Wireless Keyboard",
  "item_type_id": 1,
  "purchase_date": "2026-08-25",
  "stock_available": 25,
  "active": true
}
```
* **Validation & Errors**:
  * `400 Bad Request`:
    * Missing/blank name: `"Item name is required"`
    * Non-existent category: `"Invalid item type"`
    * Invalid date string: `"Valid purchase date is required"`
    * Negative stock: `"Stock cannot be negative"`
    * Non-boolean active status: `"Active status must be a boolean"`
* **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Item created successfully",
  "data": {
    "id": 4,
    "name": "Wireless Keyboard",
    "type_name": "Electronics",
    "item_type_id": 1,
    "purchase_date": "2026-08-25",
    "stock_available": 25,
    "active": 1
  }
}
```

### 3.4 Update Item
* **URL**: `/items/:id`
* **Method**: `PUT`
* **Purpose**: Update item fields or active status.
* **Request Body**:
```json
{
  "name": "Wireless Keyboard Pro",
  "stock_available": 30,
  "active": true
}
```
* **Validation & Errors**:
  * `400 Bad Request`: Negative stock, invalid date, or non-existent `item_type_id`.
  * `404 Not Found`: Item ID not found.
* **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Item updated successfully",
  "data": {
    "id": 4,
    "name": "Wireless Keyboard Pro",
    "type_name": "Electronics",
    "item_type_id": 1,
    "purchase_date": "2026-08-25",
    "stock_available": 30,
    "active": 1
  }
}
```

### 3.5 Delete Item (History-Safe)
* **URL**: `/items/:id`
* **Method**: `DELETE`
* **Purpose**: Delete item, or deactivate if referenced by purchase history.
* **Behavior**:
  * **No Purchase History**: Physically deletes record (`DELETE FROM items WHERE id = ?`).
    * Response `200 OK`:
      ```json
      {
        "success": true,
        "message": "Item deleted successfully",
        "deleted": true
      }
      ```
  * **Has Purchase History**: Sets `active = FALSE` (`UPDATE items SET active = FALSE WHERE id = ?`) to protect historical purchases.
    * Response `200 OK`:
      ```json
      {
        "success": true,
        "message": "Item has purchase history. It has been deactivated instead of physically deleted to preserve historical records.",
        "deactivated": true
      }
      ```

---

## 4. Purchases API (`/api/purchases`)

### 4.1 Get All Purchases
* **URL**: `/purchases`
* **Method**: `GET`
* **Purpose**: List all historical purchase headers with summary counts.
* **Response `200 OK`**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "order_id": "PO-00001",
      "purchase_date": "2026-08-25",
      "item_count": 3,
      "total_quantity": 10,
      "created_at": "2026-09-24T10:00:00.000Z"
    }
  ]
}
```

### 4.2 Get Purchase Details (Mandatory 4-Table SQL JOIN)
* **URL**: `/purchases/:id` (Accepts numeric ID or string Order ID, e.g. `/purchases/1` or `/purchases/PO-00001`)
* **Method**: `GET`
* **Purpose**: Inspect purchase details and joined line items.
* **Mandatory SQL JOIN**:
  ```sql
  SELECT p.order_id, DATE_FORMAT(p.purchase_date, '%Y-%m-%d') AS purchase_date, i.id AS item_id, i.name AS item_name, it.type_name, pi.quantity, i.stock_available AS current_stock
  FROM purchases p
  JOIN purchase_items pi ON p.id = pi.purchase_id
  JOIN items i ON pi.item_id = i.id
  JOIN item_types it ON i.item_type_id = it.id
  WHERE p.order_id = ?
  ORDER BY pi.id ASC;
  ```
* **Validation & Errors**:
  * `404 Not Found`: Purchase ID does not exist (`"Purchase not found"`).
* **Response `200 OK`**:
```json
{
  "success": true,
  "data": {
    "id": 1,
    "order_id": "PO-00001",
    "purchase_date": "2026-08-25",
    "created_at": "2026-09-24T10:00:00.000Z",
    "items": [
      {
        "order_id": "PO-00001",
        "purchase_date": "2026-08-25",
        "item_id": 1,
        "item_name": "Laptop",
        "type_name": "Electronics",
        "quantity": 2,
        "current_stock": 8
      },
      {
        "order_id": "PO-00001",
        "purchase_date": "2026-08-25",
        "item_id": 2,
        "item_name": "Mouse",
        "type_name": "Electronics",
        "quantity": 5,
        "current_stock": 15
      }
    ]
  }
}
```

### 4.3 Create Purchase (Atomic Transaction)
* **URL**: `/purchases`
* **Method**: `POST`
* **Purpose**: Create purchase order and atomically deduct stock.
* **Request Body**:
```json
{
  "order_id": "PO-00001",
  "purchase_date": "2026-08-25",
  "items": [
    { "item_id": 1, "quantity": 2 },
    { "item_id": 2, "quantity": 5 },
    { "item_id": 3, "quantity": 3 }
  ]
}
```
*Note*: `order_id` is optional; if omitted, the backend auto-generates `PO-XXXXX`.
* **Validation & Errors (with complete transaction rollback)**:
  * `400 Bad Request`:
    * Empty items: `"Purchase must contain at least one item"`
    * Invalid date: `"Valid purchase date is required"`
    * Non-positive quantity: `"Quantity must be greater than zero"`
    * Duplicate items: `"Duplicate items are not allowed in one order"`
    * Inactive item: `"Item is inactive and cannot be purchased"`
    * Insufficient stock: `"Insufficient stock; available: X"`
  * `404 Not Found`: Item ID not found.
  * `409 Conflict`: Order ID already exists.
* **Response `201 Created`**:
```json
{
  "success": true,
  "message": "Purchase created successfully",
  "data": {
    "id": 1,
    "order_id": "PO-00001",
    "purchase_date": "2026-08-25",
    "items": [ ... ]
  }
}
```

### 4.4 Update Purchase (Atomic Stock Differential Adjustment)
* **URL**: `/purchases/:id` (Accepts numeric ID or Order ID)
* **Method**: `PUT`
* **Purpose**: Adjust purchase date and item quantities.
* **Request Body**:
```json
{
  "purchase_date": "2026-08-30",
  "items": [
    { "item_id": 1, "quantity": 5 },
    { "item_id": 2, "quantity": 3 }
  ]
}
```
* **Stock Differential Logic**:
  * $\text{difference} = \text{new\_quantity} - \text{old\_quantity}$
  * $\text{difference} > 0$: Verifies available stock $\ge \text{difference}$, then deducts difference.
  * $\text{difference} < 0$: Returns $|\text{difference}|$ to stock.
  * $\text{difference} = 0$: No stock change.
* **Validation & Errors**:
  * `400 Bad Request`:
    * Non-positive quantity.
    * Insufficient stock for increase: `"Insufficient stock to increase quantity; available: X"`.
    * Item does not belong to purchase: `"Item ID X is not part of this purchase"`.
    * Invalid date.
  * `404 Not Found`: Purchase not found.
* **Response `200 OK`**:
```json
{
  "success": true,
  "message": "Purchase updated successfully",
  "data": {
    "id": 1,
    "order_id": "PO-00001",
    "purchase_date": "2026-08-30",
    "items": [ ... ]
  }
}
```

### 4.5 Delete Purchase (Prohibited)
* **URL**: `/purchases/:id`
* **Method**: `DELETE`
* **Status**: **NOT IMPLEMENTED**
* **Reason**: Purchases represent immutable historical audit records. The backend does not expose a DELETE route (`404 Not Found`).
