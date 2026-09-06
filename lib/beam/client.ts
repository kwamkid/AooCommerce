// Beam Checkout — ตัวกลางเรียก API + อ่านค่าตั้งค่า gateway ของแต่ละบริษัท (server-only)
//
// ที่มา: webhook ของ Beam ถูกเราปฏิเสธ 401 เงียบ ๆ ทุกใบตั้งแต่เปิดใช้ (ดู fix-bug.md 2026-09-06)
// จึงต้องมีทาง "ถาม Beam เอง" ว่าลิงก์จ่ายเงินใบนี้จ่ายแล้วหรือยัง — ตัวนี้คือ client ตัวเดียว
// ที่ทั้ง webhook · reconcile · create-payment-link ควรใช้ร่วมกัน (ห้ามประกอบ Basic auth เองอีก)
//
// เอกสาร: https://docs.beamcheckout.com (Payment Links API · Webhook Notifications)
import { supabaseAdmin } from '@/lib/supabase-admin';

export interface BeamGateway {
  channelId: string;
  companyId: string;
  merchantId: string;
  apiKey: string;
  /**
   * HMAC key ของ webhook — ได้จาก Beam Lighthouse ตอนสร้าง webhook endpoint
   * **คนละตัวกับ API key** (เอกสาร "Authenticating Webhooks") · ไม่ตั้ง = ตรวจลายเซ็น webhook ไม่ได้
   */
  webhookSecret: string | null;
  environment: 'production' | 'sandbox';
}

export function beamBaseUrl(environment: BeamGateway['environment']): string {
  return environment === 'production'
    ? 'https://api.beamcheckout.com'
    : 'https://playground.api.beamcheckout.com';
}

/** ช่องทาง gateway ที่เปิดอยู่ — กรองด้วยบริษัท หรือ merchantId (ที่ Beam ส่งมาใน webhook) */
export async function loadBeamGateways(
  filter: { companyId?: string; merchantId?: string } = {},
): Promise<BeamGateway[]> {
  let q = supabaseAdmin
    .from('payment_channels')
    .select('id, company_id, config')
    .eq('channel_group', 'bill_online')
    .eq('type', 'payment_gateway')
    .eq('is_active', true);
  if (filter.companyId) q = q.eq('company_id', filter.companyId);
  if (filter.merchantId) q = q.eq('config->>merchant_id', filter.merchantId);
  const { data, error } = await q;
  if (error || !data) return [];
  return data.flatMap((row) => {
    const cfg = (row.config || {}) as Record<string, unknown>;
    const merchantId = cfg.merchant_id;
    const apiKey = cfg.api_key;
    if (typeof merchantId !== 'string' || !merchantId || typeof apiKey !== 'string' || !apiKey) return [];
    return [{
      channelId: row.id as string,
      companyId: row.company_id as string,
      merchantId,
      apiKey,
      webhookSecret: typeof cfg.webhook_secret === 'string' && cfg.webhook_secret ? cfg.webhook_secret : null,
      environment: cfg.environment === 'sandbox' ? 'sandbox' : 'production',
    }];
  });
}

export interface BeamPaymentLink {
  paymentLinkId: string;
  merchantId: string;
  /** ACTIVE · PAID · (หมดอายุ/ปิด) */
  status: string;
  url?: string;
  order?: { referenceId?: string; netAmount?: number; currency?: string; description?: string };
}

export interface BeamCharge {
  chargeId: string;
  /** SUCCEEDED · FAILED · … */
  status: string;
  referenceId?: string;
  source?: string;
  sourceId?: string;
  amount?: number;
  currency?: string;
  transactionTime?: string;
  paymentMethod?: { paymentMethodType?: string } | null;
}

async function beamGet<T>(gw: BeamGateway, path: string): Promise<{ ok: boolean; status: number; data: T | null; raw: string }> {
  const res = await fetch(`${beamBaseUrl(gw.environment)}${path}`, {
    headers: { Authorization: 'Basic ' + Buffer.from(`${gw.merchantId}:${gw.apiKey}`).toString('base64') },
    cache: 'no-store',
  });
  const raw = await res.text();
  let data: T | null = null;
  try { data = raw ? (JSON.parse(raw) as T) : null; } catch { data = null; }
  return { ok: res.ok, status: res.status, data, raw };
}

/** สถานะลิงก์จ่ายเงินตามที่ Beam รู้ — แหล่งความจริงเมื่อ webhook ไม่มา */
export function getBeamPaymentLink(gw: BeamGateway, paymentLinkId: string) {
  return beamGet<BeamPaymentLink>(gw, `/api/v1/payment-links/${encodeURIComponent(paymentLinkId)}`);
}

/** charge ทั้งหมดของลิงก์นี้ (ลูกค้ากดจ่ายได้หลายรอบ ลิงก์เป็น PAID เมื่อมีสัก charge SUCCEEDED) */
export async function getBeamPaymentLinkCharges(gw: BeamGateway, paymentLinkId: string): Promise<BeamCharge[]> {
  const r = await beamGet<{ data?: BeamCharge[] }>(
    gw,
    `/api/v1/charges?source_in=PAYMENT_LINK&sourceId=${encodeURIComponent(paymentLinkId)}`,
  );
  return r.ok && Array.isArray(r.data?.data) ? r.data.data : [];
}
