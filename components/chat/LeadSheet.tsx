'use client';

// Path: components/chat/LeadSheet.tsx
//
// แผ่นติดตามลูกค้า — สถานะในกรวยขาย + นัดทักอีกครั้ง ของ "คน" หนึ่งคน
//
// เปิดจากรูปโปรไฟล์ (หัวห้องแชท · รายชื่อ) — **จอเล็กเลื่อนขึ้นจากล่าง** (นิ้วโป้งเอื้อมถึง
// ปัดลงปิดได้) จอใหญ่เป็นกล่องกลางจอ · ทุกปุ่มบันทึกทันทีเมื่อแตะ **ไม่มีปุ่มบันทึก**
// (ของเดิมที่ต้องกดบันทึกทีหลัง คนกดสถานะแล้วปิดจอไปเลย ค่าไม่เคยถูกเขียน)
//
// ⚠️ ห้ามแยกเป็นแผ่นของ "ห้องแชท" — นัดผูกกับคน (lead) คนเดียวทักหลายช่องทางต้องได้นัดเดียว

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import FormSelect from '@/components/ui/FormSelect';
import { CloseIcon, TimeIcon, CalendarIcon, ConfirmIcon } from '@/lib/icons';
import {
  DEFAULT_LEAD_STAGES, STAGE_ACTIVE_CLASS, STAGE_CHIP_CLASS,
  type LeadStage,
} from '@/lib/leads/stages';
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
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !contactId) return;
    let cancelled = false;
    setLoading(true);
    apiFetch(`/api/leads?contact_id=${contactId}&platform=${platform}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (Array.isArray(data.stages) && data.stages.length > 0) setStages(data.stages);
        setMembers(Array.isArray(data.members) ? data.members : []);
        setLead(data.lead || null);
        setNote(data.lead?.follow_up_note || '');
      })
      .catch(() => { if (!cancelled) showToast('โหลดข้อมูลการติดตามไม่สำเร็จ', 'error'); })
      .finally(() => { if (!cancelled) setLoading(false); });
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
      if (closeAfter) setTimeout(onClose, 350);
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
  const stageSource = lead?.stage_source === 'system'
    ? 'ระบบติดให้เอง'
    : lead ? `แก้ล่าสุด ${formatShortThaiDate(lead.stage_changed_at)}` : 'ยังไม่เคยติดตาม';

  return (
    <div className="fixed inset-0 z-[999] flex items-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`ติดตาม ${contactName}`}
        className="relative w-full md:w-[520px] max-h-[90vh] overflow-y-auto bg-white dark:bg-slate-800 rounded-t-2xl md:rounded-2xl shadow-xl p-4 pb-6"
      >
        <div className="md:hidden w-10 h-1 rounded-full bg-gray-300 dark:bg-slate-600 mx-auto mb-3" />

        <div className="flex items-start gap-3 mb-2">
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-gray-900 dark:text-white truncate">{contactName}</h3>
            <p className="text-xs text-gray-500 dark:text-slate-400">ติดตามลูกค้า · นัดผูกกับคน ไม่ใช่ห้องแชท</p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-slate-200">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* แถบ "ตอนนี้" — ต้องเห็นแว่บเดียวว่าติดอะไรอยู่ และใครเป็นคนติด */}
        <div className={`rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 ${STAGE_CHIP_CLASS[current?.color || 'gray']}`}>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wide opacity-80">ตอนนี้</div>
            <div className="font-semibold truncate">{current?.name || currentKey}</div>
          </div>
          <div className="text-xs text-right opacity-90 flex-shrink-0">{stageSource}</div>
        </div>

        {/* รอโอนมากี่วันแล้ว — ตัวนับเริ่มตอนส่งลิงก์บิลในแชท */}
        {waiting !== null && (
          <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5">
            <div className="text-xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">รอโอนมา {waiting} วัน</div>
            <div className="text-xs text-amber-700/80 dark:text-amber-200/80 mt-0.5">
              ทวงไปแล้ว {lead?.reminded_count || 0} ครั้ง · ลูกค้าโอนเมื่อไหร่ตัวนับหยุดเอง
            </div>
          </div>
        )}

        <div className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">เปลี่ยนเป็น</div>
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {stages.map(s => {
            const active = s.key === currentKey;
            return (
              <button
                key={s.key}
                disabled={saving}
                onClick={() => save({ stage: s.key }, `เปลี่ยนเป็น “${s.name}”`)}
                aria-pressed={active}
                className={`rounded-lg border px-2 py-2 leading-tight transition-colors disabled:opacity-60 ${
                  active
                    ? `border-2 ring-2 font-bold ${STAGE_ACTIVE_CLASS[s.color]}`
                    : 'border-gray-200 dark:border-slate-600 text-gray-700 dark:text-slate-200 hover:border-primary'
                }`}
              >
                {s.name}
                {active ? (
                  <span className="block text-[10px] font-semibold mt-0.5 flex items-center justify-center gap-0.5">
                    <ConfirmIcon className="w-3 h-3" /> ตอนนี้
                  </span>
                ) : s.auto_managed ? (
                  <span className="block text-[10px] opacity-70 mt-0.5">อัตโนมัติ</span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 mb-2 text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold">ทักอีกทีเมื่อ</div>
        <div className="flex flex-wrap gap-2">
          {followUpPresets().map(p => (
            <button
              key={p.key}
              disabled={saving}
              onClick={() => save({ follow_up_at: p.date.toISOString() }, `ทักอีกที ${formatShortThaiDate(p.date)} ${FOLLOW_UP_HOUR}:00 น.`, true)}
              className="rounded-full border border-gray-200 dark:border-slate-600 px-3 py-2 hover:border-primary disabled:opacity-60 text-gray-700 dark:text-slate-200"
            >
              <span className="font-medium">{p.label}</span>
              <span className="text-xs text-gray-400 dark:text-slate-400 ml-1.5">{formatShortThaiDate(p.date)}</span>
            </button>
          ))}
        </div>

        <div className="mt-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1.5">
            เลือกวันเอง
          </label>
          <input
            type="date"
            disabled={saving}
            className="form-input w-full"
            onChange={e => {
              if (!e.target.value) return;
              const d = new Date(`${e.target.value}T${String(FOLLOW_UP_HOUR).padStart(2, '0')}:00:00`);
              save({ follow_up_at: d.toISOString() }, `ทักอีกที ${formatShortThaiDate(d)} ${FOLLOW_UP_HOUR}:00 น.`, true);
            }}
          />
        </div>

        <div className="mt-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1.5">โน้ตสั้น</label>
          <input
            className="form-input w-full"
            placeholder="เช่น รอเงินเดือนออก / รอรูปจากลูกค้า"
            value={note}
            disabled={saving}
            onChange={e => setNote(e.target.value)}
            onBlur={() => { if ((lead?.follow_up_note || '') !== note) save({ follow_up_note: note }, 'บันทึกโน้ตแล้ว'); }}
          />
        </div>

        <div className="mt-3">
          <label className="block text-[11px] uppercase tracking-wide text-gray-500 dark:text-slate-400 font-semibold mb-1.5">ผู้รับผิดชอบ</label>
          <FormSelect
            value={lead?.assigned_to || ''}
            onChange={v => save({ assigned_to: v || null }, v ? 'มอบหมายแล้ว' : 'ปลดผู้รับผิดชอบแล้ว')}
            options={members.map(m => ({ id: m.id, label: m.name }))}
            clearLabel="ไม่ระบุ — ทีมเห็นทุกคน"
            placeholder="ไม่ระบุ — ทีมเห็นทุกคน"
            portal
            disabled={saving}
          />
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-1">เลือกได้เฉพาะคนที่ตอบแชทได้</p>
        </div>

        {/* นัดที่ถืออยู่ตอนนี้ */}
        <div className={`mt-4 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3 text-sm ${
          due
            ? due.overdue
              ? 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300'
            : 'bg-gray-50 text-gray-500 dark:bg-slate-700/50 dark:text-slate-300'
        }`}>
          <span className="flex items-center gap-1.5 min-w-0">
            {due ? <TimeIcon className="w-4 h-4 flex-shrink-0" /> : <CalendarIcon className="w-4 h-4 flex-shrink-0" />}
            <span className="truncate">
              {lead?.follow_up_at
                ? `นัดไว้ ${formatShortThaiDate(lead.follow_up_at)} ${FOLLOW_UP_HOUR}:00 น.${due?.overdue ? ` · ${due.text}` : ''}`
                : 'ยังไม่มีนัด — แตะปุ่มวันด้านบนเพื่อตั้ง'}
            </span>
          </span>
          {lead?.follow_up_at && (
            <button
              disabled={saving}
              onClick={() => save({ follow_up_at: null }, 'ยกเลิกนัดแล้ว')}
              className="underline flex-shrink-0 disabled:opacity-60"
            >
              ยกเลิกนัด
            </button>
          )}
        </div>

        {loading && <p className="text-xs text-gray-400 mt-2">กำลังโหลด…</p>}
      </div>
    </div>
  );
}
