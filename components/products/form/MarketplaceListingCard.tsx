// Path: components/products/form/MarketplaceListingCard.tsx
//
// แท็บร้าน marketplace ในหน้าแก้ไขสินค้า — ข้อมูลของสินค้านี้ "บนร้านนั้น"
// เรียงเหมือนแท็บข้อมูลสินค้า (ProductFormCard) เป๊ะ: หัวการ์ด → รูป → ชื่อ →
// หมวดหมู่ + น้ำหนัก + ราคา → ข้อมูลจากร้าน (แบรนด์ + attributes) → คำอธิบาย
// ทุกแถวกว้างเต็มฟอร์ม (แบ่งสัดส่วนกัน) · ชื่อเป็นช่องบรรทัดเดียวมีตัวนับในช่อง ชุดเดียวกับ "ชื่อสินค้า"
//
// Item ID = เลขที่แพลตฟอร์มออกให้ ระบบเราตั้งเองไม่ได้ → แสดงเป็นข้อความบนหัวการ์ด (ไม่ใช่ช่องกรอก)
// รูป: Shopee ใส่ได้หลายรูป แต่ระบบเราเก็บ **รูปหลักของร้านนั้นรูปเดียว**
// (`marketplace_product_links.platform_primary_image`)
// meta: ตอนดึงสินค้าเข้า เราเก็บแบรนด์ (`shopee_brand_name`) + attributes ของหมวด
// (`shopee_attributes` — 960 link มีค่าจริง) ไว้ด้วย → แสดงอ่านอย่างเดียว แก้ที่ร้านแล้วซิงค์
// หมวดหมู่ของแต่ละแพลตฟอร์มต่างกัน → ผู้เรียกส่งตัวเลือกหมวดมาทาง `categorySlot`
// (หน้าจริง = ShopeeCategoryPicker ที่ค้นข้ามทุกชั้นได้) · ต้นแบบ 12 ก.ย. 2026
'use client';

import type { ReactNode } from 'react';
import { Camera, ExternalLink, RefreshCw, Unlink2 } from 'lucide-react';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import SaveButton from '@/components/ui/SaveButton';
import Badge from '@/components/ui/Badge';
import FormInput from '@/components/ui/FormInput';
import FormTextarea from '@/components/ui/FormTextarea';
import PostfixInput from '@/components/ui/PostfixInput';
import Tooltip from '@/components/ui/Tooltip';
import HelpHint from '@/components/ui/HelpHint';
import PlatformIcon from '@/components/ui/PlatformIcon';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import { formatNumber } from '@/lib/utils/format';
import { PRODUCT_NAME_MAX, SHOPEE_NAME_MIN } from './parts';

export type ListingPlatform = 'shopee' | 'tiktok' | 'lazada';

const PLATFORM_LABEL: Record<ListingPlatform, string> = { shopee: 'Shopee', tiktok: 'TikTok', lazada: 'Lazada' };

/** สัดส่วนแถวชุดเดียวกับ ProductFormCard */
const ROW_3 = 'grid gap-4 grid-cols-1 md:grid-cols-3';
const ROW_AUTO = 'grid gap-4 grid-cols-[repeat(auto-fit,minmax(170px,1fr))]';
const META_GRID = 'grid gap-3 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]';

/** One model (ตัวเลือก) of the listing */
export interface ListingModel {
  id: string;
  label: string;
  sku: string;
  image?: string | null;
  /** price on the platform (string — PostfixInput state) */
  platformPrice: string;
  /** our price in the system, for comparison */
  systemPrice: number;
}

/** attribute ของหมวดบนแพลตฟอร์ม (shopee_attributes) — อ่านอย่างเดียว */
export interface ListingAttribute {
  id: string | number;
  name: string;
  value: string;
  mandatory?: boolean;
}

