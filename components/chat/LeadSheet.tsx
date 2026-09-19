'use client';

// Path: components/chat/LeadSheet.tsx
//
// แผ่นติดตามลูกค้า — สถานะในกรวยขาย + นัดทักอีกครั้ง ของ "คน" หนึ่งคน
//
// เปิดจากรูปโปรไฟล์ (หัวห้องแชท · รายชื่อ) — **จอเล็กเลื่อนขึ้นจากล่าง** จอใหญ่เป็นกล่องกลางจอ
// ทุกปุ่มบันทึกทันทีเมื่อแตะ **ไม่มีปุ่มบันทึก** (ของเดิมที่ต้องกดบันทึกทีหลัง คนกดสถานะแล้วปิดจอไป
// ค่าไม่เคยถูกเขียน)
//
// ⚠️ **แผ่นนี้ต้องเตี้ยที่สุดเท่าที่จะทำได้** — มันบังห้องแชทที่พนักงานกำลังคุยอยู่ ทุกบรรทัดที่เพิ่ม
//    คือข้อความที่เขามองไม่เห็น · อะไรที่ "ยังไม่มี" (นัด · ตัวนับรอโอน) ไม่ต้องวาดที่ว่างไว้รอ
// ⚠️ ห้ามแยกเป็นแผ่นของ "ห้องแชท" — นัดผูกกับคน (lead) คนเดียวทักหลายช่องทางต้องได้นัดเดียว

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import Modal from '@/components/ui/Modal';
import FormSelect from '@/components/ui/FormSelect';
import FormInput from '@/components/ui/FormInput';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import LeadStageIcon from './LeadStageIcon';
import { CalendarIcon, MemberIcon } from '@/lib/icons';
import { DEFAULT_LEAD_STAGES, STAGE_ACTIVE_CLASS, STAGE_CHIP_CLASS, type LeadStage } from '@/lib/leads/stages';
import {
  followUpPresets, formatShortThaiDate, followUpLabel, waitingDays, FOLLOW_UP_HOUR,
} from '@/lib/leads/followup-presets';

export interface LeadData {
  id: string;
  stage: string;
  stage_source: 'manual' | 'system';
  stage_changed_at: string;
  follow_up_at: string | null;
  follow_up_note: string | null;
  assigned_to: string | null;
  quote_sent_at: string | null;
  reminded_count: number;
}

interface Props {
  open: boolean;
  contactId: string;
  platform: string;
  contactName: string;
  onClose: () => void;
  /** แจ้งหน้าที่เรียกให้ patch แถวของตัวเอง — หน้าแชทไม่ต้องดึงรายชื่อใหม่ทั้งก้อน */
  onChanged?: (lead: LeadData) => void;
}

