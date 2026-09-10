// Path: app/marketing/audiences/components/TemplatePicker.tsx
//
// การ์ด "แม่แบบกลุ่มเป้าหมาย" — กดแล้วไปหน้าสร้างที่กรอกเงื่อนไขให้แล้ว (ยังไม่บันทึก)
//
// ทุกใบต้องตอบสองอย่างในตัวเอง: **กลุ่มนี้คือใคร** (description) และ
// **เอาไปทำอะไรใน Ads Manager** (use) — ไม่งั้นผู้ใช้กดสร้างครบทุกใบแล้วไม่รู้จะใช้ยังไง
//
// ⛔ แม่แบบที่ยังใช้ไม่ได้ (ไม่มีเพจ Facebook) **ห้ามซ่อน** — จางลง + ปุ่มกดไม่ได้ +
//    บอกเหตุผลทั้งใน tooltip และเป็นบรรทัดในการ์ด
'use client';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Tooltip from '@/components/ui/Tooltip';
import {
  AUDIENCE_TEMPLATES,
  templateUnavailableReason,
  type AudienceTemplate,
  type AudienceTemplateKey,
} from '@/lib/audiences/templates';
import { Megaphone, MessageCircle, ShoppingBag, UserMinus, Users, type LucideIcon } from 'lucide-react';

const ICONS: Record<AudienceTemplate['icon'], LucideIcon> = {
  ShoppingBag,
  Users,
  UserMinus,
  MessageCircle,
  Megaphone,
};

interface Props {
  /** ช่องทางที่เชื่อมไว้ — ใช้ตัดสินว่าแม่แบบไหนยังใช้ไม่ได้ */
  accounts: { platform: 'line' | 'facebook' }[];
  onPick: (key: AudienceTemplateKey) => void;
  disabled?: boolean;
}

export default function TemplatePicker({ accounts, onPick, disabled }: Props) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {AUDIENCE_TEMPLATES.map(t => {
        const Icon = ICONS[t.icon];
        const reason = templateUnavailableReason(t, accounts);
        const locked = disabled || !!reason;
        const button = (
          <Button
            variant="primary"
            disabled={locked}
            // การ์ดทั้งใบกดได้ด้วย — ไม่หยุดที่ปุ่ม จะยิง onPick สองรอบ
            onClick={(e) => { e.stopPropagation(); onPick(t.key); }}
          >
            ใช้แม่แบบนี้
          </Button>
        );

        return (
          <Card
            key={t.key}
            padding="md"
            // `choice-card` = คลาสกลางของ "การ์ดตัวเลือกที่กดได้ทั้งใบ" (ขอบ + hover)
            // ใช้ตัวนี้แทนการแต่งสีเอง การ์ดจึงเห็นขอบชัดบนพื้นเทาของหน้า โดยไม่ไปแตะ `.card`
            // ซึ่งใช้ร่วมกันทั้งเว็บ
            className={`choice-card flex flex-col gap-2 ${reason ? 'opacity-60' : 'cursor-pointer'}`}
            onClick={locked ? undefined : () => onPick(t.key)}
          >
            <div className="flex items-start gap-2.5 min-w-0">
              <span className="w-9 h-9 rounded-lg bg-orange-50 dark:bg-orange-950/20 text-primary flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="heading-4">{t.name}</h3>
                <p className="subtitle-text mt-0.5">{t.description}</p>
              </div>
              {/* ปุ่มอยู่บนขวาคู่กับชื่อ — ตำแหน่งเดียวกันทุกใบ ไม่ต้องกวาดตาหาที่ท้ายการ์ด
                  ซึ่งอยู่คนละระดับกันเพราะคำอธิบายแต่ละใบยาวไม่เท่ากัน */}
              <span className="flex-shrink-0">
                {reason ? <Tooltip text={reason} box="inline-flex">{button}</Tooltip> : button}
              </span>
            </div>

            <p className="helper-text">
              <Badge tone="blue" size="sm" className="mr-1.5 align-middle">ใช้ทำอะไร</Badge>
              {t.use}
            </p>

            {reason && <p className="helper-text">{reason}</p>}
          </Card>
        );
      })}
    </div>
  );
}

interface ModalProps extends Props {
  open: boolean;
  onClose: () => void;
}

/** ตัวเดียวกันในป๊อปอัป — ใช้ตอนหน้ารายการมีกลุ่มอยู่แล้ว (ไม่ควรกินพื้นที่หน้าหลัก) */
export function TemplatePickerModal({ open, onClose, accounts, onPick, disabled }: ModalProps) {
  return (
    <Modal open={open} onClose={onClose} size="2xl" title="สร้างกลุ่มจากแม่แบบ"
      footer={(
        <div className="flex justify-end gap-2 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
        </div>
      )}
    >
      <div className="px-6 py-5 space-y-3">
        <p className="subtitle-text">
          กลุ่มที่ร้านค้าส่วนใหญ่ต้องมี — กดแล้วไปหน้าสร้างที่กรอกเงื่อนไขให้แล้ว แก้ได้ก่อนบันทึก
        </p>
        <TemplatePicker accounts={accounts} onPick={onPick} disabled={disabled} />
      </div>
    </Modal>
  );
}
