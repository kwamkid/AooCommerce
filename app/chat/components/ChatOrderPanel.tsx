'use client';

import { memo, type RefObject } from 'react';
import dynamic from 'next/dynamic';
import { ChevronLeft, ShoppingCart, X } from 'lucide-react';
import Tooltip from '@/components/ui/Tooltip';
import { LoadingCard } from '@/components/ui/StateCard';

// OrderForm ~3,300 บรรทัด — โหลดตอนเปิดแผงพอ (chunk เดียวกับที่หน้าแชทใช้อยู่)
const OrderForm = dynamic(() => import('@/components/orders/OrderForm'), { ssr: false, loading: () => <LoadingCard /> });

interface ChatOrderPanelProps {
  /** เปลี่ยนค่า = remount ฟอร์มใหม่หมด (ปุ่ม "เปิดบิล" นับขึ้นทีละ 1) */
  orderFormKey: number;
  platformLabel: string;
  contactName: string;
  /** ชื่อลูกค้าที่ผูกกับห้องนี้ — มีแล้วใช้แทน "{แพลตฟอร์ม}: {ชื่อในแชท}" */
  customerName?: string;
  customerId?: string;
  source?: string;
  sourceName?: string;
  chatAccountId?: string;
  warehousePortalRef: RefObject<HTMLDivElement | null>;
  headerActionsRef: RefObject<HTMLDivElement | null>;
  onSuccess: (orderId: string, customerId?: string, deliveryInfo?: { name?: string; phone?: string; email?: string }) => void;
  onSendBillToChat: (orderId: string, orderNumber: string, billUrl: string) => void;
  onClose: () => void;
}

/**
 * แผง "เปิดบิล" ของหน้าแชท — หัวแผง + ที่เสียบ portal ของคลัง/ปุ่มหัวแผง + OrderForm
 *
 * ⚠️ **`memo` ที่ห่อไว้คือเหตุผลทั้งหมดที่ไฟล์นี้แยกออกมา** — ทุกข้อความที่เข้ามาทำให้
 * หน้าแชททั้งหน้า re-render และเดิม OrderForm (3.3k บรรทัด) ที่เปิดค้างอยู่ก็ render ตาม
 * ทุกครั้ง · เพราะแบบนั้น **props ทุกตัวต้องเป็นค่าพื้นฐาน / ref / callback ที่ identity คงที่**
 * (ใช้ `useStableCallback` ฝั่งหน้าแชท) — ส่ง object `selectedContact` ทั้งก้อนหรือ
 * inline lambda เข้ามาเมื่อไหร่ memo ไร้ผลทันที
 */
function ChatOrderPanel({
  orderFormKey,
  platformLabel,
  contactName,
  customerName,
  customerId,
  source,
  sourceName,
  chatAccountId,
  warehousePortalRef,
  headerActionsRef,
  onSuccess,
  onSendBillToChat,
  onClose,
}: ChatOrderPanelProps) {
  return (
    <div className="flex w-full md:w-auto md:flex-1 flex-col border-l border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 absolute inset-0 md:static md:inset-auto z-10">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 min-h-[81px]">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-1 -ml-1 text-gray-500 hover:text-gray-700 md:hidden"><ChevronLeft className="w-6 h-6" /></button>
          <ShoppingCart className="w-5 h-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">เปิดบิล</h2>
            <p className="text-xs text-gray-500 dark:text-slate-400">{customerName || `${platformLabel}: ${contactName}`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div ref={headerActionsRef} />
          <div ref={warehousePortalRef} />
          <Tooltip text="ปิด"><button onClick={onClose} aria-label="ปิด" className="hidden md:block p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"><X className="w-5 h-5" /></button></Tooltip>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 pt-4">
        <OrderForm
          key={orderFormKey}
          {...(customerId ? { preselectedCustomerId: customerId } : {})}
          embedded={true}
          warehousePortalRef={warehousePortalRef}
          headerActionsRef={headerActionsRef}
          source={source}
          sourceName={sourceName}
          chatAccountId={chatAccountId}
          onSuccess={onSuccess}
          onSendBillToChat={onSendBillToChat}
          onCancel={onClose}
        />
      </div>
    </div>
  );
}

export default memo(ChatOrderPanel);
