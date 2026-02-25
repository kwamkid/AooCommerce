-- Updated get_orders_list RPC for marketplace architecture
-- Changes: shopee_accounts → marketplace_accounts, shopee_account_id → marketplace_account_id

CREATE OR REPLACE FUNCTION get_orders_list(
  p_company_id         UUID,
  p_page               INT     DEFAULT 1,
  p_limit              INT     DEFAULT 20,
  p_sort_by            TEXT    DEFAULT 'created_at',
  p_sort_dir           TEXT    DEFAULT 'desc',
  p_search             TEXT    DEFAULT NULL,
  p_order_status       TEXT    DEFAULT NULL,
  p_payment_status     TEXT    DEFAULT NULL,
  p_source             TEXT    DEFAULT NULL,
  p_created_by         UUID    DEFAULT NULL,
  p_channel            TEXT    DEFAULT NULL,
  p_delivery_date_start DATE   DEFAULT NULL,
  p_delivery_date_end   DATE   DEFAULT NULL,
  p_customer_id        UUID    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_offset       INT := (COALESCE(p_page, 1) - 1) * COALESCE(p_limit, 20);
  v_channel_type TEXT := NULL; -- 'none', 'marketplace', 'chat'
  v_result       jsonb;
BEGIN
  -- Sanitize sort params
  IF p_sort_by NOT IN ('order_date','created_at','delivery_date','total_amount','order_number') THEN
    p_sort_by := 'created_at';
  END IF;
  IF p_sort_dir NOT IN ('asc','desc') THEN
    p_sort_dir := 'desc';
  END IF;

  -- Determine channel filter type
  IF p_channel IS NOT NULL AND p_channel != '' AND p_channel != 'all' THEN
    IF p_channel = 'none' THEN
      v_channel_type := 'none';
    ELSIF p_channel ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-' THEN
      IF EXISTS (SELECT 1 FROM marketplace_accounts WHERE id = p_channel::uuid AND company_id = p_company_id) THEN
        v_channel_type := 'marketplace';
      ELSE
        v_channel_type := 'chat';
      END IF;
    END IF;
  END IF;

  WITH
  -- 1. All customer_ids linked to chat (LINE + FB) — used for channel filter
  chat_linked_customers AS (
    SELECT customer_id, chat_account_id
    FROM line_contacts
    WHERE company_id = p_company_id AND customer_id IS NOT NULL
    UNION
    SELECT customer_id, chat_account_id
    FROM fb_contacts
    WHERE company_id = p_company_id AND customer_id IS NOT NULL
  ),

  -- 2. Base filtered orders (ALL filters EXCEPT status/payment — for accurate counts)
  base_filtered AS (
    SELECT o.id, o.order_number, o.order_date, o.created_at, o.delivery_date,
           o.subtotal, o.discount_amount, o.vat_amount, o.shipping_fee, o.total_amount,
           o.order_status, o.payment_status, o.payment_method,
           o.source, o.external_status, o.external_order_sn,
           o.customer_id, o.marketplace_account_id, o.created_by,
           o.delivery_name, o.delivery_phone,
           o.fulfillment_status, o.hold_reason,
           o.tracking_number, o.shipping_carrier
    FROM orders o
    WHERE o.company_id = p_company_id
      -- Source filter
      AND (
        p_source IS NULL OR p_source = '' OR p_source = 'all'
        OR (p_source = 'exclude_pos' AND o.source != 'pos')
        OR (p_source != 'exclude_pos' AND o.source = p_source)
      )
      -- Created by
      AND (p_created_by IS NULL OR o.created_by = p_created_by)
      -- Customer
      AND (p_customer_id IS NULL OR o.customer_id = p_customer_id)
      -- Delivery date range
      AND (p_delivery_date_start IS NULL OR o.delivery_date >= p_delivery_date_start)
      AND (p_delivery_date_end IS NULL OR o.delivery_date <= p_delivery_date_end)
      -- Search
      AND (
        p_search IS NULL OR p_search = ''
        OR o.order_number ILIKE '%' || p_search || '%'
        OR o.delivery_name ILIKE '%' || p_search || '%'
        OR o.customer_id IN (
          SELECT c.id FROM customers c
          WHERE c.company_id = p_company_id AND c.name ILIKE '%' || p_search || '%'
        )
      )
      -- Channel filter
      AND (
        v_channel_type IS NULL
        OR (v_channel_type = 'none'
            AND o.marketplace_account_id IS NULL
            AND (o.customer_id IS NULL
                 OR o.customer_id NOT IN (SELECT clc.customer_id FROM chat_linked_customers clc)))
        OR (v_channel_type = 'marketplace' AND o.marketplace_account_id = p_channel::uuid)
        OR (v_channel_type = 'chat'
            AND o.customer_id IN (
              SELECT clc.customer_id FROM chat_linked_customers clc
              WHERE clc.chat_account_id = p_channel::uuid
            ))
      )
  ),

  -- 3. Status + payment counts (from base, before status/payment filter)
  agg_counts AS (
    SELECT
      COUNT(*)::int AS total_all,
      COUNT(*) FILTER (WHERE order_status = 'new')::int AS cnt_new,
      COUNT(*) FILTER (WHERE order_status = 'ready_to_ship')::int AS cnt_rts,
      COUNT(*) FILTER (WHERE order_status = 'processing')::int AS cnt_proc,
      COUNT(*) FILTER (WHERE order_status = 'shipping')::int AS cnt_ship,
      COUNT(*) FILTER (WHERE order_status = 'completed')::int AS cnt_comp,
      COUNT(*) FILTER (WHERE order_status = 'cancelled')::int AS cnt_canc,
      COUNT(*) FILTER (WHERE payment_status = 'pending')::int AS pay_pend,
      COUNT(*) FILTER (WHERE payment_status = 'verifying')::int AS pay_ver,
      COUNT(*) FILTER (WHERE payment_status = 'paid')::int AS pay_paid,
      COUNT(*) FILTER (WHERE payment_status = 'cancelled')::int AS pay_canc
    FROM base_filtered
  ),

  -- 4. Apply status/payment filter
  filtered_orders AS (
    SELECT * FROM base_filtered
    WHERE (p_order_status IS NULL OR p_order_status = '' OR p_order_status = 'all' OR order_status = p_order_status)
      AND (p_payment_status IS NULL OR p_payment_status = '' OR p_payment_status = 'all' OR payment_status = p_payment_status)
  ),

  -- 5. Total for pagination (after status/payment filter)
  filtered_total AS (
    SELECT COUNT(*)::int AS total FROM filtered_orders
  ),

  -- 6. Paged orders with dynamic sort
  paged_orders AS (
    SELECT fo.*
    FROM filtered_orders fo
    ORDER BY
      CASE WHEN p_sort_by = 'created_at'    AND p_sort_dir = 'desc' THEN fo.created_at    END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'created_at'    AND p_sort_dir = 'asc'  THEN fo.created_at    END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'order_date'    AND p_sort_dir = 'desc' THEN fo.order_date    END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'order_date'    AND p_sort_dir = 'asc'  THEN fo.order_date    END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'delivery_date' AND p_sort_dir = 'desc' THEN fo.delivery_date END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'delivery_date' AND p_sort_dir = 'asc'  THEN fo.delivery_date END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'total_amount'  AND p_sort_dir = 'desc' THEN fo.total_amount  END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'total_amount'  AND p_sort_dir = 'asc'  THEN fo.total_amount  END ASC  NULLS LAST,
      CASE WHEN p_sort_by = 'order_number'  AND p_sort_dir = 'desc' THEN fo.order_number  END DESC NULLS LAST,
      CASE WHEN p_sort_by = 'order_number'  AND p_sort_dir = 'asc'  THEN fo.order_number  END ASC  NULLS LAST
    LIMIT p_limit OFFSET v_offset
  ),

  -- 7. Join customers
  order_with_customer AS (
    SELECT po.*,
           c.customer_code,
           COALESCE(c.name, po.delivery_name) AS customer_name,
           c.contact_person,
           COALESCE(c.phone, po.delivery_phone) AS customer_phone
    FROM paged_orders po
    LEFT JOIN customers c ON c.id = po.customer_id
  ),

  -- 8. Order items + variation extras (sku, barcode, attributes) with row number
  order_items_enriched AS (
    SELECT
      oi.id AS item_id,
      oi.order_id,
      oi.product_id,
      oi.variation_id,
      oi.product_name,
      oi.variation_label,
      oi.product_code,
      oi.quantity,
      pv.sku,
      pv.barcode,
      pv.attributes,
      ROW_NUMBER() OVER (PARTITION BY oi.order_id ORDER BY oi.created_at, oi.id) AS rn
    FROM order_items oi
    LEFT JOIN product_variations pv ON pv.id = oi.variation_id
    WHERE oi.order_id IN (SELECT id FROM paged_orders)
      AND oi.company_id = p_company_id
  ),

  -- 9. Best image per variation (first by sort_order)
  var_images AS (
    SELECT DISTINCT ON (pi.variation_id)
      pi.variation_id,
      pi.image_url
    FROM product_images pi
    WHERE pi.company_id = p_company_id
      AND pi.variation_id IN (SELECT variation_id FROM order_items_enriched WHERE variation_id IS NOT NULL AND rn <= 3)
    ORDER BY pi.variation_id, pi.sort_order ASC
  ),

  -- 9b. Best image per product (fallback)
  prod_images AS (
    SELECT DISTINCT ON (pi.product_id)
      pi.product_id,
      pi.image_url
    FROM product_images pi
    WHERE pi.company_id = p_company_id
      AND pi.variation_id IS NULL
      AND pi.product_id IN (SELECT product_id FROM order_items_enriched WHERE product_id IS NOT NULL AND rn <= 3)
    ORDER BY pi.product_id, pi.sort_order ASC
  ),

  -- 10. Items preview (first 3 per order) with cleaned variation label + subtitle + image
  items_preview AS (
    SELECT
      oie.order_id,
      jsonb_agg(
        jsonb_build_object(
          'product_name', oie.product_name,
          'variation_label',
            CASE
              WHEN oie.attributes IS NOT NULL
                AND jsonb_typeof(oie.attributes) = 'object'
                AND EXISTS (
                  SELECT 1 FROM jsonb_each_text(oie.attributes) kv
                  WHERE kv.value IS NOT NULL AND TRIM(kv.value) != ''
                )
              THEN (
                SELECT string_agg(TRIM(kv.value), ' / ')
                FROM jsonb_each_text(oie.attributes) kv
                WHERE kv.value IS NOT NULL AND TRIM(kv.value) != ''
              )
              WHEN oie.variation_label IS NOT NULL
                AND oie.variation_label != ''
                AND oie.variation_label IS DISTINCT FROM oie.product_code
                AND oie.variation_label IS DISTINCT FROM oie.barcode
                AND oie.variation_label IS DISTINCT FROM oie.sku
                AND oie.variation_label !~ '^\d+$'
              THEN oie.variation_label
              ELSE NULL
            END,
          'subtitle',
            NULLIF(
              CONCAT_WS(' | ',
                NULLIF(oie.product_code, ''),
                CASE WHEN oie.sku IS NOT NULL
                  AND oie.sku IS DISTINCT FROM oie.product_code
                  AND oie.sku IS DISTINCT FROM oie.barcode
                  THEN 'SKU: ' || oie.sku
                END
              ), ''
            ),
          'quantity', oie.quantity,
          'image', COALESCE(vi.image_url, pri.image_url)
        ) ORDER BY oie.rn
      ) AS preview
    FROM order_items_enriched oie
    LEFT JOIN var_images vi ON vi.variation_id = oie.variation_id
    LEFT JOIN prod_images pri ON pri.product_id = oie.product_id
    WHERE oie.rn <= 3
    GROUP BY oie.order_id
  ),

  -- 11. Item counts per order
  item_counts AS (
    SELECT
      order_id,
      SUM(quantity)::int AS item_count,
      COUNT(*)::int AS item_line_count
    FROM order_items_enriched
    GROUP BY order_id
  ),

  -- 12. Branch names per order
  branch_names AS (
    SELECT
      oi.order_id,
      jsonb_agg(DISTINCT sa.address_name) AS names
    FROM order_items oi
    INNER JOIN order_shipments os ON os.order_item_id = oi.id
    INNER JOIN shipping_addresses sa ON sa.id = os.shipping_address_id
    WHERE oi.order_id IN (SELECT id FROM paged_orders)
      AND oi.company_id = p_company_id
      AND sa.address_name IS NOT NULL
    GROUP BY oi.order_id
  ),

  -- 13. Marketplace channel info (was: shopee_channel)
  marketplace_channel AS (
    SELECT ma.id AS account_id, ma.shop_name, ma.platform,
           ma.metadata->>'shop_logo' AS shop_logo
    FROM marketplace_accounts ma
    WHERE ma.id IN (
      SELECT marketplace_account_id FROM paged_orders
      WHERE marketplace_account_id IS NOT NULL
    )
  ),

  -- 14. Chat channel info (LINE priority, then FB)
  chat_channel AS (
    SELECT DISTINCT ON (sub.customer_id)
      sub.customer_id,
      sub.platform,
      sub.account_name,
      sub.account_id,
      sub.account_picture_url,
      sub.customer_picture_url
    FROM (
      SELECT
        lc.customer_id,
        'line'::text AS platform,
        COALESCE(ca.account_name, 'LINE') AS account_name,
        ca.id::text AS account_id,
        ca.credentials->>'bot_picture_url' AS account_picture_url,
        lc.picture_url AS customer_picture_url,
        1 AS priority
      FROM line_contacts lc
      LEFT JOIN chat_accounts ca ON ca.id = lc.chat_account_id
      WHERE lc.company_id = p_company_id
        AND lc.customer_id IN (SELECT customer_id FROM paged_orders WHERE customer_id IS NOT NULL)
      UNION ALL
      SELECT
        fc.customer_id,
        'facebook'::text AS platform,
        COALESCE(ca.account_name, 'Facebook') AS account_name,
        ca.id::text AS account_id,
        COALESCE(ca.credentials->>'page_picture_url', ca.credentials->>'ig_profile_picture_url') AS account_picture_url,
        fc.picture_url AS customer_picture_url,
        2 AS priority
      FROM fb_contacts fc
      LEFT JOIN chat_accounts ca ON ca.id = fc.chat_account_id
      WHERE fc.company_id = p_company_id
        AND fc.customer_id IN (SELECT customer_id FROM paged_orders WHERE customer_id IS NOT NULL)
    ) sub
    ORDER BY sub.customer_id, sub.priority
  ),

  -- 15. Created by names for paged orders
  created_by_map AS (
    SELECT up.id, COALESCE(up.name, up.email, 'Unknown') AS name
    FROM user_profiles up
    WHERE up.id IN (SELECT created_by FROM paged_orders WHERE created_by IS NOT NULL)
  ),

  -- 16. Channel filter options (all active accounts)
  channel_opts AS (
    SELECT ca.id::text, ca.platform, ca.account_name AS name,
           CASE
             WHEN ca.platform = 'line' THEN ca.credentials->>'bot_picture_url'
             ELSE COALESCE(ca.credentials->>'page_picture_url', ca.credentials->>'ig_profile_picture_url')
           END AS picture_url
    FROM chat_accounts ca
    WHERE ca.company_id = p_company_id AND ca.is_active = true
    UNION ALL
    SELECT ma.id::text, ma.platform::text AS platform, COALESCE(ma.shop_name, 'Marketplace') AS name,
           ma.metadata->>'shop_logo' AS picture_url
    FROM marketplace_accounts ma
    WHERE ma.company_id = p_company_id AND ma.is_active = true
  ),

  -- 17. Created by filter options (all active members)
  created_by_opts AS (
    SELECT up.id::text, COALESCE(up.name, up.email, 'Unknown') AS name
    FROM company_members cm
    INNER JOIN user_profiles up ON up.id = cm.user_id
    WHERE cm.company_id = p_company_id AND cm.is_active = true
  ),

  -- 18. Assemble each order as jsonb
  orders_assembled AS (
    SELECT
      jsonb_build_object(
        'id', oc.id,
        'order_number', oc.order_number,
        'order_date', oc.order_date,
        'created_at', oc.created_at,
        'delivery_date', oc.delivery_date,
        'subtotal', oc.subtotal,
        'discount_amount', oc.discount_amount,
        'vat_amount', oc.vat_amount,
        'shipping_fee', oc.shipping_fee,
        'total_amount', oc.total_amount,
        'order_status', oc.order_status,
        'payment_status', oc.payment_status,
        'payment_method', oc.payment_method,
        'source', oc.source,
        'external_status', oc.external_status,
        'external_order_sn', oc.external_order_sn,
        'customer_id', oc.customer_id,
        'marketplace_account_id', oc.marketplace_account_id,
        'created_by', oc.created_by,
        'delivery_name', oc.delivery_name,
        'delivery_phone', oc.delivery_phone,
        'customer_code', oc.customer_code,
        'customer_name', oc.customer_name,
        'contact_person', oc.contact_person,
        'customer_phone', oc.customer_phone,
        'branch_names', COALESCE(bn.names, '[]'::jsonb),
        'channel',
          CASE
            WHEN oc.marketplace_account_id IS NOT NULL THEN (
              SELECT jsonb_build_object(
                'platform', mc.platform,
                'account_name', mc.shop_name,
                'account_id', oc.marketplace_account_id,
                'picture_url', mc.shop_logo
              )
              FROM marketplace_channel mc WHERE mc.account_id = oc.marketplace_account_id
            )
            WHEN cc.customer_id IS NOT NULL THEN
              jsonb_build_object(
                'platform', cc.platform,
                'account_name', cc.account_name,
                'account_id', cc.account_id,
                'picture_url', cc.account_picture_url
              )
            ELSE NULL
          END,
        'customer_picture_url', cc.customer_picture_url,
        'created_by_name', cbm.name,
        'fulfillment_status', oc.fulfillment_status,
        'hold_reason', oc.hold_reason,
        'tracking_number', oc.tracking_number,
        'shipping_carrier', oc.shipping_carrier,
        'items_preview', COALESCE(ip.preview, '[]'::jsonb),
        'item_count', COALESCE(ic.item_count, 0),
        'item_line_count', COALESCE(ic.item_line_count, 0)
      ) AS order_json,
      -- Keep sort columns for final ordering
      oc.created_at AS _created_at,
      oc.order_date AS _order_date,
      oc.delivery_date AS _delivery_date,
      oc.total_amount AS _total_amount,
      oc.order_number AS _order_number
    FROM order_with_customer oc
    LEFT JOIN items_preview ip ON ip.order_id = oc.id
    LEFT JOIN item_counts ic ON ic.order_id = oc.id
    LEFT JOIN branch_names bn ON bn.order_id = oc.id
    LEFT JOIN chat_channel cc ON cc.customer_id = oc.customer_id
      AND oc.marketplace_account_id IS NULL
    LEFT JOIN created_by_map cbm ON cbm.id = oc.created_by
  )

  -- Final assembly
  SELECT jsonb_build_object(
    'orders', COALESCE(
      (SELECT jsonb_agg(oa.order_json ORDER BY
        CASE WHEN p_sort_by = 'created_at'    AND p_sort_dir = 'desc' THEN oa._created_at    END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'created_at'    AND p_sort_dir = 'asc'  THEN oa._created_at    END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'order_date'    AND p_sort_dir = 'desc' THEN oa._order_date    END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'order_date'    AND p_sort_dir = 'asc'  THEN oa._order_date    END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'delivery_date' AND p_sort_dir = 'desc' THEN oa._delivery_date END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'delivery_date' AND p_sort_dir = 'asc'  THEN oa._delivery_date END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'total_amount'  AND p_sort_dir = 'desc' THEN oa._total_amount  END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'total_amount'  AND p_sort_dir = 'asc'  THEN oa._total_amount  END ASC  NULLS LAST,
        CASE WHEN p_sort_by = 'order_number'  AND p_sort_dir = 'desc' THEN oa._order_number  END DESC NULLS LAST,
        CASE WHEN p_sort_by = 'order_number'  AND p_sort_dir = 'asc'  THEN oa._order_number  END ASC  NULLS LAST
      ) FROM orders_assembled oa),
      '[]'::jsonb
    ),
    'pagination', jsonb_build_object(
      'page', p_page,
      'limit', p_limit,
      'total', (SELECT total FROM filtered_total),
      'totalPages', CEIL((SELECT total FROM filtered_total)::numeric / GREATEST(p_limit, 1))
    ),
    'statusCounts', (
      SELECT jsonb_build_object(
        'all', total_all,
        'new', cnt_new,
        'ready_to_ship', cnt_rts,
        'processing', cnt_proc,
        'shipping', cnt_ship,
        'completed', cnt_comp,
        'cancelled', cnt_canc
      ) FROM agg_counts
    ),
    'paymentCounts', (
      SELECT jsonb_build_object(
        'all', total_all,
        'pending', pay_pend,
        'verifying', pay_ver,
        'paid', pay_paid,
        'cancelled', pay_canc
      ) FROM agg_counts
    ),
    'channelOptions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', co.id, 'platform', co.platform, 'name', co.name, 'picture_url', co.picture_url))
       FROM channel_opts co), '[]'::jsonb
    ),
    'createdByOptions', COALESCE(
      (SELECT jsonb_agg(jsonb_build_object('id', cbo.id, 'name', cbo.name))
       FROM created_by_opts cbo), '[]'::jsonb
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;
