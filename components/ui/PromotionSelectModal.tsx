// Path: components/ui/PromotionSelectModal.tsx
'use client';

import { useState } from 'react';
import { Gift, Minus, Plus, Package, ShoppingCart } from 'lucide-react';
import { formatPrice } from '@/lib/utils/format';
import Modal from './Modal';

// ── Types ──────────────────────────────────────────────

export interface PromoItemData {
  variation_id: string | null;
  product_id: string | null;
  product_name: string;
  product_code: string;
  variation_label: string;
  sku: string;
  image?: string | null;
  role: string;
  quantity: number;
  default_price: number;
  max_price?: number;
  special_price: number | null;
  sub_item_limit?: number | null;
}

export interface PromoData {
  id: string;
  name: string;
  promotion_type: string;
  image: string | null;
  bundle_price: number | null;
  discount_type?: string | null;
  discount_value?: number | null;
  items: PromoItemData[];
  tiers?: { min_qty: number; discount_type: string; discount_value: number }[];
}

/** Result returned after user confirms the modal */
export interface PromotionSelectResult {
  promotion: PromoData;
  /** For qty_discount: selected quantity */
  quantity: number;
  /** For buy_get_discount: which discounted items were selected (variation_id → qty) */
  selectedDiscounted: { variation_id: string; product_name: string; quantity: number }[];
}

interface PromotionSelectModalProps {
  promotion: PromoData;
  onConfirm: (result: PromotionSelectResult) => void;
  onClose: () => void;
  /** When triggered by adding a normal product that's in a buy_get_discount promo */
  triggerProduct?: { variation_id: string; product_name: string } | null;
}

// ── Helpers ──────────────────────────────────────────────

