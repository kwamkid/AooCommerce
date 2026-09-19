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
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import DateRangePicker, { type DateValueType } from '@/components/ui/DateRangePicker';
import LeadStageIcon from './LeadStageIcon';
import { MemberIcon } from '@/lib/icons';
import { DEFAULT_LEAD_STAGES, STAGE_ACTIVE_CLASS, STAGE_CHIP_CLASS, CLOSED_STAGE_KEYS, type LeadStage } from '@/lib/leads/stages';
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

export interface LeadMember { id: string; name: string }

interface Props {
  open: boolean;
  contactId: string;
  platform: string;
  contactName: string;
  /**
   * ค่าที่หน้าแชทโหลดไว้แล้วตอนเลือกห้อง — แผ่นวาดได้ทันทีไม่ต้องรอ (เดิมเปิดมาว่างแล้วค่อยเด้งเนื้อ)
   * ส่งครบ = ไม่ยิง API ตอนเปิดเลย
   */
  initialLead?: LeadData | null;
  initialStages?: LeadStage[];
  initialMembers?: LeadMember[];
  /**
   * วาดเป็นเนื้อในแผงข้าง (หน้าแชทเป็นคนวาดหัวแผงเอง) แทนโมดัล —
   * โมดัลบังห้องแชทที่กำลังคุย แผงข้างวางคู่กับห้องได้เหมือนแผงเปิดบิล
   */
  embedded?: boolean;
  onClose: () => void;
  /** แจ้งหน้าที่เรียกให้ patch แถวของตัวเอง — หน้าแชทไม่ต้องดึงรายชื่อใหม่ทั้งก้อน */
  onChanged?: (lead: LeadData) => void;
}

