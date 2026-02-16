-- =============================================
-- Inventory Views & Functions for Performance
-- =============================================

-- 1. inventory_summary: aggregate stock across ALL warehouses per variation
CREATE OR REPLACE VIEW inventory_summary AS
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
  pv.bottle_size,
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

-- 2. RPC: get inventory filtered by a specific warehouse
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
  bottle_size text,
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
    pv.bottle_size,
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

-- 3. inventory_transactions_view: flattened view for search/filter
CREATE OR REPLACE VIEW inventory_transactions_view AS
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
  pv.bottle_size,
  pv.attributes
FROM inventory_transactions it
LEFT JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN product_variations pv ON pv.id = it.variation_id
LEFT JOIN products p ON p.id = pv.product_id;
