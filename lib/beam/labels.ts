// Beam Checkout — แปลงข้อมูลดิบที่เก็บใน payment_records.gateway_raw_response เป็นข้อความ
// ให้หน้าออเดอร์แสดง (client-safe · ไม่แตะ DB)
//
// raw มีได้หลายทรงตามทางที่มา:
//   - charge event (webhook)      : { chargeId, paymentMethod, failureCode, … }
//   - payment_link.paid (webhook) : { paymentLinkId, status, order, … }
//   - reconcile                   : { …link, charge: { paymentMethod, … } }
//   - หลังจ่ายไม่ผ่าน / คืนเงิน    : { …เดิม, last_failure: {…}, refund: {…} }

type Raw = Record<string, unknown>;
const rec = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

const METHOD_LABELS: Record<string, string> = {
  CARD: 'บัตร',
  CARD_INSTALLMENTS: 'ผ่อนบัตร',
  QR_PROMPT_PAY: 'QR PromptPay',
  LINE_PAY: 'LINE Pay',
  SHOPEE_PAY: 'ShopeePay',
  TRUE_MONEY: 'TrueMoney',
  WECHAT_PAY: 'WeChat Pay',
  ALIPAY: 'Alipay',
  MOBILE_BANKING: 'Mobile Banking',
};

/** "VISA •1175" / "QR PromptPay" จาก paymentMethod ของ charge — null เมื่อไม่มีข้อมูล */
export function beamMethodLabel(paymentMethod: unknown): string | null {
  const pm = rec(paymentMethod);
  const type = typeof pm.paymentMethodType === 'string' ? pm.paymentMethodType : '';
  if (!type) return null;
  const card = rec(pm.card);
  if ((type === 'CARD' || type === 'CARD_INSTALLMENTS') && (card.brand || card.last4)) {
    const brand = typeof card.brand === 'string' ? card.brand : 'บัตร';
    const last4 = typeof card.last4 === 'string' ? ` •${card.last4}` : '';
    return `${brand}${last4}${type === 'CARD_INSTALLMENTS' ? ' (ผ่อน)' : ''}`;
  }
  return METHOD_LABELS[type] || type;
}

export interface BeamRecordSummary {
  /** วิธีจ่ายของ charge ที่สำเร็จ (ถ้ารู้) */
  method: string | null;
  /** ความล้มเหลวล่าสุด (ถ้ามี) */
  failure: { method: string | null; code: string | null; at: string | null } | null;
  /** การคืนเงิน (ถ้ามี) */
  refund: { succeeded: boolean; amount: number | null; refundId: string | null; reason: string | null; code: string | null; at: string | null } | null;
}

function readCharge(raw: Raw): Raw {
  // reconcile เก็บ charge ไว้ใต้ .charge · webhook charge.succeeded ตัว raw เองคือ charge
  if (raw.charge && typeof raw.charge === 'object') return rec(raw.charge);
  return raw.paymentMethod ? raw : {};
}

/** สรุปจาก raw ก้อนเดียว — หน้าออเดอร์เอาไปวาดบรรทัดสถานะ */
export function summarizeBeamRaw(rawValue: unknown): BeamRecordSummary {
  const raw = rec(rawValue);
  const charge = readCharge(raw);
  const fail = rec(raw.last_failure);
  const refund = rec(raw.refund);
  const satang = (v: unknown) => (typeof v === 'number' ? v / 100 : null);
  return {
    method: beamMethodLabel(charge.paymentMethod),
    failure: Object.keys(fail).length
      ? {
          method: beamMethodLabel(fail.paymentMethod),
          code: typeof fail.failureCode === 'string' ? fail.failureCode : null,
          at: typeof fail.updatedAt === 'string' ? fail.updatedAt : typeof fail.createdAt === 'string' ? fail.createdAt : null,
        }
      : null,
    refund: Object.keys(refund).length
      ? {
          succeeded: String(refund.status || '').toUpperCase() === 'SUCCEEDED',
          amount: satang(refund.amount),
          refundId: typeof refund.refundId === 'string' ? refund.refundId : null,
          reason: typeof refund.refundReason === 'string' ? refund.refundReason : null,
          code: typeof refund.failureCode === 'string' ? refund.failureCode : null,
          at: typeof refund.updatedAt === 'string' ? refund.updatedAt : typeof refund.createdAt === 'string' ? refund.createdAt : null,
        }
      : null,
  };
}
