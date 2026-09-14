'use client';

// การ์ด "ออเดอร์นี้มาจากร้านไหน และได้เงินจริงเท่าไหร่" — **ตัวเดียวทุกแพลตฟอร์ม**
//
// ⛔ ห้าม `if (platform === 'shopee')` หรือพิมพ์ชื่อแพลตฟอร์มเป็นสตริงในไฟล์นี้
//    ป้ายชื่อมาจาก `MARKETPLACE_PLATFORMS[platform].label` · ไอคอนจาก `PlatformIcon`
//    ค่าธรรมเนียมมาจากช่องกลางของ `fee-types.ts` (ทุกเจ้าแปลงเข้ามาที่ชุดเดียวกันแล้ว)
//
// ข้อมูลมาจาก `GET /api/orders/[id]/settlement` (อ่านจาก DB ไม่ยิง API แพลตฟอร์ม)
// ปุ่ม "ดึงรายการเงิน" ยิง `POST /api/marketplace/settlements/sync-order` แล้วโหลดใหม่
//
// การ์ดนี้เป็น **เจ้าของ request เดียวของหน้า** — ข้อมูลผู้ซื้อ (`buyer`) ที่บล็อกลูกค้า
// ของหน้า `/orders/[id]` ใช้ ส่งออกทาง `onLoaded` ห้ามให้หน้าแม่ยิง `/settlement` ซ้ำ
//
// สวิตช์ "ไม่นับส่วนลด" = มองค่าธรรมเนียมเทียบกับ "ยอดหลังหักส่วนลดร้าน" (เงินที่เรา
// ขายได้จริง) แทนราคาป้าย — จำค่าไว้ต่อเครื่องผู้ใช้ใน localStorage

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, Copy, RefreshCw, Wallet } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import HelpHint from '@/components/ui/HelpHint';
import PlatformIcon from '@/components/ui/PlatformIcon';
import Toggle from '@/components/ui/Toggle';
import { InfoChip } from '@/components/ui/StatusBadge';
import { LoadingCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCopy } from '@/lib/useCopy';
import { useStableCallback } from '@/lib/useStableCallback';
import { formatPrice } from '@/lib/utils/format';
import { MARKETPLACE_PLATFORMS } from '@/lib/marketplace/platforms';
import type { MarketplaceBuyer } from '@/lib/marketplace/buyer-adapter';
import {
  FEE_BUCKETS, BUCKET_SIGN, BUCKET_LABELS, BUCKET_HINTS, COGS_BASIS_HINTS,
  type FeeBucket,
} from '@/lib/marketplace/fee-types';

interface SettlementRow {
  net_payout?: number | string | null;
  buyer_paid?: number | string | null;
  cogs?: number | string | null;
  cogs_basis?: string | null;
  gross_profit?: number | string | null;
  currency?: string | null;
  settled_at?: string | null;
  statement_period?: string | null;
  [bucket: string]: unknown;
}

interface SettlementLineRow {
  id: string;
  platform_fee_name: string | null;
  platform_fee_code: string | null;
  bucket: string | null;
  amount: number | string | null;
  vat: number | string | null;
  wht: number | string | null;
}

