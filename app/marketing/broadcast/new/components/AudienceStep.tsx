// Path: app/marketing/broadcast/new/components/AudienceStep.tsx
//
// การ์ด "กลุ่มเป้าหมาย" ของขั้นที่ 1 — เลือกกลุ่ม (ซ้าย) แล้วกรอกของที่กลุ่มนั้นต้องใช้ (ขวา)
//
// เดิมเป็นโมดัลที่เดินสามขั้น — ผู้ใช้ต้องเปิด/ปิดเพื่อดูว่าตัวเองเลือกอะไรไว้ และจำนวนคน
// ของแต่ละกลุ่มไม่เคยเห็นพร้อมกันเลย · ตอนนี้กางอยู่ในหน้า เทียบจำนวนได้ทันทีว่ากลุ่มไหนใหญ่แค่ไหน
'use client';

import { useState } from 'react';
import NumberInput from '@/components/ui/NumberInput';
import Radio from '@/components/ui/Radio';
import Alert from '@/components/ui/Alert';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import FilterChips, { FILTER_CHIP_PRIMARY_ACTIVE } from '@/components/ui/FilterChips';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import Tooltip from '@/components/ui/Tooltip';
import EntitySearchInput, { type EntitySearchOption } from '@/components/ui/EntitySearchInput';
import {
  AUDIENCE_GROUPS,
  hasAudienceRefine,
  type AudienceOption,
} from '@/lib/broadcast/audience';
import { Tag } from 'lucide-react';
import type { AudienceCounts, PickedContact, TagRow } from './types';

const DAY_PRESETS = [30, 60, 90, 180];
const MIN_MESSAGE_PRESETS = [0, 3, 5, 10];
const LAST_CHAT_PRESETS = [0, 30, 90, 180];

interface Props {
  options: AudienceOption[];
  /**
   * ตัวเลือกที่เลือกไม่ได้ในบริบทนี้ → key → เหตุผล (โชว์เป็น tooltip บนแถวที่จาง)
   * ⛔ **ห้ามซ่อนตัวที่เลือกไม่ได้** — ผู้ใช้จะถามซ้ำว่ากลุ่มนั้นหายไปไหน
   */
  disabledOptions?: Record<string, string>;
  audience: string;
  onAudienceChange: (key: string) => void;

  /** จำนวนคนต่อกลุ่ม — null = ยังตอบไม่ได้ (เลือกหลายบัญชี / ปลายทางยังไม่พร้อม) */
  counts: AudienceCounts | null;
  countsLoading: boolean;
  /** เลือกหลายบัญชี = รายชื่อคนละชุด รวมยอดแล้วอ่านผิด → โชว์ '—' */
  countsUnavailable: boolean;
  contactTotal: number | null;
  contactLinked: number | null;

  days: number;
  onDaysChange: (n: number) => void;

  tags: TagRow[];
  tagIds: string[];
  onTagIdsChange: (ids: string[]) => void;

  contactResults: EntitySearchOption[];
  contactLoading: boolean;
  onContactSearch: (q: string) => void;
  pickedContacts: PickedContact[];
  onPickedContactsChange: (list: PickedContact[]) => void;
  /** เลือกไว้หลายบัญชี — ช่องค้นผู้ติดต่อค้นได้จากใบแรกเท่านั้น ต้องบอกให้รู้ */
  multiAccount: boolean;

  minMessages: number;
  onMinMessagesChange: (n: number) => void;
  lastChatDays: number;
  onLastChatDaysChange: (n: number) => void;

  disabled?: boolean;
}

