// Path: app/settings/delivery/page.tsx
// ตั้งค่าการจัดส่ง — จุดส่ง (delivery_zones) + ช่วงเวลาส่ง (delivery_slots)
// Zone = พื้นที่รับส่ง + ค่าส่ง (fixed / Lalamove quote) + ต้องสั่งล่วงหน้า
// Slot = รอบเวลา 2-3 ชม. (ห้ามเป็นเวลาเป๊ะ) + วัน + capacity + cutoff
'use client';

import { useState, useCallback, useEffect } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Tabs from '@/components/ui/Tabs';
import Toggle from '@/components/ui/Toggle';
import Checkbox from '@/components/ui/Checkbox';
import FormInput from '@/components/ui/FormInput';
import FormSelect from '@/components/ui/FormSelect';
import TimePicker from '@/components/ui/TimePicker';
import PostfixInput from '@/components/ui/PostfixInput';
import MultiSelectSearch from '@/components/ui/MultiSelectSearch';
import ListRow from '@/components/ui/ListRow';
import { LoadingCard, EmptyCard, NoPermissionCard } from '@/components/ui/StateCard';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { useToast } from '@/lib/toast-context';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useFeatures } from '@/lib/features-context';
import { useFetchOnce } from '@/lib/use-fetch-once';
import { apiFetch } from '@/lib/api-client';
import { useFormValidation } from '@/lib/useFormValidation';
import { PROVINCES } from '@/lib/thai-address-data';
import {
  type DeliveryZone, type DeliverySlot,
  formatSlotTime, formatDays, DAY_LABELS,
} from '@/lib/delivery';
import { MapPin, Clock, Pencil, Trash2, Bike } from 'lucide-react';

type TabKey = 'zones' | 'slots';

const EMPTY_ZONE_FORM = {
  id: '', name: '', provinces: [] as string[], districts: '', postcodes: '',
  fee_type: 'fixed' as 'fixed' | 'lalamove', fee: '0', free_over: '', lead_minutes: '0',
  slot_ids: [] as string[], is_active: true,
};
const EMPTY_SLOT_FORM = {
  id: '', name: '', start_time: '09:00', end_time: '12:00',
  days: [0, 1, 2, 3, 4, 5, 6] as number[], capacity: '', cutoff_minutes: '120', is_active: true,
};