export interface MarketplaceListingCardProps {
  platform: ListingPlatform;
  shopName: string;
  itemId: string;
  productUrl?: string | null;
  lastSyncedText?: string;
  image?: string | null;
  /** เปลี่ยนรูปหลักของร้านนี้ (ไม่ส่งมา = ดูอย่างเดียว) */
  onChangeImage?: () => void;
  name: string;
  onNameChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  categorySlot: ReactNode;
  weight: string;
  onWeightChange: (v: string) => void;
  /** single-model listing */
  price?: string;
  onPriceChange?: (v: string) => void;
  systemPrice?: number;
  /** multi-model listing (สินค้ามีตัวเลือก) — table instead of the single price */
  models?: ListingModel[];
  onModelPriceChange?: (id: string, v: string) => void;
  /** meta ที่ดึงมาจากร้าน (อ่านอย่างเดียว) */
  brandName?: string | null;
  attributes?: ListingAttribute[];
  onSync: () => void;
  onUnlink: () => void;
  dirty: boolean;
  saving?: boolean;
  onSave: () => void;
  onCancel: () => void;
  /** platform-specific extras */
  extra?: ReactNode;
}

const POSTFIX_PROPS = {
  width: 'w-full',
  inputClassName: 'w-full px-3 h-[42px]',
  classNames: { text: 'text-base text-gray-900 dark:text-white' },
};

/** ค่า meta หนึ่งช่อง — อ่านอย่างเดียว (หน้าตาเดียวกับการ์ด Shopee Attributes เดิม) */
function MetaItem({ label, value, mandatory }: { label: string; value: string; mandatory?: boolean }) {
  return (
    <div>
      <div className="text-sm text-gray-500 dark:text-slate-400 mb-1">
        {label}{mandatory && <span className="text-red-500 ml-0.5">*</span>}
      </div>
      <div className="px-3 py-2 text-base bg-gray-50 dark:bg-slate-700/50 border border-gray-200 dark:border-slate-600 rounded-lg text-gray-700 dark:text-slate-300 break-words">
        {value || <span className="text-gray-400 dark:text-slate-500 italic">ยังไม่ได้ตั้งค่า</span>}
      </div>
    </div>
  );
}

