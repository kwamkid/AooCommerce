-- Performance indexes for product queries
-- Fixes: /api/products (8.8s) and /api/products/form-options (7.2s)

-- 1. product_variations: critical for JOIN in products_with_variations view
CREATE INDEX IF NOT EXISTS idx_product_variations_product_id
  ON product_variations(product_id);

CREATE INDEX IF NOT EXISTS idx_product_variations_company_id
  ON product_variations(company_id);

-- 2. product_categories: compound index for filtered + sorted queries
CREATE INDEX IF NOT EXISTS idx_product_categories_company_active_sort
  ON product_categories(company_id, is_active, sort_order);

-- 3. product_brands: compound index for filtered + sorted queries
CREATE INDEX IF NOT EXISTS idx_product_brands_company_active_sort
  ON product_brands(company_id, is_active, sort_order);

-- 4. variation_types: compound index for filtered + sorted queries
CREATE INDEX IF NOT EXISTS idx_variation_types_company_active_sort
  ON variation_types(company_id, is_active, sort_order);

-- 5. products: compound index for the main listing query (company + active + name sort)
CREATE INDEX IF NOT EXISTS idx_products_company_active_name
  ON products(company_id, is_active, name);

-- 6. product_images: index for the parallel images query
CREATE INDEX IF NOT EXISTS idx_product_images_company_sort
  ON product_images(company_id, sort_order);

-- 7. Fix products_with_variations view — eliminate double LEFT JOIN
-- The old view JOINs product_variations twice (as pv and sv_simple)
-- causing cartesian product explosion. New view uses a single JOIN
-- and extracts simple product fields via CASE + subquery.

DROP VIEW IF EXISTS products_with_variations CASCADE;

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
  p.category_id,
  p.brand_id,
  CASE
    WHEN p.variation_label IS NOT NULL THEN 'simple'
    ELSE 'variation'
  END AS product_type,
  -- Simple product fields (only populated when product_type = 'simple')
  p.variation_label AS simple_variation_label,
  CASE WHEN p.variation_label IS NOT NULL THEN pv.default_price END AS simple_default_price,
  CASE WHEN p.variation_label IS NOT NULL THEN pv.discount_price END AS simple_discount_price,
  CASE WHEN p.variation_label IS NOT NULL THEN pv.stock END AS simple_stock,
  CASE WHEN p.variation_label IS NOT NULL THEN pv.min_stock END AS simple_min_stock,
  -- Variation fields (always populated from the single JOIN)
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
LEFT JOIN product_variations pv ON pv.product_id = p.id;

-- Recreate dependent views/functions (drop first to handle both CASCADE and non-CASCADE cases)

DROP VIEW IF EXISTS inventory_summary CASCADE;
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

-- get_inventory_by_warehouse RPC
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

DROP VIEW IF EXISTS inventory_transactions_view CASCADE;
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

-- get_sales_by_product RPC
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
