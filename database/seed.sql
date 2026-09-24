-- ========================================================
-- Item & Purchase Management System - Initial Seed Data
-- ========================================================

USE item_purchase_db;

-- Insert initial Item Types
INSERT INTO item_types (id, type_name) VALUES
(1, 'Electronics'),
(2, 'Furniture')
ON DUPLICATE KEY UPDATE type_name = VALUES(type_name);

-- Insert initial Items matching assignment specifications
INSERT INTO items (id, name, purchase_date, stock_available, item_type_id, active) VALUES
(1, 'Laptop', '2026-08-25', 10, 1, TRUE),
(2, 'Mouse', '2026-08-25', 20, 1, TRUE),
(3, 'Chair', '2026-08-25', 15, 2, TRUE)
ON DUPLICATE KEY UPDATE 
    name = VALUES(name),
    purchase_date = VALUES(purchase_date),
    stock_available = VALUES(stock_available),
    item_type_id = VALUES(item_type_id),
    active = VALUES(active);
