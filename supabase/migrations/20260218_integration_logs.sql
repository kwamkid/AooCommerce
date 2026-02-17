-- Integration Logs: per-request detail for all marketplace integrations
CREATE TABLE public.integration_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  integration TEXT NOT NULL,           -- 'shopee', 'line', 'lazada'
  account_id UUID,                     -- shopee_accounts.id
  account_name TEXT,                   -- shop name (denormalized)

  direction TEXT NOT NULL CHECK (direction IN ('outgoing', 'incoming')),
  action TEXT NOT NULL,                -- 'sync_orders_manual', 'webhook_order_status'

  method TEXT,                         -- 'GET', 'POST'
  api_path TEXT,                       -- '/api/v2/order/get_order_list'
  request_body JSONB,
  response_body JSONB,
  http_status INT,

  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'pending')),
  error_message TEXT,

  reference_type TEXT,                 -- 'order'
  reference_id TEXT,                   -- order_sn
  reference_label TEXT,

  duration_ms INT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intlog_company_created ON integration_logs(company_id, created_at DESC);
CREATE INDEX idx_intlog_integration ON integration_logs(company_id, integration, created_at DESC);
CREATE INDEX idx_intlog_status ON integration_logs(company_id, status, created_at DESC);

ALTER TABLE integration_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "integration_logs_access" ON integration_logs FOR ALL USING (true);