export default function DeliverySettingsPage() {
  const { allowed, loading: guardLoading } = useAuthGuard('masterdata.delivery', { noRedirect: true });
  // แต่ละส่วนเปิด/ปิดอิสระที่ Feature เสริม — หน้านี้ต้องซ่อนตาม ไม่งั้นผู้ใช้
  // ตั้งค่าส่วนที่ปิดอยู่ได้ แล้วงงว่าทำไมไม่มีผลตอนเปิดบิล
  const { features } = useFeatures();
  const zonesOn = features.delivery_zone;
  const slotsOn = features.delivery_slot;
  const { showToast } = useToast();
  const { confirm, confirmDialog } = useConfirmDialog();

  const [tab, setTab] = useState<TabKey>('zones');

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);

  const [zoneModal, setZoneModal] = useState(false);
  const [zoneForm, setZoneForm] = useState(EMPTY_ZONE_FORM);
  const [slotModal, setSlotModal] = useState(false);
  const [slotForm, setSlotForm] = useState(EMPTY_SLOT_FORM);
  const form = useFormValidation();

  // ถ้าแท็บที่เปิดอยู่ถูกปิดที่ Feature เสริม ให้เด้งไปแท็บที่ยังเปิดอยู่
  useEffect(() => {
    if (tab === 'zones' && !zonesOn && slotsOn) setTab('slots');
    if (tab === 'slots' && !slotsOn && zonesOn) setTab('zones');
  }, [tab, zonesOn, slotsOn]);

  // เปิดตัวเดียว = แสดงตัวนั้นเลย ไม่ต้องรอให้ tab state ตรง
  const showZones = zonesOn && (!slotsOn || tab === 'zones');
  const showSlots = slotsOn && !showZones;

  const fetchAll = useCallback(async () => {
    try {
      const [zRes, sRes] = await Promise.all([
        zonesOn ? apiFetch('/api/delivery-zones') : null,
        slotsOn ? apiFetch('/api/delivery-slots') : null,
      ]);
      if (zRes?.ok) setZones((await zRes.json()).zones || []);
      if (sRes?.ok) setSlots((await sRes.json()).slots || []);
    } finally {
      setLoading(false);
    }
  }, [zonesOn, slotsOn]);
  useFetchOnce(fetchAll, allowed);

  // ── Zone helpers ──────────────────────────────────────────────────
  const openZoneCreate = () => { setZoneForm(EMPTY_ZONE_FORM); setZoneModal(true); };
  const openZoneEdit = (z: DeliveryZone) => {
    setZoneForm({
      id: z.id, name: z.name, provinces: z.provinces,
      districts: z.districts.join(', '), postcodes: z.postcodes.join(', '),
      fee_type: z.fee_type, fee: String(z.fee ?? 0),
      free_over: z.free_over != null ? String(z.free_over) : '',
      lead_minutes: String(z.lead_minutes ?? 0),
      slot_ids: z.slot_ids || [], is_active: z.is_active,
    });
    setZoneModal(true);
  };

  const saveZone = async () => {
    if (!form.validateAll()) return;
    setSaving(true);
    try {
      const payload = {
        ...(zoneForm.id ? { id: zoneForm.id } : {}),
        name: zoneForm.name,
        provinces: zoneForm.provinces,
        districts: zoneForm.districts.split(',').map(s => s.trim()).filter(Boolean),
        postcodes: zoneForm.postcodes.split(',').map(s => s.trim()).filter(Boolean),
        fee_type: zoneForm.fee_type,
        fee: Number(zoneForm.fee) || 0,
        free_over: zoneForm.free_over ? Number(zoneForm.free_over) : null,
        lead_minutes: Number(zoneForm.lead_minutes) || 0,
        slot_ids: zoneForm.slot_ids,
        is_active: zoneForm.is_active,
      };
      const res = await apiFetch('/api/delivery-zones', {
        method: zoneForm.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'บันทึกไม่สำเร็จ', 'error'); return; }
      showToast('บันทึกจุดส่งแล้ว', 'success');
      setZoneModal(false);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const deleteZone = async (z: DeliveryZone) => {
    const ok = await confirm({
      title: 'ลบจุดส่ง',
      description: `ต้องการลบ "${z.name}" หรือไม่? ออเดอร์เก่าที่เคยใช้จุดส่งนี้จะยังแสดงข้อมูลเดิม`,
      confirmLabel: 'ลบ', variant: 'danger',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/delivery-zones?id=${z.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'ลบไม่สำเร็จ', 'error'); return; }
    showToast(data.soft ? 'มีออเดอร์ใช้จุดส่งนี้อยู่ — ปิดการใช้งานแทน' : 'ลบจุดส่งแล้ว', 'success');
    await fetchAll();
  };

  const toggleZone = async (z: DeliveryZone, next: boolean) => {
    setZones(prev => prev.map(x => x.id === z.id ? { ...x, is_active: next } : x));
    const res = await apiFetch('/api/delivery-zones', {
      method: 'PUT', body: JSON.stringify({ id: z.id, is_active: next }),
    });
    if (!res.ok) {
      setZones(prev => prev.map(x => x.id === z.id ? { ...x, is_active: !next } : x));
      showToast('บันทึกไม่สำเร็จ', 'error');
    }
  };

  // ลำดับ = ลำดับการจับคู่โซน (ตัวแรกที่ match ชนะ) — โซนแคบต้องอยู่บนโซนกว้าง
  const moveZone = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= zones.length) return;
    const next = [...zones];
    [next[index], next[target]] = [next[target], next[index]];
    setZones(next);
    setReordering(true);
    try {
      await Promise.all(next.map((z, i) =>
        z.sort_order !== i
          ? apiFetch('/api/delivery-zones', { method: 'PUT', body: JSON.stringify({ id: z.id, sort_order: i }) })
          : Promise.resolve(null)
      ));
      setZones(next.map((z, i) => ({ ...z, sort_order: i })));
    } finally {
      setReordering(false);
    }
  };

  // ── Slot helpers ──────────────────────────────────────────────────
  const openSlotCreate = () => { setSlotForm(EMPTY_SLOT_FORM); setSlotModal(true); };
  const openSlotEdit = (s: DeliverySlot) => {
    setSlotForm({
      id: s.id, name: s.name,
      start_time: formatSlotTime(s.start_time), end_time: formatSlotTime(s.end_time),
      days: s.days_of_week, capacity: s.capacity != null ? String(s.capacity) : '',
      cutoff_minutes: String(s.cutoff_minutes ?? 0), is_active: s.is_active,
    });
    setSlotModal(true);
  };

  const saveSlot = async () => {
    if (!form.validateAll()) return;
    if (slotForm.end_time <= slotForm.start_time) {
      showToast('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่ม', 'error');
      return;
    }
    if (slotForm.days.length === 0) {
      showToast('เลือกวันอย่างน้อย 1 วัน', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...(slotForm.id ? { id: slotForm.id } : {}),
        name: slotForm.name,
        start_time: slotForm.start_time,
        end_time: slotForm.end_time,
        days_of_week: slotForm.days,
        capacity: slotForm.capacity ? Number(slotForm.capacity) : null,
        cutoff_minutes: 0,
        is_active: slotForm.is_active,
      };
      const res = await apiFetch('/api/delivery-slots', {
        method: slotForm.id ? 'PUT' : 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'บันทึกไม่สำเร็จ', 'error'); return; }
      showToast('บันทึกช่วงเวลาส่งแล้ว', 'success');
      setSlotModal(false);
      await fetchAll();
    } finally {
      setSaving(false);
    }
  };

  const deleteSlot = async (s: DeliverySlot) => {
    const ok = await confirm({
      title: 'ลบช่วงเวลาส่ง',
      description: `ต้องการลบ "${s.name} (${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)})" หรือไม่?`,
      confirmLabel: 'ลบ', variant: 'danger',
    });
    if (!ok) return;
    const res = await apiFetch(`/api/delivery-slots?id=${s.id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'ลบไม่สำเร็จ', 'error'); return; }
    showToast(data.soft ? 'มีออเดอร์ใช้รอบนี้อยู่ — ปิดการใช้งานแทน' : 'ลบช่วงเวลาส่งแล้ว', 'success');
    await fetchAll();
  };

  const toggleSlot = async (s: DeliverySlot, next: boolean) => {
    setSlots(prev => prev.map(x => x.id === s.id ? { ...x, is_active: next } : x));
    const res = await apiFetch('/api/delivery-slots', {
      method: 'PUT', body: JSON.stringify({ id: s.id, is_active: next }),
    });
    if (!res.ok) {
      setSlots(prev => prev.map(x => x.id === s.id ? { ...x, is_active: !next } : x));
      showToast('บันทึกไม่สำเร็จ', 'error');
    }
  };

  const moveSlot = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    [next[index], next[target]] = [next[target], next[index]];
    setSlots(next);
    setReordering(true);
    try {
      await Promise.all(next.map((s, i) =>
        s.sort_order !== i
          ? apiFetch('/api/delivery-slots', { method: 'PUT', body: JSON.stringify({ id: s.id, sort_order: i }) })
          : Promise.resolve(null)
      ));
      setSlots(next.map((s, i) => ({ ...s, sort_order: i })));
    } finally {
      setReordering(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────
  if (guardLoading) return <Layout><Container size="2xl"><LoadingCard /></Container></Layout>;
  if (!allowed) return <Layout><Container size="2xl"><NoPermissionCard /></Container></Layout>;

  const zoneAreaSummary = (z: DeliveryZone) => {
    const parts: string[] = [];
    if (z.provinces.length) parts.push(z.provinces.length <= 2 ? z.provinces.join(', ') : `${z.provinces.length} จังหวัด`);
    if (z.districts.length) parts.push(`${z.districts.length} เขต/อำเภอ`);
    if (z.postcodes.length) parts.push(`${z.postcodes.length} รหัสไปรษณีย์`);
    return parts.join(' · ') || '—';
  };

  const zoneFeeSummary = (z: DeliveryZone) => {
    if (z.fee_type === 'lalamove') return 'ค่าส่งตาม Lalamove';
    const fee = z.fee > 0 ? `฿${z.fee.toLocaleString()}` : 'ส่งฟรี';
    return z.free_over != null ? `${fee} · ครบ ฿${z.free_over.toLocaleString()} ส่งฟรี` : fee;
  };

  return (
    <Layout>
      <Container size="2xl">
        <PageHeader
          title="การจัดส่ง"
          subtitle={zonesOn && slotsOn ? 'จุดส่ง โซนค่าส่ง และช่วงเวลาส่งของร้าน'
            : zonesOn ? 'พื้นที่ที่ร้านรับส่ง และค่าส่งของแต่ละโซน'
            : 'รอบเวลาจัดส่งในแต่ละวัน'}
          backHref="/settings/company"
          actions={
            showZones
              ? <Button variant="primary" onClick={openZoneCreate}>+ เพิ่มจุดส่ง</Button>
              : showSlots
                ? <Button variant="primary" onClick={openSlotCreate}>+ เพิ่มรอบส่ง</Button>
                : undefined
          }
        />

        {/* เปิดทั้งคู่ค่อยมีแท็บให้สลับ — เปิดอย่างเดียวก็ไม่ต้องมีแท็บให้รก */}
        {zonesOn && slotsOn && (
          <Tabs
            tabs={[
              { key: 'zones', label: 'จุดส่ง / โซนค่าส่ง', icon: <MapPin className="w-4 h-4" /> },
              { key: 'slots', label: 'ช่วงเวลาส่ง', icon: <Clock className="w-4 h-4" /> },
            ]}
            activeKey={tab}
            onSelect={(k) => setTab(k as TabKey)}
          />
        )}

        {!zonesOn && !slotsOn ? (
          <EmptyCard
            title="ยังไม่ได้เปิดใช้งาน"
            subtitle='เปิด "จุดส่ง / โซนค่าส่ง" หรือ "ช่วงเวลาส่ง" ที่ ตั้งค่า → Feature เสริม ก่อน'
            icon={<MapPin className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
          />
        ) : loading ? (
          <LoadingCard />
        ) : showZones ? (
          zones.length === 0 ? (
            <EmptyCard
              title="ยังไม่มีจุดส่ง"
              subtitle="เพิ่มโซนพื้นที่ที่ร้านรับส่ง พร้อมค่าส่งของแต่ละโซน — ที่อยู่นอกโซนทั้งหมด = ไม่รับส่ง"
              icon={<MapPin className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            />
          ) : (
            <div className="space-y-2">
              <p className="subtitle-text text-gray-500">
                ระบบจับคู่โซนจากบนลงล่าง — โซนพื้นที่แคบ (รหัสไปรษณีย์) ควรอยู่เหนือโซนกว้าง (จังหวัด)
              </p>
              {zones.map((z, i) => (
                <ListRow
                  key={z.id}
                  reorder={{
                    onMoveUp: () => moveZone(i, -1),
                    onMoveDown: () => moveZone(i, 1),
                    disableUp: i === 0,
                    disableDown: i === zones.length - 1,
                    disabled: reordering,
                  }}
                  icon={
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${z.fee_type === 'lalamove' ? 'bg-orange-50' : 'bg-emerald-50'}`}>
                      {z.fee_type === 'lalamove'
                        ? <Bike className="w-4 h-4 text-orange-600" />
                        : <MapPin className="w-4 h-4 text-emerald-600" />}
                    </div>
                  }
                  title={z.name}
                  subtitle={`${zoneAreaSummary(z)} · ${zoneFeeSummary(z)}${z.lead_minutes > 0 ? ` · สั่งล่วงหน้า ${z.lead_minutes >= 60 ? `${Math.round(z.lead_minutes / 60)} ชม.` : `${z.lead_minutes} นาที`}` : ''}`}
                  inactive={!z.is_active}
                  actions={
                    <div className="flex items-center gap-2">
                      <Toggle checked={z.is_active} onChange={(v) => toggleZone(z, v)} aria-label={`เปิดใช้ ${z.name}`} />
                      <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => openZoneEdit(z)} />
                      <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-red-500" />} onClick={() => deleteZone(z)} />
                    </div>
                  }
                />
              ))}
            </div>
          )
        ) : (
          slots.length === 0 ? (
            <EmptyCard
              title="ยังไม่มีช่วงเวลาส่ง"
              subtitle="เพิ่มรอบส่งเป็นช่วงเวลา 2-3 ชั่วโมง เช่น 09:00-12:00 — ลูกค้าเลือกได้เฉพาะช่วง ไม่ใช่เวลาเป๊ะ"
              icon={<Clock className="w-12 h-12 text-gray-300 dark:text-slate-600" />}
            />
          ) : (
            <div className="space-y-2">
              {zonesOn && (
                <p className="subtitle-text text-gray-500">
                  ลูกค้าจะเลือกรอบได้ก็ต่อเมื่อ <strong>ส่งทันภายในรอบนั้น</strong> —
                  ระบบคิดจาก &quot;เวลาเตรียม + จัดส่ง&quot; ของโซนปลายทาง (ตั้งที่แท็บจุดส่ง)
                  ตรงนี้จึงกำหนดแค่ช่วงเวลา วัน และจำนวนที่รับได้
                </p>
              )}
              {slots.map((s, i) => (
                <ListRow
                  key={s.id}
                  reorder={{
                    onMoveUp: () => moveSlot(i, -1),
                    onMoveDown: () => moveSlot(i, 1),
                    disableUp: i === 0,
                    disableDown: i === slots.length - 1,
                    disabled: reordering,
                  }}
                  icon={
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <Clock className="w-4 h-4 text-indigo-600" />
                    </div>
                  }
                  title={`${s.name} · ${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)} น.`}
                  subtitle={`${formatDays(s.days_of_week)}${s.capacity != null ? ` · รับ ${s.capacity} ออเดอร์/วัน` : ' · ไม่จำกัดจำนวน'}`}
                  inactive={!s.is_active}
                  actions={
                    <div className="flex items-center gap-2">
                      <Toggle checked={s.is_active} onChange={(v) => toggleSlot(s, v)} aria-label={`เปิดใช้ ${s.name}`} />
                      <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => openSlotEdit(s)} />
                      <Button variant="ghost" size="sm" icon={<Trash2 className="w-4 h-4 text-red-500" />} onClick={() => deleteSlot(s)} />
                    </div>
                  }
                />
              ))}
            </div>
          )
        )}

        {/* ── Zone Modal ── */}
        <Modal
          open={zoneModal}
          onClose={() => setZoneModal(false)}
          title={zoneForm.id ? 'แก้ไขจุดส่ง' : 'เพิ่มจุดส่ง'}
          size="lg"
          footer={
            <div className="px-6 py-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setZoneModal(false)}>ยกเลิก</Button>
              <Button variant="primary" loading={saving} onClick={saveZone}>บันทึก</Button>
            </div>
          }
        >
          <div className="px-6 py-5 space-y-4">
            <FormInput
              ref={form.register('zone_name')}
              label="ชื่อจุดส่ง"
              required
              requiredMessage="กรุณาระบุชื่อจุดส่ง"
              value={zoneForm.name}
              onChange={(e) => { const v = e.target.value; setZoneForm(f => ({ ...f, name: v })); }}
              placeholder="เช่น กรุงเทพชั้นใน"
            />

            <div>
              <label className="field-label">จังหวัดที่รับส่ง</label>
              <MultiSelectSearch
                value={zoneForm.provinces}
                onChange={(ids) => setZoneForm(f => ({ ...f, provinces: ids }))}
                options={PROVINCES.map(p => ({ id: p, label: p }))}
                placeholder="เลือกจังหวัด"
                emptyLabel="ยังไม่ได้เลือกจังหวัด"
              />
            </div>

            <FormInput
              label="เขต / อำเภอ (เจาะจงกว่าจังหวัด)"
              value={zoneForm.districts}
              onChange={(e) => { const v = e.target.value; setZoneForm(f => ({ ...f, districts: v })); }}
              placeholder="เช่น วัฒนา, คลองเตย — คั่นด้วยจุลภาค"
              hint="เว้นว่างได้ ถ้าโซนนี้ครอบคลุมทั้งจังหวัด"
            />
            <FormInput
              label="รหัสไปรษณีย์ (เจาะจงที่สุด)"
              value={zoneForm.postcodes}
              onChange={(e) => { const v = e.target.value; setZoneForm(f => ({ ...f, postcodes: v })); }}
              placeholder="เช่น 10110, 10120 — คั่นด้วยจุลภาค"
              hint="ระบบเช็ครหัสไปรษณีย์ก่อน แล้วค่อยเช็คเขต/อำเภอ และจังหวัด"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">วิธีคิดค่าส่ง</label>
                <FormSelect
                  value={zoneForm.fee_type}
                  onChange={(v) => setZoneForm(f => ({ ...f, fee_type: v as 'fixed' | 'lalamove' }))}
                  options={[
                    { id: 'fixed', label: 'ค่าส่งคงที่ (กำหนดเอง)' },
                    { id: 'lalamove', label: 'คำนวณจาก Lalamove' },
                  ]}
                />
              </div>
              {zoneForm.fee_type === 'fixed' ? (
                <div>
                  <label className="field-label">ค่าส่ง</label>
                  <PostfixInput
                    value={zoneForm.fee}
                    onChange={(v) => setZoneForm(f => ({ ...f, fee: v }))}
                    postfix="฿" type="number" min={0}
                  />
                </div>
              ) : (
                <div className="flex items-end">
                  <p className="helper-text text-gray-500 pb-2">
                    ระบบจะขอราคาจาก Lalamove ตอนสร้างออเดอร์ (ตามระยะทางจริง)
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="field-label">ยอดขั้นต่ำส่งฟรี</label>
                <PostfixInput
                  value={zoneForm.free_over}
                  onChange={(v) => setZoneForm(f => ({ ...f, free_over: v }))}
                  postfix="฿" type="number" min={0} placeholder="เว้นว่าง = ไม่มีส่งฟรี"
                  width="w-full" inputClassName="w-full"
                />
              </div>
              <div>
                <label className="field-label">ต้องสั่งล่วงหน้า</label>
                <PostfixInput
                  value={zoneForm.lead_minutes}
                  onChange={(v) => setZoneForm(f => ({ ...f, lead_minutes: v }))}
                  postfix="นาที" type="number" min={0}
                  width="w-full" inputClassName="w-full"
                  helperText="เช่น 1440 = ต้องสั่งก่อน 1 วัน"
                />
              </div>
            </div>

            {slots.length > 0 && (
              <div>
                <label className="field-label">รอบส่งที่ใช้ได้ในโซนนี้</label>
                <MultiSelectSearch
                  value={zoneForm.slot_ids}
                  onChange={(ids) => setZoneForm(f => ({ ...f, slot_ids: ids }))}
                  options={slots.map(s => ({
                    id: s.id,
                    label: `${s.name} (${formatSlotTime(s.start_time)}-${formatSlotTime(s.end_time)})`,
                  }))}
                  placeholder="เลือกรอบส่ง"
                  emptyLabel="ไม่เลือก = ใช้ได้ทุกรอบ"
                />
                <p className="helper-text text-gray-400 mt-1">ไม่เลือกเลย = โซนนี้ใช้ได้ทุกรอบส่ง</p>
              </div>
            )}
          </div>
        </Modal>

        {/* ── Slot Modal ── */}
        <Modal
          open={slotModal}
          onClose={() => setSlotModal(false)}
          title={slotForm.id ? 'แก้ไขรอบส่ง' : 'เพิ่มรอบส่ง'}
          size="lg"
          footer={
            <div className="px-6 py-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setSlotModal(false)}>ยกเลิก</Button>
              <Button variant="primary" loading={saving} onClick={saveSlot}>บันทึก</Button>
            </div>
          }
        >
          <div className="px-6 py-5 space-y-4">
            <FormInput
              ref={form.register('slot_name')}
              label="ชื่อรอบส่ง"
              required
              requiredMessage="กรุณาระบุชื่อรอบส่ง"
              value={slotForm.name}
              onChange={(e) => { const v = e.target.value; setSlotForm(f => ({ ...f, name: v })); }}
              placeholder="เช่น รอบเช้า, รอบบ่าย"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">เริ่ม</label>
                <TimePicker value={slotForm.start_time} onChange={(v) => setSlotForm(f => ({ ...f, start_time: v }))} />
              </div>
              <div>
                <label className="field-label">สิ้นสุด</label>
                <TimePicker value={slotForm.end_time} onChange={(v) => setSlotForm(f => ({ ...f, end_time: v }))} />
              </div>
            </div>
            <p className="helper-text text-gray-400">
              แนะนำช่วงละ 2-3 ชั่วโมง — ลูกค้าจะเห็นเป็นช่วงเวลา ไม่ใช่เวลานัดเป๊ะ
            </p>

            <div>
              <label className="field-label">วันที่มีรอบนี้</label>
              <div className="flex flex-wrap gap-3">
                {DAY_LABELS.map((label, day) => (
                  <Checkbox
                    key={day}
                    label={label}
                    checked={slotForm.days.includes(day)}
                    onChange={(v: boolean) => setSlotForm(f => ({
                      ...f,
                      days: v ? [...f.days, day].sort((a, b) => a - b) : f.days.filter(d => d !== day),
                    }))}
                  />
                ))}
              </div>
            </div>

            {/* เวลาปิดรับคุมที่ "เวลาเตรียม + จัดส่ง" ของโซนที่เดียว —
                รอบส่งกำหนดแค่ช่วงเวลา วัน และจำนวนที่รับไหว */}
            <div>
              <label className="field-label">รับได้ต่อวัน</label>
              <PostfixInput
                value={slotForm.capacity}
                onChange={(v) => setSlotForm(f => ({ ...f, capacity: v }))}
                postfix="ออเดอร์" type="number" min={1} placeholder="เว้นว่าง = ไม่จำกัด"
                width="w-full" inputClassName="w-full"
              />
            </div>
          </div>
        </Modal>

        {confirmDialog}
      </Container>
    </Layout>
  );
}
