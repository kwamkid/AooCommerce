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
  FEE_GROUPS, BUCKET_SIGN, BUCKET_LABELS, BUCKET_HINTS, COGS_BASIS_HINTS,
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
  label, hint, amount, sign, tone = 'default', strong = false, pct = null, muted = false,
}: {
  label: string;
  hint?: string;
  amount: number;
  sign?: '+' | '-' | '±';
  tone?: 'default' | 'good' | 'bad';
  strong?: boolean;
  /** % ของราคาที่ขายได้ — null = ไม่มียอดให้เทียบ */
  pct?: number | null;
  /** บรรทัดลูกในกลุ่ม / ข้อมูลประกอบ — จางลง */
  muted?: boolean;
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
    <div className={`flex items-baseline justify-between gap-3 ${strong ? 'font-semibold' : ''} ${muted ? 'opacity-80' : ''}`}>
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
  // identity คงที่ — ไม่งั้น `load` เปลี่ยนทุก render ของหน้าแม่แล้วยิง API วนไม่จบ
  const emitLoaded = useStableCallback((payload: SettlementResponse) => { onLoaded?.(payload); });

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
  const sellerDiscount = num(s?.seller_discount);
  const platformDiscount = num(s?.platform_discount);
  // ฐานเดียวของ % ทุกบรรทัด = ราคาที่ขายได้จริง (ราคาป้าย − ส่วนลดที่ร้านลดเอง)
  // ค่าธรรมเนียมของแพลตฟอร์มคิดจากราคานี้ (ตรวจแล้ว: ค่าธรรมเนียมชำระเงิน Lazada = 3% + VAT = 3.21% ของฐานนี้พอดี)
  const soldPrice = grossSales - sellerDiscount;
  const signed = (b: FeeBucket) => {
    const v = num(s?.[b]);
    return BUCKET_SIGN[b] === '-' ? -v : BUCKET_SIGN[b] === '+' ? v : 0; // ± ไม่รู้ทิศ ไม่รวมในยอดกลุ่ม
  };
  const groups = FEE_GROUPS
    .map(g => ({
      ...g,
      rows: g.buckets.filter(b => num(s?.[b]) !== 0),
      total: g.buckets.reduce((sum, b) => sum + signed(b), 0), // ติดลบ = เสีย
    }))
    .filter(g => g.rows.length > 0);
  const takenByPlatform = soldPrice - netPayout; // ทุกอย่างที่ไม่ถึงกระเป๋า (สุทธิหลังเงินช่วยจ่าย)
  const takenPct = pctOf(takenByPlatform, soldPrice);
  const keepPct = pctOf(netPayout, soldPrice);
  const groupPct = (g: { total: number }) => pctOf(g.total, soldPrice);
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

          {/* ฐาน: ราคาป้าย − ส่วนลดร้าน = ราคาที่ขายได้ (100%) */}
          <div className="space-y-2">
            {sellerDiscount !== 0 || platformDiscount !== 0 ? (
              <>
                <AmountRow label="ราคาป้าย" hint={BUCKET_HINTS.gross_sales} amount={grossSales} />
                {sellerDiscount !== 0 && (
                  <AmountRow
                    label={BUCKET_LABELS.seller_discount}
                    hint={`${BUCKET_HINTS.seller_discount} — ร้านลดเอง ไม่ใช่เงินที่แพลตฟอร์มเก็บ จึงไม่นับเป็นค่าธรรมเนียม`}
                    amount={sellerDiscount}
                    sign="-"
                  />
                )}
                {platformDiscount !== 0 && (
                  <AmountRow
                    label={BUCKET_LABELS.platform_discount}
                    hint={`${BUCKET_HINTS.platform_discount} — ไม่กระทบเงินที่เราได้ แสดงไว้ให้รู้ว่าลูกค้าจ่ายจริงเท่าไหร่`}
                    amount={platformDiscount}
                    sign="±"
                    muted
                  />
                )}
                <div className="pt-2 border-t border-gray-200 dark:border-slate-600">
                  <AmountRow
                    label="ราคาที่ขายได้"
                    hint="ราคาป้าย − ส่วนลดร้าน = เงินที่ร้านขายได้จริง · ค่าธรรมเนียมของแพลตฟอร์มคิดจากยอดนี้ % ทุกบรรทัดจึงเทียบกับยอดนี้"
                    amount={soldPrice}
                    pct={pctOf(soldPrice, soldPrice)}
                    strong
                  />
                </div>
              </>
            ) : (
              <AmountRow
                label="ราคาที่ขายได้"
                hint={BUCKET_HINTS.gross_sales}
                amount={soldPrice}
                pct={pctOf(soldPrice, soldPrice)}
                strong
              />
            )}
          </div>

          {/* ค่าธรรมเนียมเป็นกลุ่ม — หัวกลุ่มบอกยอดรวม + % ของราคาที่ขายได้ */}
          {groups.map(g => (
            <div key={g.key} className="space-y-1.5 pt-2 border-t border-gray-200 dark:border-slate-600">
              <AmountRow
                label={g.label}
                hint={g.hint}
                amount={g.total}
                sign={g.total < 0 ? '-' : g.total > 0 ? '+' : undefined}
                tone={g.total < 0 ? 'bad' : g.total > 0 ? 'good' : 'default'}
                pct={groupPct(g)}
                strong
              />
              <div className="pl-4 space-y-1.5">
                {g.rows.map(b => (
                  <AmountRow
                    key={b}
                    label={BUCKET_LABELS[b]}
                    hint={BUCKET_HINTS[b]}
                    amount={num(s[b])}
                    sign={BUCKET_SIGN[b]}
                    tone={BUCKET_SIGN[b] === '-' ? 'bad' : BUCKET_SIGN[b] === '+' ? 'good' : 'default'}
                    pct={pctOf(num(s[b]), soldPrice)}
                    muted
                  />
                ))}
              </div>
            </div>
          ))}

          <div className="pt-2 border-t border-gray-200 dark:border-slate-600 space-y-2">
            <AmountRow
              label={BUCKET_LABELS.net_payout}
              amount={netPayout}
              tone={netPayout < 0 ? 'bad' : 'good'}
              strong
              pct={keepPct}
            />
            {data.can_view_cost && cogs !== null && (
              <>
                <AmountRow
                  label={BUCKET_LABELS.cogs}
                  hint={COGS_BASIS_HINTS[cogsBasis]}
                  amount={cogs}
                  sign="-"
                  tone="bad"
                  pct={pctOf(cogs, soldPrice)}
                />
                {grossProfit !== null && (
                  <AmountRow
                    label={BUCKET_LABELS.gross_profit}
                    amount={grossProfit}
                    tone={grossProfit >= 0 ? 'good' : 'bad'}
                    strong
                    pct={pctOf(grossProfit, soldPrice)}
                  />
                )}
              </>
            )}
          </div>

          {/* สรุปสำหรับตั้งราคา — ตัวเลขที่ต้องเผื่อ */}
          {takenPct !== null && keepPct !== null && (
            <div className="inner-panel px-4 py-3 space-y-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-gray-700 dark:text-slate-200 font-medium">แพลตฟอร์มเก็บไปทั้งหมด</span>
                <span className="text-red-500 dark:text-red-400 font-semibold tabular-nums whitespace-nowrap">
                  ฿{formatPrice(takenByPlatform)} ({takenPct.toFixed(1)}%)
                </span>
              </div>
              <div className="text-gray-500 dark:text-slate-400">
                {groups.map(g => `${g.label.replace(/ \(.*\)$/, '')} ${Math.abs(groupPct(g) ?? 0).toFixed(1)}%`).join(' · ')}
              </div>
              <div className="text-gray-700 dark:text-slate-200">
                เหลือเข้ากระเป๋า <span className="font-semibold text-emerald-600 dark:text-emerald-400">{keepPct.toFixed(1)}%</span> ของราคาที่ขายได้ (ก่อนหักต้นทุนสินค้า)
                <HelpHint>
                  {`ตั้งราคาให้เผื่อค่าธรรมเนียมแพลตฟอร์ม (กลุ่มแรก) เสมอ เพราะโดนทุกออเดอร์ · การตลาดเผื่อเฉพาะสินค้าที่เข้าร่วม affiliate/โฆษณา/แคมเปญ · ค่าส่งคิดเป็นบาทต่อกล่อง ยิ่งราคาสินค้าต่ำ % ยิ่งสูง · ส่วนลดที่ร้านลดเองไม่ถูกนับเป็นค่าธรรมเนียม (ราคาที่ขายได้หักไปแล้ว)`}
                </HelpHint>
              </div>
            </div>
          )}

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
                        <PctNote pct={pctOf(num(line.amount), soldPrice)} />
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
