'use client';

import { useState, useMemo, useCallback } from 'react';
import { Package, Plus, Trash2, X, Loader2 } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface OrderItem {
  id: string;
  product_name: string;
  variation_label?: string | null;
  quantity: number;
  image?: string | null;
}

interface ParcelItem {
  order_item_id: string;
  quantity: number;
}

interface Parcel {
  items: ParcelItem[];
}

interface SplitParcelModalProps {
  show: boolean;
  orderId: string;
  orderNumber: string;
  orderItems: OrderItem[];
  isShopee: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SplitParcelModal({
  show,
  orderId,
  orderNumber,
  orderItems,
  isShopee,
  onClose,
  onSuccess,
}: SplitParcelModalProps) {
  const [parcels, setParcels] = useState<Parcel[]>(() => initParcels(orderItems));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Initialize: all items in parcel 1, parcel 2 empty
  function initParcels(items: OrderItem[]): Parcel[] {
    return [
      { items: items.map(i => ({ order_item_id: i.id, quantity: i.quantity })) },
      { items: [] },
    ];
  }

  // Reset when modal opens
  const reset = useCallback(() => {
    setParcels(initParcels(orderItems));
    setError('');
    setLoading(false);
  }, [orderItems]);

  // Item lookup
  const itemMap = useMemo(() => new Map(orderItems.map(i => [i.id, i])), [orderItems]);

  // Calculate remaining qty per item (not assigned to any parcel)
  const assignedQty = useMemo(() => {
    const map = new Map<string, number>();
    for (const parcel of parcels) {
      for (const item of parcel.items) {
        map.set(item.order_item_id, (map.get(item.order_item_id) || 0) + item.quantity);
      }
    }
    return map;
  }, [parcels]);

  const totalAssigned = useMemo(() => {
    let total = 0;
    assignedQty.forEach(v => { total += v; });
    return total;
  }, [assignedQty]);

  const totalRequired = useMemo(() => orderItems.reduce((s, i) => s + i.quantity, 0), [orderItems]);

  // Validation
  const isValid = useMemo(() => {
    // Every parcel must have at least 1 item
    if (parcels.some(p => p.items.length === 0)) return false;
    // Every item must be fully assigned
    for (const item of orderItems) {
      if ((assignedQty.get(item.id) || 0) !== item.quantity) return false;
    }
    return true;
  }, [parcels, orderItems, assignedQty]);

  // Update quantity for an item in a parcel
  const updateQty = (parcelIdx: number, itemId: string, newQty: number) => {
    setParcels(prev => prev.map((p, i) => {
      if (i !== parcelIdx) return p;
      return {
        ...p,
        items: p.items.map(pi =>
          pi.order_item_id === itemId ? { ...pi, quantity: Math.max(0, newQty) } : pi
        ).filter(pi => pi.quantity > 0),
      };
    }));
  };

  // Remove item from parcel
  const removeFromParcel = (parcelIdx: number, itemId: string) => {
    setParcels(prev => prev.map((p, i) => {
      if (i !== parcelIdx) return p;
      return { ...p, items: p.items.filter(pi => pi.order_item_id !== itemId) };
    }));
  };

  // Add item to parcel
  const addToParcel = (parcelIdx: number, itemId: string, qty: number) => {
    setParcels(prev => prev.map((p, i) => {
      if (i !== parcelIdx) return p;
      const existing = p.items.find(pi => pi.order_item_id === itemId);
      if (existing) {
        return {
          ...p,
          items: p.items.map(pi =>
            pi.order_item_id === itemId ? { ...pi, quantity: pi.quantity + qty } : pi
          ),
        };
      }
      return { ...p, items: [...p.items, { order_item_id: itemId, quantity: qty }] };
    }));
  };

  // Move item from one parcel to another
  const moveItem = (fromIdx: number, toIdx: number, itemId: string, qty: number) => {
    removeFromParcel(fromIdx, itemId);
    addToParcel(toIdx, itemId, qty);
  };

  // Add a new empty parcel
  const addParcel = () => {
    if (parcels.length >= 5) return;
    setParcels(prev => [...prev, { items: [] }]);
  };

  // Remove a parcel (move items back to unassigned)
  const removeParcel = (idx: number) => {
    if (parcels.length <= 2) return;
    setParcels(prev => prev.filter((_, i) => i !== idx));
  };

  // Submit split
  const handleSubmit = async () => {
    if (!isValid) return;
    setLoading(true);
    setError('');

    try {
      const res = await apiFetch('/api/orders/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          order_id: orderId,
          parcels: parcels.map(p => ({ items: p.items })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'เกิดข้อผิดพลาด');
        setLoading(false);
        return;
      }

      onSuccess();
    } catch {
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ');
      setLoading(false);
    }
  };

  if (!show) return null;

  // Unassigned items (items not fully distributed)
  const unassignedItems = orderItems.filter(item => {
    const assigned = assignedQty.get(item.id) || 0;
    return assigned < item.quantity;
  });

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-slate-800 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              แบ่งกล่อง
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {orderNumber} — {orderItems.length} รายการ, {totalRequired} ชิ้น
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {/* Unassigned items notice */}
          {unassignedItems.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 text-sm">
              มีสินค้าที่ยังไม่ได้จัดลงกล่อง: {unassignedItems.map(i => {
                const remaining = i.quantity - (assignedQty.get(i.id) || 0);
                return `${i.product_name} x${remaining}`;
              }).join(', ')}
            </div>
          )}

