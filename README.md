# Item & Purchase Management System

A web application designed for managing **Item Categories (Item Types)**, **Inventory Records (Item Master)**, and **Multi-Item Purchase Orders** with relational integrity, atomic transactions, and historical audit tracking.

Built with **Node.js**, **Express.js**, **MySQL (InnoDB)**, and a responsive **Vanilla HTML5 + CSS + JavaScript** frontend.

---

## 1. Project Overview & Business Rules

1. **Item Types**: Manage product categories (`Electronics`, `Furniture`, `Stationery`, etc.). Unused categories can be deleted; categories linked to items are protected against deletion (`409 Conflict`).

2. **Item Master**: Track items with Name, Category, Purchase Date, Current Stock, Availability Status (`In Stock`, `Low Stock`, `Out of Stock`), and Active/Inactive status.

3. **Relational SQL JOINs**:

   * Item Master displays category names retrieved via `JOIN item_types`.
   * Purchase Details displays joined line items retrieved via a 4-table relational query (`purchases JOIN purchase_items JOIN items JOIN item_types`).

4. **History-Safe Item Deletion**:

   * Items without purchase history can be physically deleted.
   * Items referenced by historical purchases are preserved and deactivated (`active = FALSE`) so historical order records remain intact.

5. **Multi-Item Atomic Purchases**:

   * A single purchase order supports multiple items with positive quantities.
   * Atomic MySQL transactions with `FOR UPDATE` row-level locking validate stock availability and deduct quantities simultaneously.
   * If any item line fails validation or has insufficient stock, the transaction rolls back completely with zero stock modifications.

6. **Stock Adjustment on Purchase Updates**:

   * Updating order quantities recalculates stock using:
     `difference = new_quantity - old_quantity`
   * Quantity increases deduct the difference from inventory when sufficient stock is available.
   * Quantity decreases restore the surplus difference to inventory.

7. **Purchase Deletion Prohibited**:

   * Purchases represent permanent audit records and cannot be deleted.
   * No `DELETE` endpoint or frontend delete button exists for purchases.

---

## 2. Technology Stack

* **Backend**: Node.js (`v18+` / `v20+` / `v24+`), Express.js (`v4.19+`)
* **Database Driver**: `mysql2/promise` (connection pooling, parameterized queries, transactions)
* **Environment Management**: `dotenv`
* **Cross-Origin Resource Sharing**: `cors`
* **Database Engine**: MySQL Server 8.0+ (InnoDB engine for foreign keys and ACID transactions)
* **Frontend**: HTML5, Vanilla JavaScript (ES6+), CSS3 (no external frameworks or libraries)

---

## 3. Directory Structure

```text
TCS_Item_Purchase_Management/
├── backend/
│   ├── config/
│   │   └── db.js                  # MySQL connection pool (mysql2/promise)
│   ├── controllers/
│   │   ├── itemTypeController.js  # Item Types CRUD & relation protection
│   │   ├── itemController.js      # Items CRUD & history-safe deactivation
│   │   └── purchaseController.js  # Purchases CRUD & atomic stock adjustment
│   ├── routes/
│   │   ├── itemTypeRoutes.js      # /api/item-types router
│   │   ├── itemRoutes.js          # /api/items router
│   │   └── purchaseRoutes.js      # /api/purchases router (NO DELETE route)
│   ├── test-phase2.js             # Item Types & Items automated tests
│   ├── test-phase3.js             # Purchase Creation & Stock Deduction tests
│   ├── test-phase4.js             # Purchase Update & Stock Differential tests
│   ├── test-frontend-shell.js     # Frontend Shell & Static Delivery tests
│   ├── test-phase5b.js            # UI Components & JavaScript Syntax tests
│   ├── test-phase6.js             # Full End-to-End Integration tests
│   ├── server.js                  # Express app & static file serving
│   └── package.json               # Backend dependencies and scripts
├── frontend/
│   ├── index.html                 # Single-page interface with 4 views & modals
│   ├── css/
│   │   └── styles.css             # Tables, modals, badges, alerts and layout
│   └── js/
│       ├── api.js                 # Centralized fetch wrapper
│       ├── itemTypes.js           # Item Types frontend controller
│       ├── items.js               # Item Master frontend controller
│       ├── purchases.js           # Multi-item draft builder & creation controller
│       └── purchaseDetails.js     # Purchase details & update controller
├── database/
│   ├── schema.sql                 # DDL definitions with InnoDB foreign keys
│   ├── seed.sql                   # Sample seed data
│   └── init.js                    # Automated schema initialization & seed script
├── docs/
│   ├── api-documentation.md       # Complete REST API reference
│   └── screenshots/               # Application UI evidence
├── .env.example                   # Environment configuration template
├── .gitignore                     # Git ignore rules
└── README.md                      # Setup, execution, and verification guide
```

---

## 4. Database Setup & Initialization

### Prerequisites

* MySQL Server 8.0 or later
* MySQL running locally on port `3306`
* Node.js installed

### Option A: Automated Script Setup (Recommended)

Run the automated initialization script from the project root:

```bash
cd TCS_Item_Purchase_Management
node database/init.js
```

