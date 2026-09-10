// Path: app/marketing/broadcast/new/components/ActionPicker.tsx
//
// ตัวเลือก "กดแล้วเกิดอะไร" — ใช้ตัวเดียวกับทุกจุดที่ลูกค้ากดได้ (รูปโปสเตอร์ · ปุ่มบนการ์ดโปรโมชัน)
// ชนิดที่มีให้เลือกอ่านจากทะเบียนกลาง `ACTION_TYPES`/`ACTION_LABELS` ใน lib/broadcast/content.ts
// จึงเพิ่มชนิดใหม่แล้วทุกจุดได้พร้อมกัน (เจ้าของขอเป็น "function กลาง" 10 ก.ย. 2026)
//
// ชิปเลือกชนิด → ช่องกรอกของชนิดนั้น: ลิงก์ / ค้นสินค้าจากคลัง / ข้อความที่จะส่งกลับ
// "ไปที่สินค้า" ผูกกับหน้าร้านออนไลน์โดยตรง — ยังไม่เปิดร้าน = ชิปกดไม่ได้พร้อมบอกเหตุผล
'use client';

import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import FormInput from '@/components/ui/FormInput';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import ProductImageThumb from '@/components/ui/ProductImageThumb';
import ProductSearchInput, { type ProductSearchItem } from '@/components/ui/ProductSearchInput';
import { formatPrice } from '@/lib/utils/format';
import type { ReactNode } from 'react';
import {
  ACTION_LABELS,
  ACTION_MESSAGE_MAX,
  ACTION_TYPES,
  emptyAction,
  type BroadcastAction,
  type BroadcastActionType,
  type BroadcastProductCard,
} from '@/lib/broadcast/content';
import { Link2, MessageSquare, Package, Trash2 } from 'lucide-react';

/**
 * ไอคอนประจำชนิด action — อยู่ที่ component ไม่ใช่ทะเบียนกลาง (lib ไม่ import lucide)
 * ชุดเดียวกับที่อื่นในระบบ: ลิงก์ = Link2 · สินค้า = Package · ข้อความ = MessageSquare
 */
const ACTION_ICONS: Record<BroadcastActionType, ReactNode> = {
  url: <Link2 className="w-4 h-4" />,
  product: <Package className="w-4 h-4" />,
  message: <MessageSquare className="w-4 h-4" />,
};

interface Props {
  value: BroadcastAction;
  onChange: (action: BroadcastAction) => void;
  /** หัวข้อของบล็อก เช่น "กดรูปแล้ว" — ไม่ส่ง = ไม่มีป้าย (ตอนอยู่ในแถวปุ่ม) */
  label?: string;
  storefrontOpen: boolean;
  productResults: ProductSearchItem[];
  productLoading: boolean;
  onProductSearch: (q: string) => void;
  productToCard: (p: ProductSearchItem) => BroadcastProductCard;
  disabled?: boolean;
}

/** คำอธิบายบนชิป — ถ้าสินค้าใช้ไม่ได้เพราะร้านยังไม่เปิดหน้าร้าน บอกตรงนั้นเลย */
function tooltipFor(type: BroadcastActionType, storefrontOpen: boolean): string {
  if (type === 'url') return 'เปิดเว็บ/หน้าโปรฯ ตามลิงก์ที่ใส่';
  if (type === 'product') {
    return storefrontOpen
      ? 'เปิดหน้าสินค้าในหน้าร้านออนไลน์ของร้าน — ค้นจากคลัง'
      : 'ต้องเปิดหน้าร้านออนไลน์ก่อน (ตั้งค่า › หน้าร้านออนไลน์)';
  }
  return 'ข้อความถูกส่งเข้าห้องแชทเหมือนลูกค้าพิมพ์เอง — แบบเดียวกับปุ่มตอบเร็ว';
}

export default function ActionPicker({
  value, onChange, label, storefrontOpen, productResults, productLoading, onProductSearch, productToCard, disabled,
}: Props) {
  return (
    <div>
      {label && <p className="field-label mb-1">{label}</p>}
      <div className="flex flex-wrap items-start gap-3">
        {/* กลุ่มปุ่มติดกัน (ไม่ใช่ชิปกลม) — แยกสายตาออกจากชิป pill ที่อยู่ระดับบนของการ์ด */}
        <FilterChips<BroadcastActionType>
          value={value.type}
          variant="segmented"
          size="md"
          // เปลี่ยนชนิด = เริ่มกรอกใหม่ของชนิดนั้น (ลิงก์กับสินค้าเอามาแทนกันไม่ได้)
          onChange={type => onChange(emptyAction(type))}
          disabled={disabled}
          chips={ACTION_TYPES.map(type => ({
            id: type,
            label: ACTION_LABELS[type],
            icon: ACTION_ICONS[type],
            activeClass: FILTER_CHIP_PRIMARY_ACTIVE,
            disabled: type === 'product' && !storefrontOpen,
            tooltip: tooltipFor(type, storefrontOpen),
          }))}
        />
        <div className="flex-1 min-w-64">
          {value.type === 'url' && (
            <FormInput
              value={value.url}
              onChange={e => onChange({ type: 'url', url: e.target.value })}
              disabled={disabled}
              placeholder="https://…"
              aria-label="ลิงก์ที่จะเปิด"
            />
          )}
          {value.type === 'product' && (value.product ? (
            // กล่องสินค้าที่เลือกแล้ว = การ์ดกลาง (.card) ไม่ใช่กรอบที่พิมพ์สีเอง
            <Card padding="none" className="flex gap-3 items-center px-3 py-2">
              <ProductImageThumb src={value.product.image_url} alt={value.product.name} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="body-text truncate">{value.product.name}</p>
                <p className="subtitle-text">
                  {value.product.price != null ? formatPrice(value.product.price) : 'ไม่มีราคา'} · เปิดหน้าสินค้านี้ในหน้าร้านออนไลน์
                </p>
              </div>
              <Button
                variant="ghost"
                icon={<Trash2 className="w-4 h-4" />}
                aria-label="เอาสินค้าออก"
                disabled={disabled}
                onClick={() => onChange({ type: 'product', product: null })}
              />
            </Card>
          ) : (
            <ProductSearchInput
              products={productResults}
              loading={productLoading}
              onSearchChange={onProductSearch}
              onSelect={p => onChange({ type: 'product', product: productToCard(p) })}
            />
          ))}
          {value.type === 'message' && (
            <FormInput
              value={value.text}
              maxLength={ACTION_MESSAGE_MAX}
              onChange={e => onChange({ type: 'message', text: e.target.value })}
              disabled={disabled}
              placeholder="เช่น สนใจโปรนี้"
              aria-label="ข้อความที่จะส่งกลับ"
              hint="ข้อความนี้เข้าห้องแชททันทีที่ลูกค้ากด"
            />
          )}
        </div>
      </div>
    </div>
  );
}