          {/* Parcels */}
          {parcels.map((parcel, parcelIdx) => (
            <div
              key={parcelIdx}
              className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden"
            >
              {/* Parcel header */}
              <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-gray-700/50">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-gray-500" />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                    กล่องที่ {parcelIdx + 1}
                  </span>
                  <span className="text-xs text-gray-400">
                    ({parcel.items.reduce((s, i) => s + i.quantity, 0)} ชิ้น)
                  </span>
                </div>
                {parcels.length > 2 && (
                  <button
                    onClick={() => removeParcel(parcelIdx)}
                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/30 text-gray-400 hover:text-red-500"
                    title="ลบกล่อง"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Items in this parcel */}
              <div className="p-3 space-y-2">
                {parcel.items.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-3">
                    ลากสินค้ามาวาง หรือกด + เพิ่มสินค้า
                  </p>
                ) : (
                  parcel.items.map((pi) => {
                    const item = itemMap.get(pi.order_item_id);
                    if (!item) return null;
                    return (
                      <div key={pi.order_item_id} className="flex items-center gap-3">
                        {/* Image */}
                        <div className="w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-700 overflow-hidden flex-shrink-0">
                          {item.image ? (
                            <img src={item.image} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Package className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                        </div>

                        {/* Name */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-gray-800 dark:text-gray-200 truncate">
                            {item.product_name}
                          </p>
                          {item.variation_label && (
                            <p className="text-xs text-gray-400 truncate">{item.variation_label}</p>
                          )}
                        </div>

                        {/* Qty controls */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateQty(parcelIdx, pi.order_item_id, pi.quantity - 1)}
                            className="w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                          >
                            -
                          </button>
                          <span className="w-8 text-center text-sm font-medium text-gray-700 dark:text-gray-200">
                            {pi.quantity}
                          </span>
                          <button
                            onClick={() => {
                              const maxRemaining = item.quantity - (assignedQty.get(pi.order_item_id) || 0) + pi.quantity;
                              if (pi.quantity < maxRemaining) {
                                updateQty(parcelIdx, pi.order_item_id, pi.quantity + 1);
                              }
                            }}
                            className="w-7 h-7 rounded-md border border-gray-200 dark:border-gray-600 flex items-center justify-center text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm"
                          >
                            +
                          </button>
                        </div>

                        {/* Move to other parcel buttons */}
                        {parcels.length > 1 && (
                          <select
                            className="text-xs border border-gray-200 dark:border-gray-600 rounded-md px-1.5 py-1 bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300"
                            value=""
                            onChange={(e) => {
                              const toIdx = parseInt(e.target.value);
                              if (!isNaN(toIdx) && toIdx !== parcelIdx) {
                                moveItem(parcelIdx, toIdx, pi.order_item_id, pi.quantity);
                              }
                            }}
                          >
                            <option value="">ย้าย...</option>
                            {parcels.map((_, i) =>
                              i !== parcelIdx ? (
                                <option key={i} value={i}>กล่อง {i + 1}</option>
                              ) : null
                            )}
                          </select>
                        )}
                      </div>
                    );
                  })
                )}

                {/* Add unassigned items to this parcel */}
                {unassignedItems.length > 0 && (
                  <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-xs text-gray-400 mb-1.5">เพิ่มสินค้า:</p>
                    <div className="flex flex-wrap gap-1.5">
                      {unassignedItems.map(item => {
                        const remaining = item.quantity - (assignedQty.get(item.id) || 0);
                        return (
                          <button
                            key={item.id}
                            onClick={() => addToParcel(parcelIdx, item.id, remaining)}
                            className="text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50"
                          >
                            + {item.product_name} x{remaining}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Add parcel button */}
          {parcels.length < 5 && (
            <button
              onClick={addParcel}
              className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-lg text-gray-400 hover:text-gray-600 hover:border-gray-300 dark:hover:text-gray-300 dark:hover:border-gray-500 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span className="text-sm">เพิ่มกล่อง</span>
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            {parcels.length} กล่อง, {totalAssigned}/{totalRequired} ชิ้น
            {isShopee && <span className="text-xs text-gray-400 ml-2">(Shopee max 5)</span>}
          </div>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
            >
              ยกเลิก
            </button>
            <button
              onClick={handleSubmit}
              disabled={!isValid || loading}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg flex items-center gap-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              แบ่งกล่อง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