export interface SettlementResponse {
  account: { id: string; platform: string | null; shop_name: string | null } | null;
  external_order_id: string | null;
  external_status: string | null;
  /** ผู้ซื้อเท่าที่แพลตฟอร์มยอมบอก — ช่องที่ถูกปิดบังมาเป็น null แล้ว */
  buyer: MarketplaceBuyer | null;
  buyer_note: string | null;
  settlement: SettlementRow | null;
  lines: SettlementLineRow[];
  can_view_cost: boolean;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * ค่าธรรมเนียมที่แพลตฟอร์มหักเรา = ทุกช่องที่ทิศเป็น `-` **ยกเว้นส่วนลดร้าน**
 * (ส่วนลดที่ร้านออกเองไม่ใช่ค่าธรรมเนียม เอามารวมแล้ว % จะดูสูงเกินจริง)
 */
const FEE_DEDUCTION_BUCKETS = FEE_BUCKETS.filter(
  b => BUCKET_SIGN[b] === '-' && b !== 'seller_discount',
);

/**
 * ช่องที่ "ไม่ใช่เงินที่แพลตฟอร์มหักเรา" — สวิตช์ "ไม่นับส่วนลด" เอาออกจากการคิด
 * · ส่วนลดร้าน = ร้านลดเอง (ถอดออกจากฐาน ไม่ใช่ค่าธรรมเนียม)
 * · ส่วนลดที่แพลตฟอร์มออกให้ = แพลตฟอร์มจ่ายแทนลูกค้า ไม่กระทบเงินเรา (แค่ข้อมูล)
 * ส่วน "เงินที่แพลตฟอร์มช่วยจ่าย" ยังโชว์ เพราะมันหักลบกับค่าธรรมเนียมจริง
 */
const DISCOUNT_BUCKETS: FeeBucket[] = ['seller_discount', 'platform_discount'];

/** จำค่าสวิตช์ต่อเครื่องผู้ใช้ (localStorage อาจอ่าน/เขียนไม่ได้ — ครอบ try/catch เสมอ) */
const HIDE_DISCOUNTS_KEY = 'mp-card-hide-discounts';

const SIGN_PREFIX: Record<'+' | '-' | '±', string> = { '+': '+', '-': '−', '±': '±' };

/** สัดส่วนของยอดตั้งต้น — ยอดตั้งต้นเป็น 0 = บอกเป็น % ไม่ได้ (ห้ามโชว์ 0.0%) */
function pctOf(amount: number, base: number): number | null {
  if (!base) return null;
  return (Math.abs(amount) / base) * 100;
}

function PctNote({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return <span className="text-gray-400 dark:text-slate-500">({pct.toFixed(1)}%)</span>;
}

function AmountRow({
  label, hint, amount, sign, tone = 'default', strong = false, pct = null,
}: {
  label: string;
  hint?: string;
  amount: number;
  sign?: '+' | '-' | '±';
  tone?: 'default' | 'good' | 'bad';
  strong?: boolean;
  /** % ของยอดขาย — null = ไม่มียอดขายให้เทียบ */
  pct?: number | null;
}) {
  const color = tone === 'good'
    ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'bad'
      ? 'text-red-500 dark:text-red-400'
      : 'text-gray-800 dark:text-slate-200';
  // ช่องค่าธรรมเนียมเก็บเป็นบวกเสมอ (ทิศมาจาก `sign`) — ส่วนยอดสรุป (เงินเข้าจริง/กำไร)
  // ติดลบได้จริง เช่นออเดอร์ที่คืนของแล้วเหลือแต่ค่าธรรมเนียม
  const shown = Math.abs(amount);
  const prefix = sign ? SIGN_PREFIX[sign] : (amount < 0 ? '−' : '');
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-semibold' : ''}`}>
      <span className="text-gray-600 dark:text-slate-300 flex items-center">
        {label}
        {hint && <HelpHint>{hint}</HelpHint>}
      </span>
      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
        <span className={`${color} tabular-nums`}>
          {prefix}฿{formatPrice(shown)}
        </span>
        <PctNote pct={pct} />
      </span>
    </div>
  );
}

export default function MarketplaceOrderCard({
  orderId, onLoaded,
}: {
  orderId: string;
  /**
   * ส่งข้อมูลที่โหลดมาให้หน้าแม่ใช้ต่อ (เช่นบล็อกลูกค้าที่ต้องใช้ `buyer`)
   * — **มีไว้เพื่อให้ทั้งหน้ายิง `/settlement` แค่ครั้งเดียว** ห้ามให้หน้าแม่ยิงซ้ำเอง
   */
  onLoaded?: (data: SettlementResponse) => void;
}) {
  const { showToast } = useToast();
  const copy = useCopy();
  const [data, setData] = useState<SettlementResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showLines, setShowLines] = useState(false);
  // ค่าตั้งต้น = ไม่นับส่วนลด (เจ้าของถาม "ส่วนลดร้านไม่ควรรวม" — มุมมองปกติควรเป็นแบบนี้)
  const [hideDiscounts, setHideDiscounts] = useState(true);

