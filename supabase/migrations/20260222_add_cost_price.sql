-- Add cost_price to product_variations (default cost price for the product)
ALTER TABLE public.product_variations
ADD COLUMN IF NOT EXISTS cost_price NUMERIC(15,2) DEFAULT 0;

-- Add unit_cost to inventory_transactions (actual cost at time of receipt)
ALTER TABLE public.inventory_transactions
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,2);

-- Add unit_cost to inventory_receive_items
ALTER TABLE public.inventory_receive_items
ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(15,2);

-- Update products_with_variations view to include cost_price
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
  pv.cost_price,
  pv.stock,
  pv.min_stock,
  pv.is_active AS variation_is_active
FROM products p
LEFT JOIN product_variations pv ON pv.product_id = p.id;

-- Recreate dependent views that were dropped by CASCADE

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

-- Recreate get_inventory_by_warehouse RPC
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
