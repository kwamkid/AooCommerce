-- =============================================
-- Sales Report RPC Functions for Performance
-- =============================================

-- 1. get_sales_summary: aggregate totals for sales report
CREATE OR REPLACE FUNCTION get_sales_summary(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  total_orders bigint,
  total_revenue numeric,
  total_discount numeric,
  total_vat numeric,
  total_net numeric,
  paid_amount numeric,
  pending_amount numeric
) AS $$
  SELECT
    COUNT(*)::bigint AS total_orders,
    COALESCE(SUM(subtotal), 0) AS total_revenue,
    COALESCE(SUM(discount_amount), 0) AS total_discount,
    COALESCE(SUM(vat_amount), 0) AS total_vat,
    COALESCE(SUM(total_amount), 0) AS total_net,
    COALESCE(SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END), 0) AS paid_amount,
    COALESCE(SUM(CASE WHEN payment_status != 'paid' THEN total_amount ELSE 0 END), 0) AS pending_amount
  FROM orders
  WHERE company_id = p_company_id
    AND order_status != 'cancelled'
    AND (p_start_date IS NULL OR order_date >= p_start_date)
    AND (p_end_date IS NULL OR order_date <= p_end_date);
$$ LANGUAGE sql STABLE;

-- 2. get_sales_by_customer: group by customer
CREATE OR REPLACE FUNCTION get_sales_by_customer(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  customer_id uuid,
  customer_code text,
  customer_name text,
  order_count bigint,
  total_amount numeric,
  paid_amount numeric,
  pending_amount numeric
) AS $$
  SELECT
    o.customer_id,
    COALESCE(c.customer_code, '-') AS customer_code,
    COALESCE(c.name, 'ไม่ระบุ') AS customer_name,
    COUNT(*)::bigint AS order_count,
    COALESCE(SUM(o.total_amount), 0) AS total_amount,
    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS paid_amount,
    COALESCE(SUM(CASE WHEN o.payment_status != 'paid' THEN o.total_amount ELSE 0 END), 0) AS pending_amount
  FROM orders o
  LEFT JOIN customers c ON c.id = o.customer_id
  WHERE o.company_id = p_company_id
    AND o.order_status != 'cancelled'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY o.customer_id, c.customer_code, c.name
  ORDER BY total_amount DESC;
$$ LANGUAGE sql STABLE;

-- 3. get_sales_by_product: group by product (from order_items)
CREATE OR REPLACE FUNCTION get_sales_by_product(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  product_code text,
  product_name text,
  bottle_size text,
  total_quantity bigint,
  total_amount numeric,
  order_count bigint
) AS $$
  SELECT
    oi.product_code,
    oi.product_name,
    oi.bottle_size,
    COALESCE(SUM(oi.quantity), 0)::bigint AS total_quantity,
    COALESCE(SUM(oi.total), 0) AS total_amount,
    COUNT(DISTINCT o.id)::bigint AS order_count
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE o.company_id = p_company_id
    AND o.order_status != 'cancelled'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY oi.product_code, oi.product_name, oi.bottle_size
  ORDER BY total_amount DESC;
$$ LANGUAGE sql STABLE;

-- 4. get_sales_by_date: group by order_date
CREATE OR REPLACE FUNCTION get_sales_by_date(
  p_company_id uuid,
  p_start_date date DEFAULT NULL,
  p_end_date date DEFAULT NULL
)
RETURNS TABLE (
  order_date date,
  order_count bigint,
  total_amount numeric,
  paid_amount numeric,
  pending_amount numeric
) AS $$
  SELECT
    o.order_date::date AS order_date,
    COUNT(*)::bigint AS order_count,
    COALESCE(SUM(o.total_amount), 0) AS total_amount,
    COALESCE(SUM(CASE WHEN o.payment_status = 'paid' THEN o.total_amount ELSE 0 END), 0) AS paid_amount,
    COALESCE(SUM(CASE WHEN o.payment_status != 'paid' THEN o.total_amount ELSE 0 END), 0) AS pending_amount
  FROM orders o
  WHERE o.company_id = p_company_id
    AND o.order_status != 'cancelled'
    AND (p_start_date IS NULL OR o.order_date >= p_start_date)
    AND (p_end_date IS NULL OR o.order_date <= p_end_date)
  GROUP BY o.order_date::date
  ORDER BY order_date DESC;
$$ LANGUAGE sql STABLE;