function RoleBadge({ role }: { role: string }) {
  const config: Record<string, { label: string; cls: string }> = {
    main: { label: 'หลัก', cls: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
    component: { label: 'รวม', cls: 'bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-gray-400' },
    gift: { label: 'แถม', cls: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
    discounted: { label: 'ราคาพิเศษ', cls: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  };
  const c = config[role] || config.component;
  return <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${c.cls}`}>{c.label}</span>;
}

const TYPE_LABELS: Record<string, string> = {
  bundle_set: 'เซ็ตรวม',
  buy_get_free: 'ซื้อ X แถม Y',
  buy_get_discount: 'ซื้อ X ได้ Y ราคาพิเศษ',
  qty_discount: 'ซื้อเยอะลดเยอะ',
};

// ── Main Component ──────────────────────────────────────

export default function PromotionSelectModal({
  promotion,
  onConfirm,
  onClose,
  triggerProduct,
}: PromotionSelectModalProps) {
  const type = promotion.promotion_type;

  // qty_discount: quantity selector
  const [qty, setQty] = useState(1);

  // buy_get_discount: selected discounted items
  const discountedItems = promotion.items.filter(i => i.role === 'discounted');
  const mainItems = promotion.items.filter(i => i.role === 'main' || i.role === 'component');
  const [selectedMap, setSelectedMap] = useState<Record<string, number>>(() => {
    // If buy_get_discount, default all discounted to 0
    const m: Record<string, number> = {};
    for (const item of discountedItems) {
      if (item.variation_id) m[item.variation_id] = 0;
    }
    return m;
  });

  // How many discounted items can be selected (= number of main items bought)
  const mainQty = mainItems.reduce((s, i) => s + i.quantity, 0);
  const totalSelectedDiscounted = Object.values(selectedMap).reduce((s, v) => s + v, 0);

  const toggleDiscounted = (variationId: string, delta: number) => {
    setSelectedMap(prev => {
      const current = prev[variationId] || 0;
      const newVal = Math.max(0, current + delta);
      // Check limit
      const newTotal = totalSelectedDiscounted - current + newVal;
      if (newTotal > mainQty) return prev;
      return { ...prev, [variationId]: newVal };
    });
  };

  // Calculate display price
  const getDisplayPrice = () => {
    if (type === 'bundle_set') {
      if (promotion.bundle_price) return promotion.bundle_price;
      const sum = promotion.items.reduce((s, i) => s + (i.default_price || 0) * i.quantity, 0);
      if (promotion.discount_type === 'percent') return sum * (1 - (promotion.discount_value || 0) / 100);
      if (promotion.discount_type === 'fixed_discount') {
        return promotion.items.reduce((s, i) => s + Math.max(0, (i.default_price || 0) - (promotion.discount_value || 0)) * i.quantity, 0);
      }
      return sum;
    }
    if (type === 'buy_get_free') {
      return mainItems.reduce((s, i) => s + (i.default_price || 0) * i.quantity, 0);
    }
    if (type === 'buy_get_discount') {
      const mainTotal = mainItems.reduce((s, i) => s + (i.default_price || 0) * i.quantity, 0);
      const discTotal = discountedItems.reduce((s, i) => {
        const selQty = selectedMap[i.variation_id || ''] || 0;
        return s + (i.special_price ?? i.default_price) * selQty;
      }, 0);
      return mainTotal + discTotal;
    }
    if (type === 'qty_discount' && promotion.tiers) {
      const basePrice = promotion.items[0]?.default_price || 0;
      // Find matching tier
      const sorted = [...promotion.tiers].sort((a, b) => b.min_qty - a.min_qty);
      const tier = sorted.find(t => qty >= t.min_qty);
      if (!tier) return basePrice * qty;
      if (tier.discount_type === 'percent') return basePrice * qty * (1 - tier.discount_value / 100);
      if (tier.discount_type === 'fixed_discount') return (basePrice - tier.discount_value) * qty;
      if (tier.discount_type === 'fixed_price') return tier.discount_value * qty;
      return basePrice * qty;
    }
    return 0;
  };

  // Full price (before any promotion discount)
  const getFullPrice = () => {
    if (type === 'qty_discount') {
      return (promotion.items[0]?.default_price || 0) * qty;
    }
    const allItems = type === 'buy_get_discount'
      ? [...mainItems, ...discountedItems.filter(i => i.variation_id && (selectedMap[i.variation_id] || 0) > 0).map(i => ({ ...i, quantity: selectedMap[i.variation_id!] || 0 }))]
      : promotion.items;
    return allItems.reduce((s, i) => s + (i.default_price || 0) * i.quantity, 0);
  };

  const handleConfirm = () => {
    const selectedDiscounted = type === 'buy_get_discount'
      ? discountedItems
          .filter(i => i.variation_id && (selectedMap[i.variation_id] || 0) > 0)
          .map(i => ({
            variation_id: i.variation_id!,
            product_name: i.product_name,
            quantity: selectedMap[i.variation_id!] || 0,
          }))
      : [];

    onConfirm({
      promotion,
      quantity: type === 'qty_discount' ? qty : 1,
      selectedDiscounted,
    });
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      size="lg"
      icon={
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Gift className="w-5 h-5 text-primary" />
        </div>
      }
      title={
        <div>
          <h3 className="text-gray-900 dark:text-white font-bold">{promotion.name}</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-normal">{TYPE_LABELS[type] || type}</p>
        </div>
      }
      footer={
        <div className="px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400">ราคารวม</p>
            <p className="text-xl font-bold text-primary">฿{formatPrice(Math.round(getDisplayPrice() * 100) / 100)}</p>
            {(() => {
              const full = getFullPrice();
              const promo = getDisplayPrice();
              const savings = Math.round((full - promo) * 100) / 100;
              return savings > 0 ? (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  ประหยัด ฿{formatPrice(savings)} <span className="text-gray-400 line-through ml-1">฿{formatPrice(full)}</span>
                </p>
              ) : null;
            })()}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/10 rounded-lg transition-colors"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleConfirm}
              className="flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-medium text-sm rounded-lg transition-colors active:scale-[0.98]"
            >
              <ShoppingCart className="w-4 h-4" />
              เพิ่มลงรายการ
            </button>
          </div>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4">

          {/* === bundle_set / buy_get_free: show all items === */}
          {(type === 'bundle_set' || type === 'buy_get_free') && (
            <>
              {triggerProduct && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  สินค้า <strong>{triggerProduct.product_name}</strong> อยู่ในโปรโมชั่นนี้
                </p>
              )}
              <div className="space-y-2">
                {promotion.items.map((item, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                    {item.image
                      ? <img src={item.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                      : <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                          <Package className="w-5 h-5 text-gray-400" />
                        </div>
                    }
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-900 dark:text-white font-medium line-clamp-2">{item.product_name}</p>
                      {item.variation_label && <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{item.variation_label}</p>}
                      {item.sku && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.sku}</p>}
                    </div>
                    <RoleBadge role={item.role} />
                    <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">x{item.quantity}</span>
                    <span className="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0">
                      {item.role === 'gift' ? 'ฟรี' : `฿${formatPrice(item.default_price)}`}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* === buy_get_discount: main items (fixed) + discounted items (selectable) === */}
          {type === 'buy_get_discount' && (
            <>
              {triggerProduct && (
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  สินค้า <strong>{triggerProduct.product_name}</strong> อยู่ในโปรนี้ — เลือกสินค้าราคาพิเศษได้ด้านล่าง
                </p>
              )}

              {/* Main items */}
              <div>
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">สินค้าหลัก</p>
                <div className="space-y-1.5">
                  {mainItems.map((item, i) => (
                    <div key={i} className="flex items-center gap-3 p-2.5 rounded-lg bg-gray-50 dark:bg-white/5">
                      {item.image
                        ? <img src={item.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                        : <div className="w-9 h-9 rounded bg-gray-200 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                            <Package className="w-4 h-4 text-gray-400" />
                          </div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{item.product_name}</p>
                        {item.sku && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.sku}</p>}
                      </div>
                      <span className="text-sm text-gray-500 dark:text-gray-400 flex-shrink-0">x{item.quantity}</span>
                      <span className="text-sm font-medium text-gray-900 dark:text-white flex-shrink-0">฿{formatPrice(item.default_price)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Discounted items — selectable */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                    เลือกสินค้าราคาพิเศษ (ได้ {mainQty} ชิ้น)
                  </p>
                  <span className="text-xs text-primary font-medium">{totalSelectedDiscounted}/{mainQty}</span>
                </div>
                <div className="space-y-1.5 max-h-[40vh] overflow-y-auto">
                  {discountedItems.map((item, i) => {
                    const selQty = selectedMap[item.variation_id || ''] || 0;
                    const canAdd = totalSelectedDiscounted < mainQty;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-2.5 rounded-lg transition-colors ${
                        selQty > 0 ? 'bg-purple-50 dark:bg-purple-900/20 ring-1 ring-purple-300 dark:ring-purple-700' : 'bg-gray-50 dark:bg-white/5'
                      }`}>
                        {item.image
                          ? <img src={item.image} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                          : <div className="w-9 h-9 rounded bg-gray-200 dark:bg-white/10 flex items-center justify-center flex-shrink-0">
                              <Package className="w-4 h-4 text-gray-400" />
                            </div>
                        }
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-900 dark:text-white line-clamp-2">{item.product_name}</p>
                          {item.variation_label && <p className="text-xs text-gray-400 truncate">{item.variation_label}</p>}
                          {item.sku && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{item.sku}</p>}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs text-gray-400 line-through">฿{formatPrice(item.default_price)}</span>
                            <span className="text-xs text-primary font-bold">฿{formatPrice(item.special_price ?? item.default_price)}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => toggleDiscounted(item.variation_id || '', -1)}
                            disabled={selQty <= 0}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white disabled:opacity-30"
                          >
                            <Minus className="w-3.5 h-3.5" />
                          </button>
                          <span className="w-6 text-center text-sm font-medium text-gray-900 dark:text-white">{selQty}</span>
                          <button
                            onClick={() => toggleDiscounted(item.variation_id || '', 1)}
                            disabled={!canAdd}
                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white disabled:opacity-30"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* === qty_discount: quantity selector + tier table === */}
          {type === 'qty_discount' && (
            <>
              {/* Product info */}
              {promotion.items[0] && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-white/5">
                  {promotion.items[0].image
                    ? <img src={promotion.items[0].image} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    : <div className="w-12 h-12 rounded-lg bg-gray-200 dark:bg-white/10 flex items-center justify-center">
                        <Package className="w-5 h-5 text-gray-400" />
                      </div>
                  }
                  <div>
                    <p className="text-sm text-gray-900 dark:text-white font-medium line-clamp-2">{promotion.items[0].product_name}</p>
                    {promotion.items[0].sku && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{promotion.items[0].sku}</p>}
                    <p className="text-xs text-gray-500 dark:text-gray-400">฿{formatPrice(promotion.items[0].default_price)} / ชิ้น</p>
                  </div>
                </div>
              )}

              {/* Qty selector */}
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setQty(q => Math.max(1, q - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-white/20 active:scale-95"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 h-10 text-center text-lg font-bold bg-gray-50 dark:bg-white/5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  onClick={() => setQty(q => q + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-gray-200 dark:bg-white/10 text-gray-700 dark:text-white hover:bg-gray-300 dark:hover:bg-white/20 active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>

              {/* Tier table */}
              {promotion.tiers && promotion.tiers.length > 0 && (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700/50 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-white/5">
                        <th className="px-3 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">จำนวน</th>
                        <th className="px-3 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">ส่วนลด</th>
                      </tr>
                    </thead>
                    <tbody>
                      {promotion.tiers.map((tier, i) => {
                        const isActive = qty >= tier.min_qty && (
                          !promotion.tiers![i + 1] || qty < promotion.tiers![i + 1].min_qty
                        );
                        return (
                          <tr key={i} className={isActive ? 'bg-primary/10' : ''}>
                            <td className={`px-3 py-2 ${isActive ? 'text-primary font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                              ตั้งแต่ {tier.min_qty} ชิ้น
                            </td>
                            <td className={`px-3 py-2 text-right ${isActive ? 'text-primary font-bold' : 'text-gray-700 dark:text-gray-300'}`}>
                              {tier.discount_type === 'percent' && `ลด ${tier.discount_value}%`}
                              {tier.discount_type === 'fixed_discount' && `ลด ฿${formatPrice(tier.discount_value)}/ชิ้น`}
                              {tier.discount_type === 'fixed_price' && `เหลือ ฿${formatPrice(tier.discount_value)}/ชิ้น`}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
      </div>
    </Modal>
  );
}
