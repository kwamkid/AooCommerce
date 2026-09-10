'use client';

import { useState, useMemo } from 'react';
import { Clock, CheckCircle, Package, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Radio from '@/components/ui/Radio';
import Badge from '@/components/ui/Badge';
import {
  ADDRESS_FLAG_LABELS,
  pickDefaultHandoverAddress,
  type HandoverAddress,
  type HandoverOrder,
  type HandoverSelection,
  type HandoverSlot,
} from '@/lib/marketplace/handover';

export type { HandoverOrder, HandoverSelection, HandoverSlot, HandoverAddress };

interface HandoverPickerPanelProps {
  orders: HandoverOrder[];
  loading: boolean;
  onConfirm: (selections: Map<string, HandoverSelection>) => void;
  onSkip: () => void;
}

/**
 * ระหว่างกรอก: `pickup_time_id === null` = ยังไม่ได้เลือกรอบ
 * ส่วน `''` = ที่อยู่นี้ไม่มีรอบให้เลือก (แพลตฟอร์มจัดให้เอง) ซึ่งถือว่า "ตอบครบแล้ว"
 * แยกสองอย่างนี้ไม่ออกเมื่อไหร่ ปุ่มยืนยันจะเปิดทั้งที่ยังไม่ได้เลือก
 */
type Pick = { address_id?: number; pickup_time_id: string | null };

/**
 * จอเดียวของทุก marketplace สำหรับคำถาม **"ให้ขนส่งมารับที่ไหน เมื่อไหร่"**
 *
 * ⚠️ ที่อยู่สำคัญกว่ารอบเวลา — ร้านหนึ่งมีที่อยู่ได้หลายที่ (ABC the Baby มี 10 ที่)
 * เลือกผิด = รถไปจอดผิดที่ ยิ่งขนส่งด่วนที่มารับทันทีก็เสียรอบเลย
 */
export default function HandoverPickerPanel({
  orders,
  loading,
  onConfirm,
  onSkip,
}: HandoverPickerPanelProps) {
  // คำตอบที่ผู้ใช้กดเอง — ที่เหลืออ่านจากค่าตั้งต้นที่คิดสด ๆ ทุก render
  // (เก็บเป็น state ก้อนเดียวแล้ว sync ใน useEffect = setState ซ้อน render โดยไม่จำเป็น)
  const [overrides, setOverrides] = useState<Map<string, Pick>>(new Map());
  const [expandedOverride, setExpandedOverride] = useState<string | null | undefined>(undefined);

  /** รอบเวลาที่ออเดอร์ใบนี้เลือกได้จริง = รอบของที่อยู่ที่กำลังเลือกอยู่ */
  const slotsFor = (order: HandoverOrder, pick?: Pick): HandoverSlot[] => {
    const addresses = order.addresses || [];
    if (addresses.length === 0) return order.timeSlots;
    const chosen = addresses.find(a => a.address_id === pick?.address_id)
      || pickDefaultHandoverAddress(addresses);
    return chosen?.time_slots || [];
  };

  const addressFor = (order: HandoverOrder, pick?: Pick): HandoverAddress | undefined => {
    const addresses = order.addresses || [];
    if (addresses.length === 0) return undefined;
    return addresses.find(a => a.address_id === pick?.address_id)
      || pickDefaultHandoverAddress(addresses);
  };

  // ตั้งต้น: ที่อยู่ตามลำดับความน่าจะใช่ + รอบที่แพลตฟอร์มแนะนำ
  const defaultPicks = useMemo(() => {
    const map = new Map<string, Pick>();
    for (const order of orders) {
      const addresses = order.addresses || [];
      const preselected = addresses.length > 0 ? pickDefaultHandoverAddress(addresses) : undefined;
      const slots = preselected ? preselected.time_slots : order.timeSlots;
      const recommended = slots.find(s => s.recommended);
      map.set(order.orderId, {
        address_id: preselected?.address_id,
        // ไม่มีรอบให้เลือกเลย = ตอบครบแล้ว · มีรอบแต่ไม่มีตัวแนะนำ = ต้องให้คนเลือกเอง
        pickup_time_id: slots.length === 0 ? '' : (recommended?.pickup_time_id ?? null),
      });
    }
    return map;
  }, [orders]);

  const pickOf = (orderId: string): Pick | undefined => overrides.get(orderId) ?? defaultPicks.get(orderId);

  const applyPicks = (entries: Array<[string, Pick]>) => {
    setOverrides(prev => {
      const next = new Map(prev);
      for (const [orderId, pick] of entries) next.set(orderId, pick);
      return next;
    });
  };

  // กางใบแรกที่ยังไม่มีคำตอบให้เห็นเลยว่าต้องทำอะไรต่อ (จนกว่าผู้ใช้จะกดเอง)
  const defaultExpanded = useMemo(
    () => orders.find(o => defaultPicks.get(o.orderId)?.pickup_time_id === null)?.orderId ?? null,
    [orders, defaultPicks],
  );
  const expandedOrder = expandedOverride !== undefined ? expandedOverride : defaultExpanded;

  /**
   * ที่อยู่ชุดเดียวกัน = ร้านเดียวกัน → ถามครั้งเดียวแล้วใช้กับทุกใบในกลุ่ม
   * (กดรับ 20 ใบของร้านเดียวแล้วต้องเลือกที่อยู่ 20 รอบ คือจอที่ใช้งานไม่ได้)
   */
  const addressGroups = useMemo(() => {
    const map = new Map<string, { key: string; addresses: HandoverAddress[]; orderIds: string[]; shopName?: string }>();
    for (const order of orders) {
      const addresses = order.addresses || [];
      if (addresses.length <= 1) continue;
      const key = addresses.map(a => a.address_id).sort((a, b) => a - b).join(',');
      let group = map.get(key);
      if (!group) {
        group = { key, addresses, orderIds: [], shopName: order.shopName };
        map.set(key, group);
      }
      group.orderIds.push(order.orderId);
    }
    return [...map.values()];
  }, [orders]);

  const isComplete = (orderId: string) => {
    const pick = pickOf(orderId);
    return !!pick && pick.pickup_time_id !== null;
  };
  const allSelected = orders.every(o => isComplete(o.orderId));
  const selectedCount = orders.filter(o => isComplete(o.orderId)).length;

  const selectSlot = (orderId: string, timeId: string) => {
    applyPicks([[orderId, { address_id: pickOf(orderId)?.address_id, pickup_time_id: timeId }]]);
  };

  /** เลือกที่อยู่ให้ทั้งกลุ่ม แล้วเกลี่ยรอบเวลาใหม่ (รอบเดิมมีอยู่ก็คงไว้) */
  const selectAddressForGroup = (group: { orderIds: string[] }, addressId: number) => {
    const entries: Array<[string, Pick]> = group.orderIds.map(orderId => {
      const order = orders.find(o => o.orderId === orderId);
      const slots = order?.addresses?.find(a => a.address_id === addressId)?.time_slots || [];
      const cur = pickOf(orderId);
      let timeId: string | null;
      if (slots.length === 0) timeId = '';
      else if (cur?.pickup_time_id && slots.some(s => s.pickup_time_id === cur.pickup_time_id)) timeId = cur.pickup_time_id;
      else timeId = slots.find(s => s.recommended)?.pickup_time_id ?? null;
      return [orderId, { address_id: addressId, pickup_time_id: timeId }];
    });
    applyPicks(entries);
  };

  const selectRecommendedAll = () => {
    applyPicks(orders.map(order => {
      const cur = pickOf(order.orderId);
      const slots = slotsFor(order, cur);
      const pick = slots.find(s => s.recommended) || slots[0];
      return [order.orderId, {
        address_id: cur?.address_id,
        pickup_time_id: slots.length === 0 ? '' : (pick?.pickup_time_id ?? null),
      }];
    }));
  };

  const toggleExpand = (orderId: string) => {
    setExpandedOverride(expandedOrder === orderId ? null : orderId);
  };

  const handleConfirm = () => {
    const selections = new Map<string, HandoverSelection>();
    for (const order of orders) {
      const pick = pickOf(order.orderId);
      if (!pick || pick.pickup_time_id === null) continue;
      const selection: HandoverSelection = { pickup_time_id: pick.pickup_time_id };
      if ((order.addresses?.length || 0) > 0 && pick.address_id != null) {
        selection.address_id = pick.address_id;
      }
      selections.set(order.orderId, selection);
    }
    onConfirm(selections);
  };

  if (orders.length === 0) return null;

  return (
    <Modal
      open
      onClose={onSkip}
      size="lg"
      hideCloseButton
      title={
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
            <Package className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              รับออเดอร์ — ให้ขนส่งมารับที่ไหน เมื่อไหร่
            </h3>
            <p className="text-sm text-gray-500 dark:text-slate-400 font-normal">
              {orders.length} ออเดอร์
            </p>
          </div>
        </div>
      }
      footer={
        <div className="flex items-center justify-between p-5">
          <button
            onClick={onSkip}
            disabled={loading}
            className="text-sm text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors disabled:opacity-50"
          >
            ยังไม่รับ
          </button>
          <Button
            variant="primary"
            onClick={handleConfirm}
            disabled={!allSelected}
            loading={loading}
            icon={<Package className="w-4 h-4" />}
          >
            {loading ? 'กำลังดำเนินการ...' : `รับออเดอร์ (${selectedCount}/${orders.length})`}
          </Button>
        </div>
      }
    >
      {/* ที่อยู่ให้ขนส่งมารับ — ถามก่อนเรื่องเวลา เพราะเลือกผิดแล้วรถไปผิดที่ */}
      {addressGroups.map(group => {
        const selectedId = pickOf(group.orderIds[0])?.address_id;
        return (
          <div key={group.key} className="px-5 pt-4 pb-1">
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
              <span className="text-base font-medium text-gray-900 dark:text-white">
                ให้ขนส่งมารับที่
                {addressGroups.length > 1 && group.shopName ? ` · ${group.shopName}` : ''}
              </span>
            </div>
            <div className="space-y-1.5">
              {group.addresses.map(address => {
                const active = address.address_id === selectedId;
                return (
                  <Radio
                    key={address.address_id}
                    checked={active}
                    disabled={loading}
                    onChange={() => selectAddressForGroup(group, address.address_id)}
                    className={`choice-card px-3 py-2.5 items-start ${active ? 'choice-card-active' : ''}`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-gray-900 dark:text-white break-words">
                        {address.label}
                      </div>
                      {address.detail && (
                        <div className="text-sm text-gray-500 dark:text-slate-400 break-words">
                          {address.detail}
                        </div>
                      )}
                      {(address.last_used || address.flags.length > 0) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {address.last_used && (
                            <Badge size="sm" tone="emerald">ใช้ล่าสุด</Badge>
                          )}
                          {address.flags
                            .filter(flag => ADDRESS_FLAG_LABELS[flag])
                            .map(flag => (
                              <Badge key={flag} size="sm" tone={flag === 'pickup_address' ? 'blue' : 'gray'}>
                                {ADDRESS_FLAG_LABELS[flag]}
                              </Badge>
                            ))}
                        </div>
                      )}
                    </div>
                  </Radio>
                );
              })}
            </div>
          </div>
        );
      })}

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
      <div className="px-5 py-2 space-y-2">
        {orders.map((order) => {
          const pick = pickOf(order.orderId);
          const isExpanded = expandedOrder === order.orderId;
          const slots = slotsFor(order, pick);
          const address = addressFor(order, pick);
          const selectedSlot = pick?.pickup_time_id
            ? slots.find(s => s.pickup_time_id === pick.pickup_time_id)
            : undefined;
          const done = isComplete(order.orderId);

          return (
            <div
              key={order.orderId}
              className={`rounded-lg border-2 transition-colors ${
                done
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
                  {done ? (
                    <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                  ) : (
                    <Clock className="w-4 h-4 text-orange-400 flex-shrink-0" />
                  )}
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {order.orderNumber}
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {selectedSlot && !isExpanded && (
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

              {/* Expanded: show pickup address + time slots */}
              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5">
                  {address && (
                    <p className="text-sm text-gray-500 dark:text-slate-400 truncate">
                      รับที่: {address.label}
                    </p>
                  )}
                  {slots.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-slate-400">
                      Shopee จะจัดรอบให้เอง
                    </p>
                  ) : slots.map((slot) => {
                    const isSelected = pick?.pickup_time_id === slot.pickup_time_id;
                    return (
                      <button
                        key={slot.pickup_time_id}
                        onClick={() => selectSlot(order.orderId, slot.pickup_time_id)}
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
    </Modal>
  );
}