  // identity คงที่ — ไม่งั้น `load` เปลี่ยนทุก render ของหน้าแม่แล้วยิง API วนไม่จบ
  const emitLoaded = useStableCallback((payload: SettlementResponse) => { onLoaded?.(payload); });

  // ค่าสวิตช์อ่านหลัง mount (ไม่ใช่ตอน render) — กัน hydration ไม่ตรงกับฝั่ง server
  useEffect(() => {
    try {
      const stored = localStorage.getItem(HIDE_DISCOUNTS_KEY);
      if (stored !== null) setHideDiscounts(stored === '1');
    } catch { /* โหมดส่วนตัว / ปิดการเก็บข้อมูลเว็บ — ใช้ค่าตั้งต้นไป */ }
  }, []);

  const toggleHideDiscounts = (v: boolean) => {
    setHideDiscounts(v);
    try {
      localStorage.setItem(HIDE_DISCOUNTS_KEY, v ? '1' : '0');
    } catch { /* เก็บไม่ได้ก็แค่ไม่จำข้ามครั้ง */ }
  };

  const load = useCallback(async () => {
    try {
      const res = await apiFetch(`/api/orders/${orderId}/settlement`);
      if (!res.ok) { setData(null); return; }
      const json: SettlementResponse = await res.json();
      setData(json);
      emitLoaded(json);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, emitLoaded]);

  useEffect(() => { load(); }, [load]);

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await apiFetch('/api/marketplace/settlements/sync-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order_id: orderId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(json.error || 'ดึงรายการเงินไม่สำเร็จ', 'error');
        return;
      }
      if (json.status === 'saved') {
        showToast('ดึงรายการเงินแล้ว', 'success');
        await load();
      } else if (json.status === 'pending') {
        showToast('ยังไม่ถึงรอบโอนของแพลตฟอร์ม');
      } else {
        showToast(json.message || 'ดึงรายการเงินไม่สำเร็จ', 'error');
      }
    } catch {
      showToast('ดึงรายการเงินไม่สำเร็จ', 'error');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) return <LoadingCard />;
  if (!data?.account) return null;

  const platform = data.account.platform || '';
  const platformLabel = MARKETPLACE_PLATFORMS[platform as keyof typeof MARKETPLACE_PLATFORMS]?.label || platform;
  const shopName = data.account.shop_name || platformLabel;

  const s = data.settlement;
  const grossSales = num(s?.gross_sales);
  const netPayout = num(s?.net_payout);
  const feeTotal = FEE_DEDUCTION_BUCKETS.reduce((sum, b) => sum + num(s?.[b]), 0);
  const feePct = pctOf(feeTotal, grossSales);
  // ฐาน "ยอดหลังหักส่วนลดร้าน" — ส่วนลดที่ร้านออกเองไม่เคยเข้ากระเป๋าเรา
  // จึงเป็นฐานที่ตอบว่า "เงินที่ขายได้จริง โดนแพลตฟอร์มกินไปกี่ %"
  const sellerDiscount = num(s?.seller_discount);
  const afterSellerDiscount = grossSales - sellerDiscount;
  // "แพลตฟอร์มหักจริง" = ยอดที่ร้านขายได้จริง − เงินที่เข้ากระเป๋า
  // (ค่าธรรมเนียมทุกช่อง หักลบด้วยเงินที่แพลตฟอร์มช่วยจ่าย/ชดเชย — ตัวเลขเดียวที่ตอบว่าเสียไปเท่าไหร่)
  const realDeduction = afterSellerDiscount - netPayout;
  const realDeductionPct = pctOf(realDeduction, afterSellerDiscount);
  // ฐานของ % ทุกบรรทัด: ปกติ = ยอดขาย · ไม่นับส่วนลด = ยอดหลังหักส่วนลดร้าน
  const pctBase = hideDiscounts ? afterSellerDiscount : grossSales;
  const cogs = s?.cogs == null ? null : num(s.cogs);
  const grossProfit = s?.gross_profit == null ? null : num(s.gross_profit);
  const cogsBasis = (s?.cogs_basis || '') as keyof typeof COGS_BASIS_HINTS;

