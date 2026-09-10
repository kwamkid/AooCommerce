// Path: components/broadcast/LinePhonePreview.tsx
//
// กรอบมือถือ + ห้องแชท LINE จำลอง — เปลือกเดียวของ "ตัวอย่างในแชทของลูกค้า"
// ผู้เรียกแตกเนื้อหาเป็นก้อนตามที่ LINE ส่งจริง (1 message object = 1 ก้อน) แล้วส่งมาเป็น `messages`
// ใช้ที่: BroadcastPreview (หน้าสร้าง + หน้ารายงานบรอดแคสต์) · ต้นแบบตัวแก้ไขแบบบล็อก (/dev/design)
//
// การวางเทียบกับรูปแคปจากมือถือจริงของเจ้าของ (10 ก.ย. 2026):
//  - ข้อความ / รูปธรรมดา อยู่ข้างรูปโปรไฟล์ร้าน
//  - การ์ด (Flex · carousel) และรูปเต็มจอ **ตกบรรทัดลงมา** ใต้รูปโปรไฟล์ กว้างเกือบชนขอบจอ
//  - รูปโปรไฟล์ขึ้นที่ก้อนแรก และขึ้นอีกทุกครั้งที่ก้อนก่อนหน้าเป็นการ์ด/รูปเต็มจอ
//    (ในรูปแคป ข้อความที่ตามหลังการ์ดมีรูปโปรไฟล์ของตัวเอง แต่ที่ตามหลังข้อความไม่มี)
//  - ชื่อร้านอยู่แถบหัวห้องแชท ไม่ได้อยู่เหนือข้อความ (แชท 1:1 กับ OA ไม่โชว์ชื่อเหนือข้อความ)
//  - จอสูงคงที่ ยาวเกินก็เลื่อนดูในจอ และติดท้ายห้องไว้เหมือนเปิดแชทบนมือถือ
//
// ⚠️ ของในจอตรึงสีเดียวทั้งสองธีม (ไม่มี dark:) — สิ่งที่ลูกค้าเห็นไม่ขึ้นกับธีมของแอดมิน
//    สีกรอบ/แถบ/สกอลบาร์อยู่ที่ `.phone-mock*` ใน globals.css
'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import {
  BatteryFull, ChevronLeft, Image as ImageIcon, Menu, Mic, Phone, Plus, Search, Signal, Smile, Wifi,
} from 'lucide-react';
import UserAvatar from '@/components/ui/UserAvatar';

export interface PhoneChatMessage {
  /** key ของ React — id ของบล็อก หรือชื่อชิ้นของเนื้อหา */
  key: string;
  /** true = การ์ด/รูปเต็มจอ — ตกบรรทัดใต้รูปโปรไฟล์ กว้างเกือบชนขอบจอ · ไม่ส่ง = อยู่ข้างรูปโปรไฟล์ */
  wide?: boolean;
  node: ReactNode;
}

export interface LinePhonePreviewProps {
  /** ชื่อ OA/ร้าน บนแถบหัวห้องแชท */
  accountName: string | null;
  /** รูปโปรไฟล์ของบัญชี — ไม่มีก็ตกไปเป็นตัวอักษรแรกของชื่อ */
  accountPictureUrl?: string | null;
  messages: PhoneChatMessage[];
  /** ปุ่มตอบเร็ว — ลอยเหนือแถบพิมพ์ ไม่เลื่อนไปกับข้อความ (เหมือน LINE) */
  quickReplies?: string[];
  /** lg = จอสูงเต็มที่ (คอลัมน์ตัวอย่างของตัวเอง) · md = เตี้ยลง (แผงข้างที่มีการ์ดอื่นอยู่ด้วย) */
  size?: 'md' | 'lg';
  className?: string;
}

/** ห่างท้ายห้องไม่เกินนี้ = ถือว่ายังอยู่ท้ายห้อง — เลื่อนขึ้นไปไกลกว่านี้แล้วจะไม่ดึงกลับลงล่างเอง */
const BOTTOM_SLACK_PX = 24;

