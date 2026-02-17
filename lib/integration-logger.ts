import { supabaseAdmin } from '@/lib/supabase-admin';

export interface IntegrationLogEntry {
  company_id: string;
  integration: string;        // 'shopee'
  account_id?: string | null;
  account_name?: string | null;

  direction: 'outgoing' | 'incoming';
  action: string;             // 'sync_orders_manual', 'webhook_order_status', 'sync_orders_poll'

  method?: string;
  api_path?: string;
  request_body?: unknown;
  response_body?: unknown;
  http_status?: number;

  status: 'success' | 'error' | 'pending';
  error_message?: string;

  reference_type?: string;
  reference_id?: string;
  reference_label?: string;

  duration_ms?: number;
}

const SENSITIVE_KEYS = ['access_token', 'refresh_token', 'sign', 'partner_key', 'partner_id'];
const MAX_BODY_SIZE = 10 * 1024; // 10KB

function sanitize(obj: unknown): unknown {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.includes(key)) {
      result[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      result[key] = sanitize(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function truncateBody(obj: unknown): unknown {
  if (!obj) return obj;
  const str = JSON.stringify(obj);
  if (str.length <= MAX_BODY_SIZE) return obj;
  return { _truncated: true, _size: str.length, _preview: str.slice(0, MAX_BODY_SIZE) };
}

/**
 * Fire-and-forget: insert integration log without blocking the main flow.
 */
export function logIntegration(entry: IntegrationLogEntry): void {
  const sanitizedRequest = sanitize(entry.request_body);
  const sanitizedResponse = truncateBody(sanitize(entry.response_body));

  supabaseAdmin
    .from('integration_logs')
    .insert({
      company_id: entry.company_id,
      integration: entry.integration,
      account_id: entry.account_id || null,
      account_name: entry.account_name || null,
      direction: entry.direction,
      action: entry.action,
      method: entry.method || null,
      api_path: entry.api_path || null,
      request_body: sanitizedRequest || null,
      response_body: sanitizedResponse || null,
      http_status: entry.http_status || null,
      status: entry.status,
      error_message: entry.error_message || null,
      reference_type: entry.reference_type || null,
      reference_id: entry.reference_id || null,
      reference_label: entry.reference_label || null,
      duration_ms: entry.duration_ms || null,
    })
    .then(({ error }) => {
      if (error) {
        console.error('[IntegrationLogger] Failed to insert log:', error.message);
      }
    });
}