  return (
    <Card className="space-y-4">
      {/* หัวการ์ด — ร้าน + เลขออเดอร์ของแพลตฟอร์ม + สถานะดิบ */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <PlatformIcon id={platform} size={20} title={platformLabel} />
          <span className="font-medium text-gray-900 dark:text-slate-100 truncate">{shopName}</span>
          {data.external_status && (
            <InfoChip colors="bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-slate-200">
              {data.external_status}
            </InfoChip>
          )}
        </div>
        {data.external_order_id && (
          <button
            type="button"
            onClick={() => copy(data.external_order_id!, 'เลขออเดอร์')}
            className="inline-flex items-center gap-1.5 text-gray-600 dark:text-slate-300 hover:text-primary transition-colors font-mono"
            aria-label="คัดลอกเลขออเดอร์ของแพลตฟอร์ม"
          >
            {data.external_order_id}
            <Copy className="w-4 h-4" />
          </button>
        )}
      </div>

      {data.buyer_note && (
        <div className="inner-panel px-3 py-2">
          <span className="text-gray-500 dark:text-slate-400">ข้อความจากผู้ซื้อ:</span>{' '}
          <span className="text-gray-700 dark:text-slate-200">{data.buyer_note}</span>
        </div>
      )}

      {/* เงินที่ได้รับจริง */}
      {!s ? (
        <div className="inner-panel px-4 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="text-gray-600 dark:text-slate-300">
            ยังไม่มีรายการเงินจากแพลตฟอร์ม (ยังไม่ถึงรอบโอน หรือยังไม่ได้ดึง)
          </div>
          <Button
            variant="secondary"
            icon={<RefreshCw className="w-4 h-4" />}
            loading={syncing}
            onClick={handleSync}
          >
            ดึงรายการเงิน
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400">
              <Wallet className="w-4 h-4" />
              <span className="font-medium">เงินที่ได้รับจริง</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-gray-600 dark:text-slate-300">ไม่นับส่วนลด</span>
                <Toggle
                  checked={hideDiscounts}
                  onChange={toggleHideDiscounts}
                  aria-label="ไม่นับส่วนลด"
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={<RefreshCw className="w-4 h-4" />}
                loading={syncing}
                onClick={handleSync}
              >
                ดึงใหม่
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {hideDiscounts && sellerDiscount > 0 ? (
              <AmountRow
                label="ยอดหลังหักส่วนลดร้าน"
                hint={`ยอดขาย ฿${formatPrice(grossSales)} − ส่วนลดร้าน ฿${formatPrice(sellerDiscount)} — เงินที่ร้านขายได้จริง ใช้เป็นฐานคิด % ทุกบรรทัด`}
                amount={afterSellerDiscount}
                pct={pctOf(afterSellerDiscount, pctBase)}
              />
            ) : (
              <AmountRow
                label={BUCKET_LABELS.gross_sales}
                hint={BUCKET_HINTS.gross_sales}
                amount={grossSales}
                pct={pctOf(grossSales, pctBase)}
              />
            )}
            {FEE_BUCKETS
              .filter(b => b !== 'gross_sales' && num(s[b]) !== 0)
              .filter(b => !(hideDiscounts && DISCOUNT_BUCKETS.includes(b)))
              .map(b => (
                <AmountRow
                  key={b}
                  label={BUCKET_LABELS[b as FeeBucket]}
                  hint={BUCKET_HINTS[b as FeeBucket]}
                  amount={num(s[b])}
                  sign={BUCKET_SIGN[b as FeeBucket]}
                  tone={BUCKET_SIGN[b as FeeBucket] === '-' ? 'bad' : BUCKET_SIGN[b as FeeBucket] === '+' ? 'good' : 'default'}
                  pct={pctOf(num(s[b]), pctBase)}
                />
              ))}

            <div className="pt-2 border-t border-gray-200 dark:border-slate-600">
              <AmountRow
                label={BUCKET_LABELS.net_payout}
                amount={netPayout}
                tone={netPayout < 0 ? 'bad' : 'good'}
                strong
                pct={pctOf(netPayout, pctBase)}
              />
            </div>
            {hideDiscounts && realDeductionPct !== null ? (
              <div className="text-right text-gray-500 dark:text-slate-400">
                <span className="font-medium text-red-500 dark:text-red-400">
                  แพลตฟอร์มหักจริง ฿{formatPrice(realDeduction)} ({realDeductionPct.toFixed(1)}%)
                </span>
                <HelpHint align="right">
                  {`หักจริง = ยอดหลังหักส่วนลดร้าน ฿${formatPrice(afterSellerDiscount)} − เงินเข้าจริง ฿${formatPrice(netPayout)} · คือค่าธรรมเนียมทุกช่อง (฿${formatPrice(feeTotal)}) หักลบเงินที่แพลตฟอร์มช่วยจ่าย/ชดเชยแล้ว · ส่วนลดที่ร้านลดเองและส่วนลดที่แพลตฟอร์มออกให้ไม่ถูกนับ`}
                </HelpHint>
              </div>
            ) : feePct !== null && (
              <div className="text-right text-gray-500 dark:text-slate-400">
                ค่าธรรมเนียมรวม ฿{formatPrice(feeTotal)} ({feePct.toFixed(1)}% ของยอดขาย)
              </div>
            )}

            {data.can_view_cost && cogs !== null && (
              <div className="pt-2 border-t border-gray-200 dark:border-slate-600 space-y-2">
                <AmountRow
                  label={BUCKET_LABELS.cogs}
                  hint={COGS_BASIS_HINTS[cogsBasis]}
                  amount={cogs}
                  sign="-"
                  tone="bad"
                  pct={pctOf(cogs, grossSales)}
                />
                {grossProfit !== null && (
                  <AmountRow
                    label={BUCKET_LABELS.gross_profit}
                    amount={grossProfit}
                    tone={grossProfit >= 0 ? 'good' : 'bad'}
                    strong
                    pct={pctOf(grossProfit, grossSales)}
                  />
                )}
              </div>
            )}
          </div>

          {/* รายการดิบตามที่แพลตฟอร์มเรียก — หลักฐานย้อนกลับของยอดข้างบน */}
          {data.lines.length > 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-slate-600">
              <button
                type="button"
                onClick={() => setShowLines(v => !v)}
                className="flex items-center gap-2 text-gray-600 dark:text-slate-300 hover:text-gray-900 dark:hover:text-slate-100 transition-colors w-full"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showLines ? 'rotate-0' : '-rotate-90'}`} />
                <span>รายการจากแพลตฟอร์ม ({data.lines.length})</span>
              </button>
              {showLines && (
                <div className="mt-3 space-y-2 pl-6">
                  {data.lines.map(line => (
                    <div key={line.id} className="flex items-baseline justify-between gap-3">
                      <span className="text-gray-600 dark:text-slate-300 min-w-0">
                        {line.platform_fee_name || line.platform_fee_code || '-'}
                        {(num(line.vat) !== 0 || num(line.wht) !== 0) && (
                          <span className="text-gray-400 dark:text-slate-500">
                            {num(line.vat) !== 0 && ` · VAT ฿${formatPrice(num(line.vat))}`}
                            {num(line.wht) !== 0 && ` · หัก ณ ที่จ่าย ฿${formatPrice(num(line.wht))}`}
                          </span>
                        )}
                      </span>
                      <span className="flex items-baseline gap-1.5 whitespace-nowrap">
                        <span className="text-gray-800 dark:text-slate-200 tabular-nums">
                          ฿{formatPrice(num(line.amount))}
                        </span>
                        <PctNote pct={pctOf(num(line.amount), grossSales)} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
