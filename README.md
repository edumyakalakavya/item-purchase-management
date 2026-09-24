# Item & Purchase Management System

A web application designed for managing Item Categories (Item Types), Inventory Records (Item Master), and Multi-Item Purchase Orders with relational integrity, atomic transactions, and historical audit tracking.

Built with **Node.js**, **Express.js**, **MySQL** (InnoDB), and a responsive **Vanilla HTML5 + CSS + JavaScript** frontend.

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
   * Updating order quantities recalculates stock using $\text{difference} = \text{new\_quantity} - \text{old\_quantity}$.
   * Quantity increases deduct the difference from inventory (if stock is sufficient).
   * Quantity decreases restore the surplus difference to inventory.
7. **Purchase Deletion Prohibited**:
   * Purchases represent permanent audit records and **cannot be deleted**.
   * No `DELETE` endpoint or frontend button exists.

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
│   ├── test-phase2.js             # Automated tests: Item Types & Items
│   ├── test-phase3.js             # Automated tests: Purchase Creation & Stock Deduction
│   ├── test-phase4.js             # Automated tests: Purchase Update & Stock Diffs
│   ├── test-frontend-shell.js     # Automated tests: Frontend Shell & Static Delivery
│   ├── test-phase5b.js            # Automated tests: Complete UI Components & JS Syntax
│   ├── test-phase6.js             # Automated tests: Full End-to-End Integration
│   ├── server.js                  # Express app & static file serving
│   ├── package.json               # Backend dependencies and scripts
│   └── .env                       # Local database configuration
├── frontend/
│   ├── index.html                 # Single-page interface with 4 views & modals
│   ├── css/
│   │   └── styles.css             # Clean styling (tables, modals, badges, alerts)
│   └── js/
│       ├── api.js                 # Centralized fetch wrapper
│       ├── itemTypes.js           # Item Types frontend controller
│       ├── items.js               # Item Master frontend controller
│       ├── purchases.js           # Multi-item draft builder & creation controller
│       └── purchaseDetails.js     # 4-table JOIN details & update controller
├── database/
│   ├── schema.sql                 # DDL definitions (4 tables with InnoDB FKs)
│   ├── seed.sql                   # Sample seed data matching Section 17
│   └── init.js                    # Automated schema migration & seed script
├── docs/
│   ├── api-documentation.md       # Complete REST API reference
│   └── screenshots/               # Application UI evidence
├── .env.example                   # Environment configuration template
└── README.md                      # Setup, execution, and verification guide
```

---

## 4. Database Setup & Initialization

### Prerequisites
* MySQL Server 8.0 running locally on port `3306`.

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

### Seed Data Loaded:
* **Item Types**:
  * `1`: `Electronics`
  * `2`: `Furniture`
* **Items Master**:
  * `1`: `Laptop` — Type: `Electronics`, Stock: `10`, Status: `Active`
  * `2`: `Mouse` — Type: `Electronics`, Stock: `20`, Status: `Active`
  * `3`: `Chair` — Type: `Furniture`, Stock: `15`, Status: `Active`
* **Purchases**: `0` rows (clean initial state)

---

## 5. Configuration & Backend Startup

### 1. Configure Environment
Copy `.env.example` to `backend/.env` (or project root):
```bash
cd TCS_Item_Purchase_Management/backend
cp ../.env.example .env
```

Ensure `.env` matches your MySQL credentials:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=item_purchase_db
PORT=5000
```

### 2. Install Dependencies
```bash
cd TCS_Item_Purchase_Management/backend
npm install
```

### 3. Start the Server
* Production mode:
  ```bash
  npm start
  ```
* Development mode (auto-reload on save):
  ```bash
  npm run dev
  ```

The server listens on `http://localhost:5000`.

---

## 6. Accessing the Frontend Client

Once the backend is started, open your web browser and navigate to:
```text
http://localhost:5000/
```

The Express server serves the static frontend client directly. All API calls communicate with `http://localhost:5000/api`.

---

## 7. REST API Overview

Detailed request/response contracts are documented in [docs/api-documentation.md](file:///d:/projects/p1/TCS_Item_Purchase_Management/docs/api-documentation.md).

| Resource | Method | Endpoint | Description |
| :--- | :--- | :--- | :--- |
| **Health** | `GET` | `/api/health` | Health check endpoint |
| **Item Types** | `GET` | `/api/item-types` | List all item categories |
| | `POST` | `/api/item-types` | Create a category (unique name) |
| | `PUT` | `/api/item-types/:id` | Update category name |
| | `DELETE` | `/api/item-types/:id` | Delete unused category (returns 409 if items attached) |
| **Items Master** | `GET` | `/api/items` | List all items (**JOIN** `item_types`) |
| | `GET` | `/api/items/:id` | Get single item details (**JOIN** `item_types`) |
| | `POST` | `/api/items` | Create item master record |
| | `PUT` | `/api/items/:id` | Update item details or active status |
| | `DELETE` | `/api/items/:id` | Deletes if unused; **deactivates** if purchase history exists |
| **Purchases** | `GET` | `/api/purchases` | List historical purchases with item counts |
| | `GET` | `/api/purchases/:id` | Purchase details (**Mandatory 4-table JOIN**) |
| | `POST` | `/api/purchases` | Create purchase & deduct stock (**ACID Transaction**) |
| | `PUT` | `/api/purchases/:id` | Update purchase quantities & adjust stock delta |
| | `DELETE`| `/api/purchases/:id` | **PROHIBITED** (Returns 404 Not Found) |

---

## 8. Automated Test Suite Execution

The application includes comprehensive automated test suites covering all units, API endpoints, transactions, stock calculations, and UI components.

Run all test suites from the project root:

```bash
# Phase 2: Item Types & Items CRUD + SQL JOIN tests (17 tests)
node TCS_Item_Purchase_Management/backend/test-phase2.js

# Phase 3: Purchase creation, validation & atomic stock deduction (14 tests)
node TCS_Item_Purchase_Management/backend/test-phase3.js

# Phase 4: Purchase quantity updates & bidirectional stock differentials (14 tests)
node TCS_Item_Purchase_Management/backend/test-phase4.js

# Phase 5A: Frontend shell & static asset delivery tests (15 tests)
node TCS_Item_Purchase_Management/backend/test-frontend-shell.js

# Phase 5B: Frontend components, script syntax & API binding tests (12 tests)
node TCS_Item_Purchase_Management/backend/test-phase5b.js

# Phase 6: Full end-to-end integration workflow test (19 tests)
node TCS_Item_Purchase_Management/backend/test-phase6.js
```

### Expected Automated Test Totals
* **Total Automated Tests**: **91 Passed, 0 Failed**
* **Database State after tests**: Automatically reset and seeded to the clean Section 17 state.

---

## 9. Verification Notice

* **Automated Verification**: **Completed & Fully Passing** (all 91 tests executed and verified against MySQL).
* **Manual Browser Verification**: **Pending User Inspection** (users are encouraged to open `http://localhost:5000/` in a desktop browser to click through tabs, modals, and forms).