export default function LeadSheet({ open, contactId, platform, contactName, onClose, onChanged }: Props) {
  const { showToast } = useToast();
  const [stages, setStages] = useState<LeadStage[]>(DEFAULT_LEAD_STAGES);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [lead, setLead] = useState<LeadData | null>(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  /** เปิดช่องปฏิทินของเครื่อง — แยกเป็นปุ่มเพราะ input date ซ้อนใต้ปุ่มกดไม่ติดบนบางเบราว์เซอร์ */
  const dateInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || !contactId) return;
    let cancelled = false;
    apiFetch(`/api/leads?contact_id=${contactId}&platform=${platform}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
        setMembers(Array.isArray(data.members) ? data.members : []);
        setLead(data.lead || null);
        setNote(data.lead?.follow_up_note || '');
      })
      .catch(() => { if (!cancelled) showToast('โหลดข้อมูลการติดตามไม่สำเร็จ', 'error'); });
    return () => { cancelled = true; };
  }, [open, contactId, platform, showToast]);

  const save = useCallback(async (patch: Record<string, unknown>, message: string, closeAfter = false) => {
    setSaving(true);
    try {
      const res = await apiFetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setLead(data.lead);
      onChanged?.(data.lead);
      showToast(message);
      if (closeAfter) setTimeout(onClose, 300);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  }, [contactId, platform, onChanged, onClose, showToast]);

  if (!open) return null;

  const currentKey = lead?.stage || stages.find(s => s.is_default)?.key || 'new';
  const current = stages.find(s => s.key === currentKey) || stages[0];
  const due = followUpLabel(lead?.follow_up_at);
  const waiting = currentKey === 'quoted' ? waitingDays(lead?.quote_sent_at) : null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">{contactName}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 inline-flex items-center gap-1 ${STAGE_CHIP_CLASS[current?.color || 'gray']}`}>
            <LeadStageIcon stageKey={currentKey} className="w-3.5 h-3.5" />
            {current?.name || currentKey}
          </span>
          {lead?.stage_source === 'system' && (
            <span className="text-[11px] font-normal text-gray-400 flex-shrink-0">ระบบติดให้</span>
          )}
        </span>
      }
    >
      {/* รอโอนมากี่วัน — บรรทัดเดียว โผล่เฉพาะตอนที่มีบิลค้างจริง */}
      {waiting !== null && (
        <div className="mb-3 text-sm font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-1.5">
          รอโอนมา {waiting} วัน{(lead?.reminded_count || 0) > 0 ? ` · ทวงแล้ว ${lead?.reminded_count} ครั้ง` : ''}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {stages.map(s => {
          const active = s.key === currentKey;
          return (
            <Button
              key={s.key}
              size="sm"
              fullWidth
              variant="secondary"
              className={active ? STAGE_ACTIVE_CLASS[s.color] : undefined}
              disabled={saving}
              icon={<LeadStageIcon stageKey={s.key} />}
              title={s.auto_managed ? 'ระบบติดให้เองเมื่อส่งบิล/ลูกค้าจ่ายเงิน' : undefined}
              onClick={() => save({ stage: s.key }, `เปลี่ยนเป็น “${s.name}”`)}
            >
              {s.name}
            </Button>
          );
        })}
      </div>

      {/* นัด — ป้ายนัดปัจจุบันอยู่ท้ายหัวข้อ ไม่ใช่กล่องแยกด้านล่าง */}
      <div className="flex items-center justify-between mt-3.5 mb-1.5">
        <span className="text-xs font-semibold text-gray-500 dark:text-slate-400">ทักอีกทีเมื่อ</span>
        {lead?.follow_up_at && (
          <Badge
            tone={due?.overdue ? 'red' : 'amber'}
            size="sm"
            onRemove={saving ? undefined : () => save({ follow_up_at: null }, 'ยกเลิกนัดแล้ว')}
            removeLabel="ยกเลิกนัด"
          >
            {formatShortThaiDate(lead.follow_up_at)} {FOLLOW_UP_HOUR}:00
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {followUpPresets().map(p => {
          const picked = !!lead?.follow_up_at && Math.abs(new Date(lead.follow_up_at).getTime() - p.date.getTime()) < 36e5;
          return (
            <Button
              key={p.key}
              size="sm"
              fullWidth
              variant={picked ? 'primary' : 'secondary'}
              disabled={saving}
              title={formatShortThaiDate(p.date)}
              onClick={() => save({ follow_up_at: p.date.toISOString() }, `ทักอีกที ${formatShortThaiDate(p.date)}`, true)}
            >
              {p.label}
              <span className="opacity-60 ml-1">{formatShortThaiDate(p.date).replace(/^\S+\s/, '')}</span>
            </Button>
          );
        })}

        {/* เลือกวันเอง — กดแล้วเปิดปฏิทินของเครื่องตรง ๆ (showPicker) ช่องจริงซ่อนไว้ */}
        <Button
          size="sm"
          fullWidth
          variant="secondary"
          disabled={saving}
          icon={<CalendarIcon />}
          onClick={() => {
            const el = dateInputRef.current;
            if (!el) return;
            // Safari/บางเบราว์เซอร์ไม่มี showPicker — ตกไปใช้ focus+click ของช่องจริง
            if (typeof el.showPicker === 'function') el.showPicker();
            else { el.focus(); el.click(); }
          }}
        >
          เลือกวัน
        </Button>
        <input
          ref={dateInputRef}
          type="date"
          aria-label="เลือกวันนัดเอง"
          className="sr-only"
          onChange={e => {
            if (!e.target.value) return;
            const d = new Date(`${e.target.value}T${String(FOLLOW_UP_HOUR).padStart(2, '0')}:00:00`);
            save({ follow_up_at: d.toISOString() }, `ทักอีกที ${formatShortThaiDate(d)}`, true);
          }}
        />
      </div>

      {/* ผู้รับผิดชอบ + โน้ต อยู่แถวเดียวกัน (สองอย่างนี้เป็นของเสริม ไม่ควรกินคนละบรรทัด) */}
      <div className="grid grid-cols-2 gap-2 mt-3.5">
        <FormSelect
          value={lead?.assigned_to || ''}
          onChange={v => save({ assigned_to: v || null }, v ? 'มอบหมายแล้ว' : 'ปลดผู้รับผิดชอบแล้ว')}
          options={members.map(m => ({ id: m.id, label: m.name }))}
          clearLabel="ไม่ระบุ"
          placeholder="ผู้รับผิดชอบ"
          icon={<MemberIcon className="w-4 h-4" />}
          portal
          disabled={saving}
        />
        <FormInput
          value={note}
          onChange={e => setNote(e.target.value)}
          onBlur={() => { if ((lead?.follow_up_note || '') !== note) save({ follow_up_note: note }, 'บันทึกโน้ตแล้ว'); }}
          placeholder="โน้ต เช่น รอเงินเดือนออก"
          disabled={saving}
        />
      </div>
    </Modal>
  );
}