export default function LinePhonePreview({
  accountName, accountPictureUrl, messages, quickReplies = [], size = 'lg', className,
}: LinePhonePreviewProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const name = (accountName || '').trim();
  const replies = quickReplies.map(q => q.trim()).filter(Boolean);

  // ติดท้ายห้องไว้ — เนื้อหาโต (พิมพ์เพิ่ม · เพิ่มบล็อก · รูปโหลดเสร็จ) ก็ยังเห็นก้อนล่าสุดเหมือนมือถือ
  // แต่ถ้าผู้ใช้เลื่อนขึ้นไปดูก้อนบนแล้ว ปล่อยไว้ตรงนั้น ไม่ดึงกลับลงมาทุกตัวอักษรที่พิมพ์
  useEffect(() => {
    const body = bodyRef.current;
    const content = contentRef.current;
    if (!body || !content || typeof ResizeObserver === 'undefined') return;
    let pinned = true;
    const onScroll = () => {
      pinned = body.scrollHeight - body.scrollTop - body.clientHeight <= BOTTOM_SLACK_PX;
    };
    const observer = new ResizeObserver(() => {
      if (pinned) body.scrollTop = body.scrollHeight;
    });
    body.addEventListener('scroll', onScroll, { passive: true });
    observer.observe(content);
    return () => {
      observer.disconnect();
      body.removeEventListener('scroll', onScroll);
    };
  }, []);

  const avatar = <UserAvatar name={name || null} src={accountPictureUrl} size="sm" />;

  return (
    <div className={`phone-mock ${className || ''}`}>
      <div className={`phone-mock-screen ${size === 'md' ? 'phone-mock-screen-md' : ''}`}>
        {/* แถบสถานะ + แถบหัวห้องแชท — ของตกแต่ง บอกทันทีว่านี่คือจอมือถือของลูกค้า */}
        <div className="phone-mock-status" aria-hidden="true">
          <span>9:41</span>
          <span className="phone-mock-island" />
          <span className="flex items-center gap-1">
            <Signal className="w-3.5 h-3.5" />
            <Wifi className="w-3.5 h-3.5" />
            <BatteryFull className="w-4 h-4" />
          </span>
        </div>
        <div className="phone-mock-header">
          <ChevronLeft className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
          <p className="flex-1 min-w-0 truncate body-text font-semibold">{name || 'บัญชีของร้าน'}</p>
          <span className="flex items-center gap-3" aria-hidden="true">
            <Search className="w-4 h-4" />
            <Phone className="w-4 h-4" />
            <Menu className="w-4 h-4" />
          </span>
        </div>

        <div ref={bodyRef} className="phone-mock-body">
          {/* min-h-full + justify-end = ข้อความน้อยก็นั่งอยู่ท้ายห้องเหนือแถบพิมพ์ ไม่ลอยอยู่บนสุด */}
          <div ref={contentRef} className="min-h-full flex flex-col justify-end px-2.5 py-3">
            {messages.map((m, i) => {
              const newGroup = i === 0 || !!messages[i - 1].wide;
              const gap = i === 0 ? '' : newGroup ? 'mt-3' : 'mt-1.5';
              if (m.wide) {
                return (
                  <div key={m.key} className={gap}>
                    {newGroup && avatar}
                    <div className={`-mx-1 ${newGroup ? 'mt-1.5' : ''}`}>{m.node}</div>
                  </div>
                );
              }
              return (
                <div key={m.key} className={`flex gap-2 items-start ${gap}`}>
                  {newGroup ? avatar : <span className="w-8 flex-shrink-0" />}
                  <div className="flex-1 min-w-0">{m.node}</div>
                </div>
              );
            })}
          </div>
        </div>

        {replies.length > 0 && (
          <div className="phone-mock-replies">
            {replies.map((q, i) => (
              <span key={i} className="subtitle-text px-3 py-1 rounded-full bg-gray-900/70 text-white">
                {q}
              </span>
            ))}
          </div>
        )}
        {/* แถบพิมพ์ของลูกค้า — ของตกแต่ง ไม่ใช่ช่องกรอก */}
        <div className="phone-mock-input" aria-hidden="true">
          <Plus className="w-5 h-5" />
          <ImageIcon className="w-5 h-5" />
          <span className="flex-1 h-8 rounded-full bg-gray-100 px-3 flex items-center subtitle-text">Aa</span>
          <Smile className="w-5 h-5" />
          <Mic className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
}