### Option B: Manual MySQL CLI Setup

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p item_purchase_db < database/seed.sql
```

### Seed Data Loaded

**Item Types:**

* `1`: `Electronics`
* `2`: `Furniture`

**Items:**

* `1`: `Laptop` — Type: `Electronics`, Stock: `10`, Status: `Active`
* `2`: `Mouse` — Type: `Electronics`, Stock: `20`, Status: `Active`
* `3`: `Chair` — Type: `Furniture`, Stock: `15`, Status: `Active`

**Purchases:**

* `0` rows in the initial clean seed state

---

## 5. Configuration & Backend Startup

### 1. Configure Environment

Copy `.env.example` to `backend/.env`:

```bash
cd TCS_Item_Purchase_Management/backend
cp ../.env.example .env
```

Update `.env` with your local MySQL credentials:

```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=item_purchase_db
PORT=5000
```

> The local `.env` file is intentionally excluded from Git through `.gitignore`.

### 2. Install Dependencies

```bash
cd TCS_Item_Purchase_Management/backend
npm install
```

### 3. Start the Server

**Production mode:**

```bash
npm start
```

**Development mode:**

```bash
npm run dev
```

The server listens on:

```text
http://localhost:5000
```

---

## 6. Accessing the Frontend Client

Once the backend is started, open a web browser and navigate to:

```text
http://localhost:5000/
```

The Express server serves the static frontend client directly.

All API calls communicate with:

```text
http://localhost:5000/api
```

---

## 7. REST API Overview

Detailed request/response contracts are documented in [docs/api-documentation.md](docs/api-documentation.md).

| Resource         | Method   | Endpoint              | Description                                                |
| :--------------- | :------- | :-------------------- | :--------------------------------------------------------- |
| **Health**       | `GET`    | `/api/health`         | Health check endpoint                                      |
| **Item Types**   | `GET`    | `/api/item-types`     | List all item categories                                   |
|                  | `POST`   | `/api/item-types`     | Create a category (unique name)                            |
|                  | `PUT`    | `/api/item-types/:id` | Update category name                                       |
|                  | `DELETE` | `/api/item-types/:id` | Delete unused category (returns 409 if items attached)     |
| **Items Master** | `GET`    | `/api/items`          | List all items with `item_types` JOIN                      |
|                  | `GET`    | `/api/items/:id`      | Get single item details with category JOIN                 |
|                  | `POST`   | `/api/items`          | Create item master record                                  |
|                  | `PUT`    | `/api/items/:id`      | Update item details or active status                       |
|                  | `DELETE` | `/api/items/:id`      | Delete if unused; deactivate if purchase history exists    |
| **Purchases**    | `GET`    | `/api/purchases`      | List historical purchases with item counts                 |
|                  | `GET`    | `/api/purchases/:id`  | Purchase details using the required 4-table JOIN           |
|                  | `POST`   | `/api/purchases`      | Create purchase and deduct stock using an ACID transaction |
|                  | `PUT`    | `/api/purchases/:id`  | Update purchase quantities and adjust stock                |
|                  | `DELETE` | `/api/purchases/:id`  | Prohibited; returns `404 Not Found`                        |

---

## 8. Automated Test Suite Execution

The application includes automated test suites covering API endpoints, relational queries, validation rules, transactions, stock calculations, frontend components, and end-to-end workflows.

Run the test suites from the project root:

### Phase 2 — Item Types & Items

```bash
node TCS_Item_Purchase_Management/backend/test-phase2.js
```

**17 tests**

### Phase 3 — Purchase Creation & Stock Deduction

```bash
node TCS_Item_Purchase_Management/backend/test-phase3.js
```

**14 tests**

### Phase 4 — Purchase Updates & Stock Rebalancing

```bash
node TCS_Item_Purchase_Management/backend/test-phase4.js
```

**14 tests**

### Phase 5A — Frontend Shell & Static Delivery

```bash
node TCS_Item_Purchase_Management/backend/test-frontend-shell.js
```

**15 tests**

### Phase 5B — Frontend Components & REST Integration

```bash
node TCS_Item_Purchase_Management/backend/test-phase5b.js
```

**12 tests**

### Phase 6 — Full End-to-End Integration

```bash
node TCS_Item_Purchase_Management/backend/test-phase6.js
```

**19 tests**

### Automated Test Summary

| Test Phase |  Tests | Result                   |
| :--------- | -----: | :----------------------- |
| Phase 2    |     17 | Passed                   |
| Phase 3    |     14 | Passed                   |
| Phase 4    |     14 | Passed                   |
| Phase 5A   |     15 | Passed                   |
| Phase 5B   |     12 | Passed                   |
| Phase 6    |     19 | Passed                   |
| **Total**  | **91** | **91 Passed / 0 Failed** |

---

## 9. Verification Notice

* **Automated Verification:** **Completed & Fully Passing** — all 91 automated tests were executed and verified against MySQL.
* **Manual Browser Verification:** **Completed** — the application was manually inspected through the Item Master, Item Types, Create Purchase, Purchase History, and Purchase Details workflows.
* **Visual Evidence:** Eight screenshots documenting the key workflows and final inventory state are available in [`docs/screenshots/`](docs/screenshots/).
* **Purchase Workflow Verification:** The complete purchase workflow was manually verified, including order creation, confirmation, purchase history, purchase details, and stock deduction.

### Visual Evidence

The following screenshots are included in `docs/screenshots/`:

1. `01-item-master.png` — Item Master
2. `02-item-types.png` — Item Types
3. `03-create-purchase-empty.png` — Create Purchase empty state
4. `04-create-purchase-draft.png` — Multi-item purchase draft
5. `05-purchase-confirmation.png` — Purchase confirmation dialog
6. `06-purchase-history.png` — Purchase History
7. `07-purchase-details.png` — Purchase Details
8. `08-stock-after-purchase.png` — Item Master after stock deduction
