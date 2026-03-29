'use client';

import { useState, useEffect } from 'react';
import { Clock, CheckCircle, Loader2, Package, ChevronDown, ChevronUp } from 'lucide-react';

export interface TimeSlot {
  pickup_time_id: string;
  date: number;
  display: string;
  recommended: boolean;
}

export interface TimeSlotOrder {
  orderId: string;
  orderSn: string;
  orderNumber: string;
  timeSlots: TimeSlot[];
}

interface TimeSlotPickerPanelProps {
  orders: TimeSlotOrder[];
  loading: boolean;
  onConfirm: (selections: Map<string, string>) => void;
  onSkip: () => void;
}

/**
 * Full-page panel showing all orders that need timeslot selection.
 * Replaces the old one-by-one modal queue.
 */
export default function TimeSlotPickerPanel({
  orders,
  loading,
  onConfirm,
  onSkip,
}: TimeSlotPickerPanelProps) {
  // Map<orderId, pickup_time_id>
  const [selections, setSelections] = useState<Map<string, string>>(new Map());
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Auto-select recommended timeslot for all orders
  useEffect(() => {
    const initial = new Map<string, string>();
    for (const order of orders) {
      const recommended = order.timeSlots.find(s => s.recommended);
      if (recommended) {
        initial.set(order.orderId, recommended.pickup_time_id);
      }
    }
    setSelections(initial);
    // Expand first order that has no recommended slot
    const firstNoRec = orders.find(o => !o.timeSlots.some(s => s.recommended));
    if (firstNoRec) setExpandedOrder(firstNoRec.orderId);
  }, [orders]);

  const allSelected = orders.every(o => selections.has(o.orderId));
  const selectedCount = Array.from(selections.values()).filter(Boolean).length;

  const selectForOrder = (orderId: string, timeId: string) => {
    setSelections(prev => {
      const next = new Map(prev);
      next.set(orderId, timeId);
      return next;
    });
  };

  const selectRecommendedAll = () => {
    const next = new Map(selections);
    for (const order of orders) {
      const recommended = order.timeSlots.find(s => s.recommended);
      const first = order.timeSlots[0];
      const pick = recommended || first;
      if (pick) next.set(order.orderId, pick.pickup_time_id);
    }
    setSelections(next);
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOrder(prev => prev === orderId ? null : orderId);
  };

  const getSelectedDisplay = (order: TimeSlotOrder) => {
    const timeId = selections.get(order.orderId);
    if (!timeId) return null;
    return order.timeSlots.find(s => s.pickup_time_id === timeId);
  };

  if (orders.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl max-w-lg w-full max-h-[85vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 p-5 border-b border-gray-200 dark:border-slate-700">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              เลือกเวลารับพัสดุ
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400">
              {orders.length} ออเดอร์ต้องเลือกรอบเวลา
            </p>
          </div>
        </div>

        {/* Use recommended button */}
        <div className="px-5 pt-4 pb-2">
          <button
            onClick={selectRecommendedAll}
            disabled={loading}
            className="w-full text-sm text-primary hover:text-primary-hover font-medium py-2 px-3 rounded-lg border border-orange-200 dark:border-orange-800 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors disabled:opacity-50"
          >
            ใช้เวลาแนะนำทั้งหมด
          </button>
        </div>

        {/* Order list */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
          {orders.map((order) => {
            const isExpanded = expandedOrder === order.orderId;
            const selectedSlot = getSelectedDisplay(order);
            const hasSelection = !!selectedSlot;

            return (
              <div
                key={order.orderId}
                className={`rounded-lg border-2 transition-colors ${
                  hasSelection
                    ? 'border-green-200 dark:border-green-800 bg-green-50/30 dark:bg-green-900/10'
                    : 'border-orange-200 dark:border-orange-800 bg-orange-50/20 dark:bg-orange-900/10'
                }`}
              >
                {/* Order header — click to expand */}
                <button
                  onClick={() => toggleExpand(order.orderId)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {hasSelection ? (
                      <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                    ) : (
                      <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
                    )}
                    <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {order.orderNumber}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {hasSelection && !isExpanded && (
                      <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-0.5 rounded-full">
                        {selectedSlot.display}
                      </span>
                    )}
                    {isExpanded ? (
                      <ChevronUp className="w-4 h-4 text-gray-400" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-gray-400" />
                    )}
                  </div>
                </button>

                {/* Expanded: show time slots */}
                {isExpanded && (
                  <div className="px-4 pb-3 space-y-1.5">
                    {order.timeSlots.map((slot) => {
                      const isSelected = selections.get(order.orderId) === slot.pickup_time_id;
                      return (
                        <button
                          key={slot.pickup_time_id}
                          onClick={() => selectForOrder(order.orderId, slot.pickup_time_id)}
                          disabled={loading}
                          className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors disabled:opacity-50 flex items-center justify-between ${
                            isSelected
                              ? 'border-primary bg-orange-50 dark:bg-orange-900/20'
                              : slot.recommended
                                ? 'border-orange-200 dark:border-orange-700 hover:bg-orange-50/50 dark:hover:bg-orange-900/10'
                                : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700/50'
                          }`}
                        >
                          <span className="text-sm text-gray-900 dark:text-white">
                            {slot.display}
                          </span>
                          <div className="flex items-center gap-1.5">
                            {slot.recommended && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary text-white">
                                แนะนำ
                              </span>
                            )}
                            {isSelected && (
                              <CheckCircle className="w-4 h-4 text-primary" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5 border-t border-gray-200 dark:border-slate-700">
          <button
            onClick={onSkip}
            disabled={loading}
            className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            ยังไม่รับ
          </button>
          <button
            onClick={() => onConfirm(selections)}
            disabled={loading || !allSelected}
            className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-hover transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> กำลังดำเนินการ...</>
            ) : (
              <><Package className="w-4 h-4" /> รับออเดอร์ ({selectedCount}/{orders.length})</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
