-- RPC: get_product_for_edit
-- Returns all data needed for the product edit page in a single call:
-- product, variations, images, variation_images, marketplace_links

CREATE OR REPLACE FUNCTION get_product_for_edit(
  p_company_id uuid,
  p_product_id uuid
)
RETURNS json
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result json;
  v_product json;
BEGIN
  -- Check product exists and belongs to company
  SELECT row_to_json(sub.*) INTO v_product
  FROM (
    SELECT p.id, p.company_id, p.code, p.name, p.description, p.image,
           p.variation_label, p.selected_variation_types, p.source,
           p.category_id, p.brand_id, p.is_active,
           p.created_at, p.updated_at
    FROM products p
    WHERE p.id = p_product_id AND p.company_id = p_company_id
  ) sub;

  IF v_product IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT json_build_object(
    'product', v_product,
    'variations', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'variation_id', pv.id,
          'variation_label', pv.variation_label,
          'sku', pv.sku,
          'barcode', pv.barcode,
          'attributes', pv.attributes,
          'default_price', pv.default_price,
          'discount_price', pv.discount_price,
          'stock', pv.stock,
          'min_stock', pv.min_stock,
          'is_active', pv.is_active
        ) ORDER BY pv.variation_label
      ), '[]'::json)
      FROM product_variations pv
      WHERE pv.product_id = p_product_id
    ),
    'images', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', pi.id,
          'product_id', pi.product_id,
          'variation_id', pi.variation_id,
          'image_url', pi.image_url,
          'storage_path', pi.storage_path,
          'sort_order', pi.sort_order
        ) ORDER BY pi.sort_order
      ), '[]'::json)
      FROM product_images pi
      WHERE pi.product_id = p_product_id AND pi.variation_id IS NULL
    ),
    'variation_images', (
      SELECT COALESCE(
        json_object_agg(vi.variation_id, vi.imgs),
        '{}'::json
      )
      FROM (
        SELECT pi.variation_id,
               json_agg(
                 json_build_object(
                   'id', pi.id,
                   'product_id', pi.product_id,
                   'variation_id', pi.variation_id,
                   'image_url', pi.image_url,
                   'storage_path', pi.storage_path,
                   'sort_order', pi.sort_order
                 ) ORDER BY pi.sort_order
               ) AS imgs
        FROM product_images pi
        WHERE pi.variation_id IS NOT NULL
          AND (
            pi.product_id = p_product_id
            OR pi.variation_id IN (
              SELECT pv.id FROM product_variations pv WHERE pv.product_id = p_product_id
            )
          )
        GROUP BY pi.variation_id
      ) vi
    ),
    'marketplace_links', (
      SELECT COALESCE(json_agg(
        json_build_object(
          'id', mpl.id,
          'platform', mpl.platform,
          'account_id', mpl.account_id,
          'account_name', COALESCE(sa.shop_name, mpl.account_name),
          'shop_id', sa.shop_id,
          'product_id', mpl.product_id,
          'variation_id', mpl.variation_id,
          'external_item_id', mpl.external_item_id,
          'external_model_id', mpl.external_model_id,
          'external_sku', mpl.external_sku,
          'external_item_status', mpl.external_item_status,
          'platform_product_name', mpl.platform_product_name,
          'platform_price', mpl.platform_price,
          'platform_discount_price', mpl.platform_discount_price,
          'platform_barcode', mpl.platform_barcode,
          'platform_primary_image', mpl.platform_primary_image,
          'last_synced_at', mpl.last_synced_at,
          'last_price_pushed_at', mpl.last_price_pushed_at,
          'last_stock_pushed_at', mpl.last_stock_pushed_at,
          'shopee_category_id', mpl.shopee_category_id,
          'shopee_category_name', mpl.shopee_category_name,
          'weight', mpl.weight,
          'sync_enabled', mpl.sync_enabled,
          'products', json_build_object(
            'id', p.id,
            'code', p.code,
            'name', p.name,
            'image', p.image,
            'source', p.source,
            'is_active', p.is_active,
            'variation_label', p.variation_label
          ),
          'product_variations', CASE
            WHEN pv.id IS NOT NULL THEN json_build_object(
              'id', pv.id,
              'variation_label', pv.variation_label,
              'sku', pv.sku,
              'default_price', pv.default_price,
              'discount_price', pv.discount_price,
              'stock', pv.stock,
              'is_active', pv.is_active
            )
            ELSE NULL
          END
        )
      ), '[]'::json)
      FROM marketplace_product_links mpl
      LEFT JOIN shopee_accounts sa ON sa.id = mpl.account_id
      LEFT JOIN products p ON p.id = mpl.product_id
      LEFT JOIN product_variations pv ON pv.id = mpl.variation_id
      WHERE mpl.product_id = p_product_id AND mpl.company_id = p_company_id
    )
  ) INTO result;

  RETURN result;
END;
$$;