export default function LeadSheet({
  open, contactId, platform, contactName, initialLead, initialStages, initialMembers, embedded = false, onClose, onChanged,
}: Props) {
  const { showToast } = useToast();
  const [stages, setStages] = useState<LeadStage[]>(initialStages?.length ? initialStages : DEFAULT_LEAD_STAGES);
  const [members, setMembers] = useState<LeadMember[]>(initialMembers || []);
  const [lead, setLead] = useState<LeadData | null>(initialLead ?? null);
  /** ขั้นเริ่มต้นเมื่อยังไม่มี lead — ให้ callback อ่านได้โดยไม่ต้องรอค่าที่คำนวณหลัง early return */
  const currentKeyRef = useRef(initialStages?.find(s => s.is_default)?.key || 'new');

  // หน้าแชทส่งค่าล่าสุดมาให้อยู่แล้ว — ยิง API เฉพาะเมื่อยังไม่มีอะไรเลย (เปิดจากที่ที่ไม่ได้โหลดไว้)
  useEffect(() => {
    if (!open || !contactId) return;
    if (initialLead !== undefined && initialStages?.length && initialMembers) return;
    let cancelled = false;
    apiFetch(`/api/leads?contact_id=${contactId}&platform=${platform}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
        setMembers(Array.isArray(data.members) ? data.members : []);
        setLead(data.lead || null);
      })
      .catch(() => { if (!cancelled) showToast('โหลดข้อมูลการติดตามไม่สำเร็จ', 'error'); });
    return () => { cancelled = true; };
  }, [open, contactId, platform, initialLead, initialStages, initialMembers, showToast]);

  /**
   * บันทึกแบบ "จอเปลี่ยนก่อน หลังบ้านตามหลัง" — กดปุ่มแล้วเห็นผลทันที ไม่ต้องรอ round trip
   * (เจ้าของทักว่าค้าง 19 ก.ย. 2026) · ล้มค่อยถอยกลับค่าเดิม + toast แดง
   * ปุ่มไม่ล็อกระหว่างรอ — กดต่อได้ คำขอเรียงตามลำดับที่กดอยู่แล้ว (PATCH ตัวเดียวกัน)
   */
  const save = useCallback(async (patch: Record<string, unknown>, message: string, closeAfter = false) => {
    const before = lead;
    // เดาผลลัพธ์ตามกติกาของ service: เข้าขั้นจบแล้ว = นัดหาย · ออกจากรอโอน = ตัวนับหาย
    const nextStage = typeof patch.stage === 'string' ? patch.stage : before?.stage || currentKeyRef.current;
    const closed = CLOSED_STAGE_KEYS.includes(nextStage);
    const optimistic: LeadData = {
      id: before?.id || '',
      stage: nextStage,
      stage_source: typeof patch.stage === 'string' ? 'manual' : (before?.stage_source || 'manual'),
      stage_changed_at: typeof patch.stage === 'string' ? new Date().toISOString() : (before?.stage_changed_at || new Date().toISOString()),
      follow_up_at: closed ? null : ('follow_up_at' in patch ? (patch.follow_up_at as string | null) : before?.follow_up_at ?? null),
      follow_up_note: 'follow_up_note' in patch ? (patch.follow_up_note as string | null) : before?.follow_up_note ?? null,
      assigned_to: 'assigned_to' in patch ? (patch.assigned_to as string | null) : before?.assigned_to ?? null,
      quote_sent_at: nextStage === 'quoted' ? before?.quote_sent_at ?? null : null,
      reminded_count: nextStage === 'quoted' ? before?.reminded_count ?? 0 : 0,
    };
    setLead(optimistic);
    onChanged?.(optimistic);
    showToast(message);
    if (closeAfter && !embedded) setTimeout(onClose, 300);

    try {
      const res = await apiFetch('/api/leads', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact_id: contactId, platform, ...patch }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      // ค่าจริงจากหลังบ้าน (id ของ lead ที่เพิ่งสร้าง · เวลาจริง) ทับของที่เดาไว้
      setLead(data.lead);
      onChanged?.(data.lead);
    } catch (e) {
      setLead(before);
      if (before) onChanged?.(before);
      showToast(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ — ค่าถูกคืนเป็นของเดิม', 'error');
    }
  }, [lead, contactId, platform, embedded, onChanged, onClose, showToast]);

  if (!open) return null;

  const currentKey = lead?.stage || stages.find(s => s.is_default)?.key || 'new';
  const current = stages.find(s => s.key === currentKey) || stages[0];
  const due = followUpLabel(lead?.follow_up_at);
  const waiting = currentKey === 'quoted' ? waitingDays(lead?.quote_sent_at) : null;
  const presets = followUpPresets();
  const matchesPreset = (iso: string, d: Date) => Math.abs(new Date(iso).getTime() - d.getTime()) < 36e5;
  /** นัดที่ตั้งจากปฏิทินเอง (ไม่ตรงปุ่มไหน) — ให้ช่องปฏิทินเป็นตัวแสดงวันแทน */
  const customPicked = !!lead?.follow_up_at && !presets.some(p => matchesPreset(lead.follow_up_at!, p.date));

  // ป้ายสถานะปัจจุบัน — โมดัลวางไว้ที่หัว · แผงข้างวางเป็นบรรทัดแรกของเนื้อ
  const stageBadge = (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded flex-shrink-0 inline-flex items-center gap-1 ${STAGE_CHIP_CLASS[current?.color || 'gray']}`}>
      <LeadStageIcon stageKey={currentKey} className="w-3.5 h-3.5" />
      {current?.name || currentKey}
    </span>
  );
  const sourceHint = lead?.stage_source === 'system'
    ? <span className="text-[11px] font-normal text-gray-400 flex-shrink-0">ระบบติดให้</span>
    : null;

  const body = (
    <>
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
            onRemove={() => save({ follow_up_at: null }, 'ยกเลิกนัดแล้ว')}
            removeLabel="ยกเลิกนัด"
          >
            {formatShortThaiDate(lead.follow_up_at)} {FOLLOW_UP_HOUR}:00
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5">
        {presets.map(p => {
          const picked = !!lead?.follow_up_at && matchesPreset(lead.follow_up_at, p.date);
          return (
            <Button
              key={p.key}
              size="sm"
              fullWidth
              variant={picked ? 'primary' : 'secondary'}
              title={formatShortThaiDate(p.date)}
              onClick={() => save({ follow_up_at: p.date.toISOString() }, `ทักอีกที ${formatShortThaiDate(p.date)}`, true)}
            >
              {p.label}
              <span className="opacity-60 ml-1">{formatShortThaiDate(p.date).replace(/^\S+\s/, '')}</span>
            </Button>
          );
        })}

        {/* เลือกวันเอง — ช่องสุดท้ายในตารางเดียวกัน ขนาดเท่าปุ่ม (size sm) กดแล้วค่อยเป็นปฏิทิน
            แสดงวันที่ในช่องเฉพาะเมื่อนัดปัจจุบันไม่ตรงกับปุ่มไหนเลย (ตรงปุ่ม = ปุ่มนั้นไฮไลต์อยู่แล้ว) */}
        <DateRangePicker
          asSingle
          useRange={false}
          size="sm"
          portal
          minDate={new Date()}
          placeholder="เลือกวัน"
          displayFormat="d MMM"
          value={customPicked ? { startDate: lead!.follow_up_at, endDate: lead!.follow_up_at } : null}
          onChange={(v: DateValueType) => {
            const raw = v?.startDate;
            if (!raw) return;
            const d = new Date(raw);
            d.setHours(FOLLOW_UP_HOUR, 0, 0, 0);
            save({ follow_up_at: d.toISOString() }, `ทักอีกที ${formatShortThaiDate(d)}`, true);
          }}
        />
      </div>

      <div className="mt-3.5">
        <FormSelect
          value={lead?.assigned_to || ''}
          onChange={v => save({ assigned_to: v || null }, v ? 'มอบหมายแล้ว' : 'ปลดผู้รับผิดชอบแล้ว')}
          options={members.map(m => ({ id: m.id, label: m.name }))}
          clearLabel="ไม่ระบุ"
          placeholder="ผู้รับผิดชอบ"
          icon={<MemberIcon className="w-4 h-4" />}
          portal
        />
      </div>
    </>
  );

  if (embedded) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm text-gray-500 dark:text-slate-400">ตอนนี้</span>
          {stageBadge}
          {sourceHint}
        </div>
        {body}
      </div>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={
        <span className="flex items-center gap-2 min-w-0">
          <span className="truncate">{contactName}</span>
          {stageBadge}
          {sourceHint}
        </span>
      }
    >
      {body}
    </Modal>
  );
}