export default function AudienceStep({
  options, disabledOptions, audience, onAudienceChange,
  counts, countsLoading, countsUnavailable, contactTotal, contactLinked,
  days, onDaysChange,
  tags, tagIds, onTagIdsChange,
  contactResults, contactLoading, onContactSearch, pickedContacts, onPickedContactsChange, multiAccount,
  minMessages, onMinMessagesChange, lastChatDays, onLastChatDaysChange,
  disabled,
}: Props) {
  const selected = options.find(o => o.key === audience) || null;
  const namedContacts = pickedContacts.filter(c => c.name);
  const unnamedCount = pickedContacts.length - namedContacts.length;

  /**
   * จำนวนคนของกลุ่มหนึ่ง — ตอบไม่ได้ = `null` (ไม่แสดงอะไรเลย) **ห้ามเดาเป็น 0**
   *
   * เดิมตอบไม่ได้ขึ้น '—' ทุกแถว แต่ในหน้ากลุ่มเป้าหมายแทบทุกครั้งเลือกหลายแหล่ง (นับรายกลุ่ม
   * ไม่ได้) จึงเห็นขีดเรียงทั้งคอลัมน์โดยไม่รู้ว่าคืออะไร ทั้งที่แผงขวามีตัวเลขจริงอยู่แล้ว
   * (เจ้าของท้วง 11 ก.ย. 2026) · ตัวเลขยังขึ้นตามเดิมเมื่อนับได้ (เลือกช่องทางเดียว)
   */
  const countOf = (key: string): string | null => {
    if (disabledOptions?.[key]) return null;
    if (countsUnavailable) return null;
    if (countsLoading && !counts) return null;
    const n = counts?.counts?.[key];
    return typeof n === 'number' ? n.toLocaleString() : null;
  };

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="heading-4">กลุ่มเป้าหมาย</h2>
        {/* เพดานความรู้ของระบบ — ไม่บอกไว้ ผู้ใช้จะอ่านว่าลูกค้าเก่าตัวเองไม่มีใครเคยซื้อ */}
        {contactTotal != null && contactLinked != null && (
          <span className="section-desc text-right">
            รู้ประวัติการซื้อของ {contactLinked.toLocaleString()} จาก {contactTotal.toLocaleString()} คนที่เคยทักมา
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-4">
        {/* ── ซ้าย: ตัวเลือกทั้งหมด แบ่งตามเป้าหมายการตลาด ── */}
        <div className="space-y-3">
          {AUDIENCE_GROUPS.map(g => {
            const inGroup = options.filter(o => o.group === g.key);
            if (inGroup.length === 0) return null;
            return (
              <div key={g.key}>
                <p className="field-label">{g.label}</p>
                {/* flex+gap (ไม่ใช่ space-y) เพราะแถวที่มีเหตุผลถูกห่อด้วย Tooltip ซึ่งเป็น
                    display:contents — margin ของ space-y จะไม่มีผลกับมัน แล้วระยะจะหลุดเฉพาะแถวนั้น */}
                <div className="flex flex-col gap-1">
                  {inGroup.map(opt => {
                    const active = opt.key === audience;
                    const reason = disabledOptions?.[opt.key];
                    const row = (
                      <Radio
                        key={opt.key}
                        checked={active}
                        onChange={() => onAudienceChange(opt.key)}
                        disabled={disabled || !!reason}
                        className={`choice-card px-2.5 py-2 ${active ? 'choice-card-active' : ''}`}
                      >
                        <span className="flex-1 min-w-0 flex items-baseline gap-2">
                          <span className="body-text">
                            {opt.label.replace('N วัน', `${days} วัน`)}
                          </span>
                          {countOf(opt.key) != null && (
                            <span className="ml-auto subtitle-text tabular-nums">
                              {countOf(opt.key)}
                            </span>
                          )}
                        </span>
                      </Radio>
                    );
                    return reason
                      ? <Tooltip key={opt.key} text={reason}>{row}</Tooltip>
                      : row;
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── ขวา: รายละเอียดของตัวเลือกที่เลือก ── */}
        <div className="md:border-l md:border-gray-100 md:dark:border-slate-700 md:pl-4">
          {!selected ? (
            <p className="subtitle-text">เลือกกลุ่มทางซ้ายก่อน</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="body-text font-medium">
                  {selected.label.replace('N วัน', `${days} วัน`)}
                </p>
                {selected.hint && (
                  <p className="subtitle-text mt-0.5">{selected.hint}</p>
                )}
              </div>

              {selected.needsDays && (
                <RefineRow
                  label="นับย้อนหลัง"
                  unit="วัน"
                  presets={DAY_PRESETS}
                  presetLabel={n => `${n} วัน`}
                  min={1}
                  max={3650}
                  value={days}
                  onChange={onDaysChange}
                  disabled={disabled}
                />
              )}

              {selected.needsTags && (
                <MultiSelectSearch
                  value={tagIds}
                  onChange={onTagIdsChange}
                  disabled={disabled}
                  options={tags.map(t => ({ id: t.id, label: t.name }))}
                  emptyLabel="เลือกแท็ก..."
                  icon={<Tag className="w-4 h-4" />}
                />
              )}

              {selected.needsPick && (
                <div>
                  <EntitySearchInput
                    value=""
                    options={contactResults}
                    loading={contactLoading}
                    onSearchChange={onContactSearch}
                    minSearchLength={2}
                    placeholder="พิมพ์ชื่อผู้ติดต่อเพื่อเพิ่ม"
                    emptyMessage="ไม่พบผู้ติดต่อที่ตรงกับคำค้น"
                    onChange={(id, o) => {
                      if (pickedContacts.some(c => c.id === id)) return;
                      onPickedContactsChange([...pickedContacts, { id, name: o.label }]);
                    }}
                  />
                  {(namedContacts.length > 0 || unnamedCount > 0) && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {namedContacts.map(c => (
                        <li key={c.id}>
                          <Badge
                            tone="gray"
                            size="sm"
                            onRemove={() => onPickedContactsChange(pickedContacts.filter(x => x.id !== c.id))}
                            removeLabel={`เอา ${c.name} ออก`}
                          >
                            {c.name}
                          </Badge>
                        </li>
                      ))}
                      {/* คัดลอกใบเก่ามาจะรู้แค่ id — บอกจำนวนไว้ก่อน ดีกว่าโชว์รหัสยาว ๆ ที่อ่านไม่ออก */}
                      {unnamedCount > 0 && (
                        <li>
                          <Badge
                            tone="gray"
                            size="sm"
                            onRemove={() => onPickedContactsChange(namedContacts)}
                            removeLabel="เอาผู้ติดต่อที่คัดลอกมาออก"
                          >
                            เลือกไว้ {unnamedCount.toLocaleString()} คน
                          </Badge>
                        </li>
                      )}
                    </ul>
                  )}
                  {multiAccount && (
                    <p className="subtitle-text text-amber-700 dark:text-amber-500 mt-1.5">
                      ค้นจากบัญชีแรกที่เลือกเท่านั้น — เลือกรายคนควรติ๊กบัญชีเดียว
                    </p>
                  )}
                </div>
              )}

              {audience === 'all' && (
                <Alert tone="info">
                  ยิงถึงทุกคนที่แอดเพื่อนไว้ รวมคนที่ไม่เคยทักมาเลย — กลุ่มใหญ่สุดและกินโควตามากสุด ·
                  คนที่ไม่เคยทักเราไม่มีรายชื่อ จึงกรองเพิ่มไม่ได้และบันทึกลงห้องแชทไม่ได้
                </Alert>
              )}

              {/* ── กรองให้แคบลงอีก — มีเฉพาะกลุ่มที่มีรายชื่อจริงให้กรอง ── */}
              {hasAudienceRefine(audience) && (
                <div className="pt-4 border-t border-gray-100 dark:border-slate-700 space-y-3">
                  <div>
                    <p className="body-text font-medium">กรองให้แคบลงอีก</p>
                    <p className="section-desc">
                      ตัดคนที่ทักมาคำเดียวแล้วหาย และคนที่เงียบไปนานออก · นับเฉพาะข้อความที่ลูกค้าพิมพ์มา
                      ไม่นับที่แอดมินตอบหรือบรอดแคสต์ที่เราส่งไป
                    </p>
                  </div>

                  {/* สองเกณฑ์นี้เลือกจากชิปอย่างเดียว ไม่มี "ระบุเอง" · ค่า 0 เรียกว่า "ตลอด"
                      (เจ้าของกำหนด 11 ก.ย. 2026) — ใช้ร่วมทั้งหน้าบรอดแคสต์และกลุ่มเป้าหมาย */}
                  <RefineRow
                    label="ลูกค้าพิมพ์ข้อความหาเรา"
                    unit="ข้อความ"
                    presets={MIN_MESSAGE_PRESETS}
                    presetLabel={n => (n === 0 ? 'ตลอด' : `≥${n}`)}
                    max={999}
                    allowCustom={false}
                    value={minMessages}
                    onChange={onMinMessagesChange}
                    disabled={disabled}
                  />
                  <RefineRow
                    label="ลูกค้าพิมพ์หาเราล่าสุดภายใน"
                    unit="วัน"
                    presets={LAST_CHAT_PRESETS}
                    presetLabel={n => (n === 0 ? 'ตลอด' : `${n} วัน`)}
                    max={3650}
                    allowCustom={false}
                    value={lastChatDays}
                    onChange={onLastChatDaysChange}
                    disabled={disabled}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/** แถวกรองหนึ่งเกณฑ์ — ชิปค่าที่ใช้บ่อย + (เมื่อ `allowCustom`) "ระบุเอง" ที่กางช่องกรอกตัวเลขออกมา */
function RefineRow({
  label, unit, presets, presetLabel, min = 0, max, value, onChange, disabled, allowCustom = true,
}: {
  label: string;
  unit: string;
  presets: number[];
  presetLabel: (n: number) => string;
  /** ค่าต่ำสุดที่กรอกได้ — ตัวกรอง 0 = ไม่กรอง · จำนวนวันต้อง ≥1 */
  min?: number;
  max: number;
  value: number;
  onChange: (n: number) => void;
  disabled?: boolean;
  /** มีชิป "ระบุเอง" ไหม — `false` = เลือกจากชิปอย่างเดียว */
  allowCustom?: boolean;
}) {
  // กางช่องกรอกเมื่อผู้ใช้กด "ระบุเอง" (ค้างไว้แม้ค่าจะบังเอิญตรงชิปพอดี) หรือเมื่อค่าที่มา
  // จากภายนอก (คัดลอกใบเก่ามา) ไม่ตรงชิปไหนเลย — ไม่งั้นจะไม่มีที่ให้เห็นว่าตั้งไว้เท่าไหร่
  const [customChosen, setCustomChosen] = useState(false);
  const inPresets = presets.includes(value);
  const custom = allowCustom && (customChosen || !inPresets);
  // ไม่มี "ระบุเอง" แต่ค่าที่ติดมากับใบเก่าไม่ตรงชิปไหน (เช่นเคยตั้ง ≥7 ไว้) — เติมเป็นชิปของมันเอง
  // ให้เห็นว่าตั้งไว้เท่าไหร่ · **ห้ามปัดไปชิปใกล้สุดเงียบ ๆ** ไม่งั้นได้กลุ่มคนละขนาดโดยไม่รู้ตัว
  const chipValues = allowCustom || inPresets ? presets : [...presets, value].sort((a, b) => a - b);

  return (
    <div>
      <p className="field-label mb-1">{label}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <FilterChips
          value={custom ? 'custom' : String(value)}
          onChange={v => {
            if (v === 'custom') { setCustomChosen(true); return; }
            setCustomChosen(false);
            onChange(Number(v));
          }}
          disabled={disabled}
          chips={[
            ...chipValues.map(n => ({ id: String(n), label: presetLabel(n), activeClass: FILTER_CHIP_PRIMARY_ACTIVE })),
            ...(allowCustom ? [{ id: 'custom', label: 'ระบุเอง', activeClass: FILTER_CHIP_PRIMARY_ACTIVE }] : []),
          ]}
        />
        {custom && (
          <>
            <div className="w-24">
              <NumberInput
                value={value}
                disabled={disabled}
                onChange={v => onChange(Math.max(min, Math.min(max, v || min)))}
              />
            </div>
            <span className="body-text text-gray-500 dark:text-slate-400">{unit}</span>
          </>
        )}
      </div>
    </div>
  );
}
