-- Rename bottle_size → variation_label across all tables, views, and RPCs
-- Context: bottle_size was a legacy name from when variations were fixed to bottle sizes.
-- Now the system uses dynamic variation types, so "variation_label" is more accurate.

-- =============================================
-- Step 1: DROP all views/functions that reference bottle_size
-- (Must drop BEFORE renaming columns to avoid view column conflicts)
-- =============================================
DROP VIEW IF EXISTS products_with_variations CASCADE;
DROP VIEW IF EXISTS inventory_summary CASCADE;
DROP VIEW IF EXISTS inventory_transactions_view CASCADE;
DROP FUNCTION IF EXISTS get_inventory_by_warehouse(uuid, uuid);
DROP FUNCTION IF EXISTS get_sales_by_product(uuid, date, date);

-- =============================================
-- Step 2: Rename columns on 3 tables
-- =============================================
ALTER TABLE products RENAME COLUMN bottle_size TO variation_label;
ALTER TABLE product_variations RENAME COLUMN bottle_size TO variation_label;
ALTER TABLE order_items RENAME COLUMN bottle_size TO variation_label;

-- =============================================
-- Step 3: Recreate products_with_variations view
-- =============================================
CREATE VIEW products_with_variations AS
SELECT
  p.id AS product_id,
  p.company_id,
  p.code,
  p.name,
  p.description,
  p.image,
  p.is_active,
  p.created_at,
  p.updated_at,
  p.selected_variation_types,
  p.source,
  CASE
    WHEN p.variation_label IS NOT NULL THEN 'simple'
    ELSE 'variation'
  END AS product_type,
  -- Simple product fields
  p.variation_label AS simple_variation_label,
  sv_simple.default_price AS simple_default_price,
  sv_simple.discount_price AS simple_discount_price,
  sv_simple.stock AS simple_stock,
  sv_simple.min_stock AS simple_min_stock,
  -- Variation fields
  pv.id AS variation_id,
  pv.variation_label,
  pv.sku,
  pv.barcode,
  pv.attributes,
  pv.default_price,
  pv.discount_price,
  pv.stock,
  pv.min_stock,
  pv.is_active AS variation_is_active
FROM products p
LEFT JOIN product_variations pv ON pv.product_id = p.id
LEFT JOIN product_variations sv_simple ON sv_simple.product_id = p.id
  AND p.variation_label IS NOT NULL
  AND sv_simple.variation_label = p.variation_label;

-- =============================================
-- Step 4: Recreate inventory_summary view
-- =============================================
CREATE VIEW inventory_summary AS
SELECT
  pv.id AS variation_id,
  pv.product_id,
  p.company_id,
  p.code AS product_code,
  p.name AS product_name,
  COALESCE(
    (SELECT pi.image_url FROM product_images pi
     WHERE pi.variation_id = pv.id
     ORDER BY pi.sort_order ASC LIMIT 1),
    p.image
  ) AS product_image,
  pv.variation_label,
  pv.sku,
  pv.barcode,
  pv.attributes,
  pv.default_price,
  COALESCE(pv.min_stock, 0)::int AS min_stock,
  COALESCE(SUM(i.quantity), 0)::int AS quantity,
  COALESCE(SUM(i.reserved_quantity), 0)::int AS reserved_quantity,
  (COALESCE(SUM(i.quantity), 0) - COALESCE(SUM(i.reserved_quantity), 0))::int AS available,
  MAX(i.updated_at) AS updated_at
FROM product_variations pv
INNER JOIN products p ON p.id = pv.product_id
LEFT JOIN inventory i ON i.variation_id = pv.id
WHERE pv.is_active = true AND p.is_active = true
GROUP BY pv.id, p.id;

-- =============================================
-- Step 5: Recreate get_inventory_by_warehouse RPC
-- =============================================
CREATE OR REPLACE FUNCTION get_inventory_by_warehouse(
  p_company_id uuid,
  p_warehouse_id uuid
)
RETURNS TABLE (
  variation_id uuid,
  product_id uuid,
  company_id uuid,
  product_code text,
  product_name text,
  product_image text,
  variation_label text,
  sku text,
  barcode text,
  attributes jsonb,
  default_price numeric,
  min_stock int,
  quantity int,
  reserved_quantity int,
  available int,
  updated_at timestamptz
) AS $$
  SELECT
    pv.id AS variation_id,
    pv.product_id,
    p.company_id,
    p.code AS product_code,
    p.name AS product_name,
    COALESCE(
      (SELECT pi.image_url FROM product_images pi
       WHERE pi.variation_id = pv.id
       ORDER BY pi.sort_order ASC LIMIT 1),
      p.image
    ) AS product_image,
    pv.variation_label,
    pv.sku,
    pv.barcode,
    pv.attributes,
    pv.default_price,
    COALESCE(pv.min_stock, 0)::int AS min_stock,
    COALESCE(i.quantity, 0)::int AS quantity,
    COALESCE(i.reserved_quantity, 0)::int AS reserved_quantity,
    (COALESCE(i.quantity, 0) - COALESCE(i.reserved_quantity, 0))::int AS available,
    i.updated_at
  FROM product_variations pv
  INNER JOIN products p ON p.id = pv.product_id
  LEFT JOIN inventory i ON i.variation_id = pv.id AND i.warehouse_id = p_warehouse_id
  WHERE pv.is_active = true
    AND p.is_active = true
    AND p.company_id = p_company_id;
$$ LANGUAGE sql STABLE;

-- =============================================
-- Step 6: Recreate inventory_transactions_view
-- =============================================
CREATE VIEW inventory_transactions_view AS
SELECT
  it.id,
  it.company_id,
  it.warehouse_id,
  it.variation_id,
  it.type,
  it.quantity,
  it.balance_after,
  it.reference_type,
  it.reference_id,
  it.notes,
  it.created_by,
  it.created_at,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  p.code AS product_code,
  p.name AS product_name,
  pv.sku,
  pv.variation_label,
  pv.attributes
FROM inventory_transactions it
LEFT JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN product_variations pv ON pv.id = it.variation_id
LEFT JOIN products p ON p.id = pv.product_id;

-- =============================================
-- Step 7: Recreate get_sales_by_product RPC
-- =============================================
CREATE OR REPLACE FUNCTION get_sales_by_product(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  product_code text,
  product_name text,
  variation_label text,
  total_quantity bigint,
  total_amount numeric,
  order_count bigint
) AS $$
  SELECT
    oi.product_code,
    oi.product_name,
    oi.variation_label,
    COALESCE(SUM(oi.quantity), 0)::bigint AS total_quantity,
    COALESCE(SUM(oi.total), 0) AS total_amount,
    COUNT(DISTINCT o.id)::bigint AS order_count
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE o.company_id = p_company_id
    AND o.order_status != 'cancelled'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY oi.product_code, oi.product_name, oi.variation_label
  ORDER BY total_amount DESC;
$$ LANGUAGE sql STABLE;