export default function MarketplaceListingCard({
  platform, shopName, itemId, productUrl, lastSyncedText, image, onChangeImage, name, onNameChange,
  description, onDescriptionChange, categorySlot, weight, onWeightChange, price, onPriceChange,
  systemPrice, models, onModelPriceChange, brandName, attributes, onSync, onUnlink, dirty, saving,
  onSave, onCancel, extra,
}: MarketplaceListingCardProps) {
  const label = PLATFORM_LABEL[platform];
  const nameLength = name.length;
  const nameTooShort = platform === 'shopee' && nameLength > 0 && nameLength < SHOPEE_NAME_MIN;
  // ตัว weight มีช่องของตัวเองอยู่แล้ว — ไม่ต้องโชว์ซ้ำใน meta (เหมือนการ์ดเดิม)
  const metaAttributes = (attributes || []).filter(a => a.name.trim().toLowerCase() !== 'weight');
  const hasMeta = !!brandName || metaAttributes.length > 0;

  return (
    <Card>
      <div className="space-y-5">
        {/* ── header: shop + item id + actions ── */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <PlatformIcon id={platform} size={20} />
              <h3 className="heading-3 truncate">{shopName}</h3>
              <Badge tone="emerald" size="sm">เชื่อมแล้ว</Badge>
            </div>
            <div className="helper-text mt-1 flex flex-wrap items-center gap-x-1">
              <span>Item ID</span>
              <span className="font-mono text-gray-700 dark:text-slate-300">{itemId}</span>
              <HelpHint>
                เลขประจำสินค้าที่ {label} ออกให้ตอนสินค้าขึ้นร้าน — ใช้อ้างอิงเวลาเปิดหน้าสินค้าบนร้าน
                หรือแจ้ง {label} · ระบบเราตั้งเองไม่ได้และแก้ไม่ได้ (คนละตัวกับรหัสสินค้าของเรา)
              </HelpHint>
              {lastSyncedText && <span>· ซิงค์ล่าสุด {lastSyncedText}</span>}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {productUrl && (
              <Tooltip text={`ดูบน ${label}`}>
                <a
                  href={productUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`ดูบน ${label}`}
                  className="inline-flex items-center justify-center w-[42px] h-[42px] rounded-lg text-gray-500 hover:text-primary hover:bg-gray-100 dark:text-slate-400 dark:hover:bg-slate-700 transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Tooltip>
            )}
            <Tooltip text="ซิงค์กับร้านนี้">
              <Button variant="ghost" icon={<RefreshCw className="w-4 h-4" />} onClick={onSync} aria-label="ซิงค์กับร้านนี้" />
            </Tooltip>
            <Tooltip text="ยกเลิกการเชื่อมกับร้านนี้">
              <Button variant="ghost" icon={<Unlink2 className="w-4 h-4" />} onClick={onUnlink} aria-label="ยกเลิกการเชื่อมกับร้านนี้" />
            </Tooltip>
          </div>
        </div>

        {/* ── image: one primary image per shop ── */}
        <div>
          <div className="field-label">รูปหลักบน {label}</div>
          <div className="flex items-center gap-3">
            <ProductImageThumb src={image} alt={name} size="lg" className="!w-24 !h-24" />
            <div className="min-w-0">
              {onChangeImage && (
                <Button variant="secondary" size="sm" icon={<Camera className="w-4 h-4" />} onClick={onChangeImage}>
                  เปลี่ยนรูป
                </Button>
              )}
              <p className="helper-text mt-1">{label} ใส่ได้หลายรูป — ระบบเก็บรูปหลักของร้านนี้ไว้รูปเดียว</p>
            </div>
          </div>
        </div>

        {/* ── name (บรรทัดเดียว + ตัวนับในช่อง — ชุดเดียวกับ "ชื่อสินค้า") ── */}
        <div>
          <div className="field-label">ชื่อบน {label}</div>
          <FormInput
            value={name}
            onChange={e => onNameChange(e.target.value.slice(0, PRODUCT_NAME_MAX))}
            maxLength={PRODUCT_NAME_MAX}
            aria-label={`ชื่อบน ${label}`}
            error={nameTooShort ? `ชื่อบน ${label} ต้องมีอย่างน้อย ${SHOPEE_NAME_MIN} ตัวอักษร` : undefined}
            postfix={
              <span className={`text-sm tabular-nums ${nameTooShort ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400 dark:text-slate-500'}`}>
                {nameLength}/{PRODUCT_NAME_MAX}
              </span>
            }
          />
        </div>

        {/* ── category + weight (+ price when the listing has no models) ── */}
        <div className={models ? ROW_3 : ROW_AUTO}>
          <div className={models ? 'md:col-span-2' : 'sm:col-span-2'}>
            <div className="field-label">หมวดหมู่ {label}</div>
            {categorySlot}
          </div>
          <div>
            <div className="field-label">น้ำหนัก</div>
            <PostfixInput postfix="kg" value={weight} onChange={onWeightChange} placeholder="0.5" {...POSTFIX_PROPS} />
          </div>
          {!models && (
            <div>
              <div className="field-label">ราคาบน {label}</div>
              <PostfixInput postfix="฿" value={price ?? ''} onChange={v => onPriceChange?.(v)} placeholder="ไม่ได้ตั้ง" {...POSTFIX_PROPS} />
              {systemPrice != null && <p className="helper-text mt-1">ราคาในระบบ ฿{formatNumber(systemPrice)}</p>}
            </div>
          )}
        </div>

        {models && (
          <div>
            <div className="field-label">ราคาแต่ละแบบบน {label}</div>
            {/* Desktop */}
            <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-200 dark:border-slate-700">
              <table className="w-full min-w-[600px]">
                <thead className="data-thead">
                  <tr>
                    <th className="data-th w-[72px]">รูป</th>
                    <th className="data-th">ตัวเลือก</th>
                    <th className="data-th w-[180px]">SKU บน {label}</th>
                    <th className="data-th w-[170px] text-right">ราคาบน {label}</th>
                    <th className="data-th w-[130px] text-right">ราคาในระบบ</th>
                  </tr>
                </thead>
                <tbody className="data-tbody">
                  {models.map(m => (
                    <tr key={m.id} className="data-tr">
                      <td className="px-3 py-3"><ProductImageThumb src={m.image} alt={m.label} size="sm" /></td>
                      <td className="px-3 py-3 text-base text-gray-900 dark:text-white">{m.label}</td>
                      <td className="px-3 py-3 code-text text-gray-600 dark:text-slate-300">{m.sku || '-'}</td>
                      <td className="px-3 py-3">
                        <PostfixInput postfix="฿" value={m.platformPrice} onChange={v => onModelPriceChange?.(m.id, v)} placeholder="ไม่ได้ตั้ง" {...POSTFIX_PROPS} />
                      </td>
                      <td className="px-3 py-3 text-right text-base text-gray-600 dark:text-slate-400 tabular-nums">
                        ฿{formatNumber(m.systemPrice)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="md:hidden divide-y divide-gray-100 dark:divide-slate-700 rounded-lg border border-gray-200 dark:border-slate-700">
              {models.map(m => (
                <div key={m.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-3">
                    <ProductImageThumb src={m.image} alt={m.label} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="text-base font-medium text-gray-900 dark:text-white">{m.label}</div>
                      <div className="text-sm font-mono text-gray-500 dark:text-slate-400">{m.sku || '-'}</div>
                    </div>
                  </div>
                  <PostfixInput postfix="฿" value={m.platformPrice} onChange={v => onModelPriceChange?.(m.id, v)} placeholder="ไม่ได้ตั้ง" {...POSTFIX_PROPS} />
                  <p className="helper-text">ราคาในระบบ ฿{formatNumber(m.systemPrice)}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── meta ที่ดึงมาจากร้าน (แบรนด์ + attributes ของหมวด) — อ่านอย่างเดียว ── */}
        {hasMeta && (
          <div>
            <div className="field-label">ข้อมูลจาก {label}</div>
            <div className={`${META_GRID} rounded-lg border border-gray-200 dark:border-slate-700 p-4`}>
              {brandName && <MetaItem label="แบรนด์" value={brandName} mandatory />}
              {metaAttributes.map(a => (
                <MetaItem key={a.id} label={a.name} value={a.value} mandatory={a.mandatory} />
              ))}
            </div>
            <p className="helper-text mt-1">
              ดึงมาจาก {label} ตอนซิงค์ — แก้ค่าพวกนี้ที่ {label} แล้วกดซิงค์เพื่ออัปเดต
            </p>
          </div>
        )}

        {extra}

        {/* ── description (ท้ายสุด เหมือนแท็บข้อมูลสินค้า) ── */}
        <div className="border-t border-gray-100 dark:border-slate-700" />
        <FormTextarea
          label={`คำอธิบายบน ${label}`}
          rows={4}
          value={description}
          onChange={e => onDescriptionChange(e.target.value)}
          placeholder={`คำอธิบายสำหรับร้านนี้ — ใช้ตอนส่งสินค้าขึ้น ${label}`}
        />

        {dirty && (
          <div className="flex justify-end gap-3 border-t border-gray-100 dark:border-slate-700 pt-4">
            <Button variant="secondary" onClick={onCancel}>ยกเลิก</Button>
            <SaveButton loading={saving} onClick={onSave} />
          </div>
        )}
      </div>
    </Card>
  );
}
