// Path: app/marketing/coupons/page.tsx
//
// คูปองส่วนลด — โค้ดที่ลูกค้า/แอดมินกรอกเองตอนเปิดบิล (คนละเรื่องกับ "โปรโมชั่น" ที่ลดอัตโนมัติ)
// อยู่ในเมนูการตลาดคู่กับโปรโมชั่น เพราะเป็นเครื่องมือกระตุ้นยอด ไม่ใช่ master data ที่ตั้งครั้งเดียวแล้วลืม
//
// ⛔ กติกาส่วนลด/วันหมดอายุ/โควตา อยู่ที่ [lib/coupons.ts](../../../lib/coupons.ts) ที่เดียว
//    หน้านี้ทำได้แค่แสดงผลกับส่งฟอร์ม — ห้ามคิดส่วนลดเองซ้ำที่นี่
'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Ticket, Plus, Pencil, Trash2, Copy } from 'lucide-react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import FormInput from '@/components/ui/FormInput';
import SearchInput from '@/components/ui/SearchInput';
import Checkbox from '@/components/ui/Checkbox';
import Toggle from '@/components/ui/Toggle';
import DataTable, { type DataTableColumn } from '@/components/ui/DataTable';
import DiscountInput from '@/components/ui/DiscountInput';
import ActionMenu from '@/components/ui/ActionMenu';
import { LoadingCard } from '@/components/ui/StateCard';
import { useAuthGuard } from '@/lib/useAuthGuard';
import { useToast } from '@/lib/toast-context';
import { useConfirmDialog } from '@/lib/useConfirmDialog';
import { apiFetch } from '@/lib/api-client';
import { formatPrice, formatThaiDate } from '@/lib/utils/format';
import {
  COUPON_CHANNELS,
  COUPON_CHANNEL_LABEL,
  normalizeCouponCode,
  type CouponChannel,
  type CouponDiscountType,
} from '@/lib/coupons';

interface CouponRow {
  id: string;
  code: string;
  name: string | null;
  discount_type: CouponDiscountType;
  discount_value: number;
  max_discount: number | null;
  min_spend: number;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit_total: number | null;
  usage_limit_per_customer: number | null;
  used_count: number;
  customer_id: string | null;
  channels: CouponChannel[];
  source: string;
  is_active: boolean;
  created_at: string;
}

/** ค่าในฟอร์มเก็บเป็น string ทั้งหมด — ว่าง = ไม่จำกัด (ไม่ใช่ 0) ตามที่ API ตีความ */
interface FormState {
  code: string;
  name: string;
  discountType: CouponDiscountType;
  discountValue: string;
  maxDiscount: string;
  minSpend: string;
  validFrom: string;
  validUntil: string;
  usageLimitTotal: string;
  usageLimitPerCustomer: string;
  channels: CouponChannel[];
  isActive: boolean;
}

const EMPTY_FORM: FormState = {
  code: '',
  name: '',
  discountType: 'percent',
  discountValue: '',
  maxDiscount: '',
  minSpend: '',
  validFrom: '',
  validUntil: '',
  usageLimitTotal: '',
  usageLimitPerCustomer: '',
  channels: [...COUPON_CHANNELS],
  isActive: true,
};

const PER_PAGE = 20;

/** สถานะที่ผู้ใช้สนใจจริง เรียงตามลำดับความสำคัญ — ปิดเอง > หมดอายุ > ใช้ครบ > ยังไม่เริ่ม > ใช้ได้ */
function couponState(c: CouponRow, now = new Date()) {
  if (!c.is_active) return { label: 'ปิดใช้งาน', tone: 'gray' as const };
  if (c.valid_until && now > new Date(c.valid_until)) return { label: 'หมดอายุ', tone: 'red' as const };
  if (c.usage_limit_total != null && c.used_count >= c.usage_limit_total) {
    return { label: 'ใช้ครบแล้ว', tone: 'amber' as const };
  }
  if (c.valid_from && now < new Date(c.valid_from)) return { label: 'ยังไม่เริ่ม', tone: 'blue' as const };
  return { label: 'ใช้ได้', tone: 'emerald' as const };
}

export default function CouponsPage() {
  const { allowed, loading: permLoading } = useAuthGuard('marketing.coupons');
  const { showToast } = useToast();
  const { confirmDialog, confirm } = useConfirmDialog();

  const [coupons, setCoupons] = useState<CouponRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(PER_PAGE);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<CouponRow | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const fetchCoupons = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/coupons');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'โหลดคูปองไม่สำเร็จ');
      setCoupons(data.coupons || []);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'โหลดคูปองไม่สำเร็จ', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (allowed) fetchCoupons();
  }, [allowed, fetchCoupons]);

  // ค้นในเครื่องได้ เพราะ API คืนสูงสุด 200 ใบ — ร้านที่มีคูปองเกินนั้นค่อยย้ายไปค้นฝั่ง server
  const filtered = useMemo(() => {
    const q = normalizeCouponCode(search);
    if (!q) return coupons;
    return coupons.filter(
      (c) => c.code.includes(q) || (c.name || '').toUpperCase().includes(q),
    );
  }, [coupons, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const pageRows = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage],
  );

  useEffect(() => { setPage(1); }, [search]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setModalOpen(true);
  };

  const openEdit = (c: CouponRow) => {
    setEditing(c);
    setForm({
      code: c.code,
      name: c.name || '',
      discountType: c.discount_type,
      discountValue: String(c.discount_value),
      maxDiscount: c.max_discount == null ? '' : String(c.max_discount),
      minSpend: c.min_spend ? String(c.min_spend) : '',
      validFrom: c.valid_from ? c.valid_from.slice(0, 10) : '',
      validUntil: c.valid_until ? c.valid_until.slice(0, 10) : '',
      usageLimitTotal: c.usage_limit_total == null ? '' : String(c.usage_limit_total),
      usageLimitPerCustomer: c.usage_limit_per_customer == null ? '' : String(c.usage_limit_per_customer),
      channels: c.channels?.length ? c.channels : [...COUPON_CHANNELS],
      isActive: c.is_active,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const value = Number(form.discountValue);
    if (!Number.isFinite(value) || value <= 0) {
      showToast('ใส่ส่วนลดมากกว่า 0', 'error');
      return;
    }
    if (form.discountType === 'percent' && value > 100) {
      showToast('ส่วนลดเป็นเปอร์เซ็นต์เกิน 100 ไม่ได้', 'error');
      return;
    }
    if (form.channels.length === 0) {
      showToast('เลือกช่องทางที่ใช้คูปองนี้ได้อย่างน้อย 1 ช่องทาง', 'error');
      return;
    }

    setSaving(true);
    try {
      // แก้: โค้ดกับชนิดส่วนลดห้ามเปลี่ยน (บิลเก่าอ้างอยู่) — API รับเฉพาะเงื่อนไขการใช้
      const payload = editing
        ? {
            id: editing.id,
            name: form.name,
            min_spend: form.minSpend,
            max_discount: form.discountType === 'percent' ? form.maxDiscount : '',
            valid_from: form.validFrom,
            valid_until: form.validUntil,
            usage_limit_total: form.usageLimitTotal,
            usage_limit_per_customer: form.usageLimitPerCustomer,
            channels: form.channels,
            is_active: form.isActive,
          }
        : {
            code: form.code,
            name: form.name,
            discount_type: form.discountType,
            discount_value: form.discountValue,
            max_discount: form.discountType === 'percent' ? form.maxDiscount : '',
            min_spend: form.minSpend,
            valid_from: form.validFrom,
            valid_until: form.validUntil,
            usage_limit_total: form.usageLimitTotal,
            usage_limit_per_customer: form.usageLimitPerCustomer,
            channels: form.channels,
            is_active: form.isActive,
          };

      const res = await apiFetch('/api/coupons', {
        method: editing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      showToast(editing ? 'แก้คูปองแล้ว' : `สร้างคูปอง ${data.coupon?.code} แล้ว`);
      setModalOpen(false);
      await fetchCoupons();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c: CouponRow) => {
    const used = c.used_count > 0;
    const ok = await confirm({
      title: used ? `ปิดใช้งาน ${c.code}?` : `ลบคูปอง ${c.code}?`,
      description: used
        ? `คูปองนี้ถูกใช้ไปแล้ว ${c.used_count} ครั้ง จึงลบทิ้งไม่ได้ (ประวัติการใช้กับรายงานย้อนหลังจะหาย) — จะปิดใช้งานแทนให้`
        : 'คูปองนี้ยังไม่เคยถูกใช้ ลบออกได้เลย',
      confirmLabel: used ? 'ปิดใช้งาน' : 'ลบ',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await apiFetch(`/api/coupons?id=${c.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'ลบไม่สำเร็จ');
      showToast(data.disabled ? 'ปิดใช้งานคูปองแล้ว' : 'ลบคูปองแล้ว');
      await fetchCoupons();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'ลบไม่สำเร็จ', 'error');
    }
  };

  const copyCode = (code: string) => {
    navigator.clipboard?.writeText(code)
      .then(() => showToast(`คัดลอก ${code} แล้ว`))
      .catch(() => showToast('คัดลอกไม่สำเร็จ', 'error'));
  };

  const toggleChannel = (ch: CouponChannel) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch)
        ? f.channels.filter((c) => c !== ch)
        : [...f.channels, ch],
    }));
  };

  const columns: DataTableColumn<CouponRow>[] = [
    {
      key: 'code',
      label: 'โค้ด',
      alwaysVisible: true,
      grow: true,
      render: (c) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono font-semibold text-gray-900 dark:text-white">{c.code}</span>
            {c.customer_id && <Badge tone="purple" size="sm">เฉพาะคน</Badge>}
          </div>
          {c.name && <p className="subtitle-text truncate">{c.name}</p>}
        </div>
      ),
    },
    {
      key: 'discount',
      label: 'ส่วนลด',
      align: 'right',
      render: (c) => (
        <div>
          <span className="font-medium">
            {c.discount_type === 'percent' ? `${c.discount_value}%` : formatPrice(c.discount_value)}
          </span>
          {c.discount_type === 'percent' && c.max_discount != null && (
            <p className="helper-text">สูงสุด {formatPrice(c.max_discount)}</p>
          )}
        </div>
      ),
    },
    {
      key: 'min_spend',
      label: 'ซื้อขั้นต่ำ',
      align: 'right',
      render: (c) => (c.min_spend > 0 ? formatPrice(c.min_spend) : <span className="text-gray-400">—</span>),
    },
    {
      key: 'used',
      label: 'ใช้ไปแล้ว',
      align: 'center',
      render: (c) => (
        <span>
          {c.used_count}
          {c.usage_limit_total != null && <span className="text-gray-400"> / {c.usage_limit_total}</span>}
        </span>
      ),
    },
    {
      key: 'valid',
      label: 'ช่วงที่ใช้ได้',
      render: (c) =>
        c.valid_from || c.valid_until ? (
          <span className="subtitle-text">
            {c.valid_from ? formatThaiDate(c.valid_from) : 'ตั้งแต่วันนี้'}
            {' – '}
            {c.valid_until ? formatThaiDate(c.valid_until) : 'ไม่มีกำหนด'}
          </span>
        ) : (
          <span className="text-gray-400">ไม่จำกัด</span>
        ),
    },
    {
      key: 'channels',
      label: 'ใช้ได้ที่',
      render: (c) =>
        c.channels?.length === COUPON_CHANNELS.length ? (
          <span className="subtitle-text">ทุกช่องทาง</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {(c.channels || []).map((ch) => (
              <Badge key={ch} tone="blue" size="sm">{COUPON_CHANNEL_LABEL[ch]}</Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'status',
      label: 'สถานะ',
      align: 'center',
      render: (c) => {
        const s = couponState(c);
        return <Badge tone={s.tone} size="sm">{s.label}</Badge>;
      },
    },
    {
      key: 'actions',
      label: '',
      alwaysVisible: true,
      stopPropagation: true,
      align: 'center',
      render: (c) => (
        <ActionMenu
          items={[
            { key: 'copy', label: 'คัดลอกโค้ด', icon: <Copy className="w-4 h-4" />, onClick: () => copyCode(c.code) },
            { key: 'edit', label: 'แก้เงื่อนไข', icon: <Pencil className="w-4 h-4" />, onClick: () => openEdit(c) },
            {
              key: 'delete',
              label: c.used_count > 0 ? 'ปิดใช้งาน' : 'ลบ',
              icon: <Trash2 className="w-4 h-4" />,
              danger: true,
              dividerBefore: true,
              onClick: () => handleDelete(c),
            },
          ]}
        />
      ),
    },
  ];

  if (permLoading) {
    return <Layout><Container size="full"><LoadingCard /></Container></Layout>;
  }
  if (!allowed) return null; // useAuthGuard เด้งไป /dashboard ให้แล้ว

  return (
    <Layout>
      <Container size="full">
        <PageHeader
          icon={<Ticket />}
          title="คูปองส่วนลด"
          subtitle="โค้ดที่ลูกค้ากรอกเองตอนสั่งซื้อ — ต่างจากโปรโมชั่นที่ลดให้อัตโนมัติ"
          actions={
            <Button variant="primary" icon={<Plus className="w-4 h-4" />} onClick={openCreate}>
              สร้างคูปอง
            </Button>
          }
        />

        <div className="data-filter-card">
          <SearchInput value={search} onChange={setSearch} placeholder="ค้นหาโค้ดหรือชื่อคูปอง..." />
        </div>

        <DataTable
          storageKey="coupons"
          columns={columns}
          data={pageRows}
          loading={loading}
          getRowId={(c) => c.id}
          emptyMessage={search ? 'ไม่พบคูปองที่ตรงกับคำค้น' : 'ยังไม่มีคูปอง — กด "สร้างคูปอง" เพื่อเริ่ม'}
          emptyIcon={<Ticket className="w-10 h-10" />}
          currentPage={page}
          totalPages={totalPages}
          totalRecords={filtered.length}
          recordsPerPage={perPage}
          onPageChange={setPage}
          onRecordsPerPageChange={(n) => { setPerPage(n); setPage(1); }}
        />

        <CouponFormModal
          open={modalOpen}
          editing={editing}
          form={form}
          setForm={setForm}
          saving={saving}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
          onToggleChannel={toggleChannel}
        />

        {confirmDialog}
      </Container>
    </Layout>
  );
}

// ── ฟอร์มสร้าง/แก้คูปอง ────────────────────────────────────────────────────
// แยกออกมาเพื่อให้หน้าหลักอ่านง่าย — state ยังอยู่ที่ผู้เรียก (ตัวนี้วาดอย่างเดียว)

function CouponFormModal({
  open, editing, form, setForm, saving, onClose, onSave, onToggleChannel,
}: {
  open: boolean;
  editing: CouponRow | null;
  form: FormState;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  saving: boolean;
  onClose: () => void;
  onSave: () => void;
  onToggleChannel: (ch: CouponChannel) => void;
}) {
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal
      open={open}
      onClose={onClose}
      icon={<Ticket className="w-5 h-5" />}
      title={editing ? `แก้คูปอง ${editing.code}` : 'สร้างคูปอง'}
      size="2xl"
      footer={
        <div className="flex justify-end gap-3 px-6 py-4">
          <Button variant="secondary" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" loading={saving} onClick={onSave}>บันทึก</Button>
        </div>
      }
    >
      <div className="px-6 py-5 space-y-5">
        {/* โค้ด + ชื่อ — โค้ดแก้ไม่ได้หลังสร้าง เพราะบิลเก่าอ้างอยู่ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="โค้ด"
            value={form.code}
            onChange={(e) => set('code', normalizeCouponCode(e.target.value))}
            disabled={!!editing}
            placeholder="เว้นว่าง = ให้ระบบสุ่มให้"
            hint={editing ? 'โค้ดแก้ไม่ได้ เพราะบิลที่ใช้ไปแล้วอ้างอยู่' : 'เช่น WELCOME5 · เว้นว่างได้'}
          />
          <FormInput
            label="ชื่อเรียกภายใน"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="เช่น ลูกค้าใหม่ ก.ย. 68"
            hint="ไว้ให้ทีมงานรู้ว่าคูปองใบนี้แจกงานไหน — ลูกค้าไม่เห็น"
          />
        </div>

        {/* ส่วนลด */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="field-label">ส่วนลด</label>
            <DiscountInput
              value={form.discountValue}
              // DiscountInput พูดภาษาโมดูลโปรโมชั่น ('percent' | 'fixed_discount') ส่วนคูปองใช้
              // 'percent' | 'amount' ตาม lib/coupons.ts — แปลงค่าตรงขอบทั้งขาเข้าและขาออก
              // ห้าม cast เฉย ๆ เพราะเป็นคนละสตริงจริง ๆ ไม่ใช่แค่ชื่อ type ต่างกัน
              discountType={form.discountType === 'percent' ? 'percent' : 'fixed_discount'}
              onValueChange={(v) => set('discountValue', v)}
              onTypeChange={(t) => set('discountType', t === 'percent' ? 'percent' : 'amount')}
              disabled={!!editing}
              helperText={editing ? 'ชนิดและมูลค่าส่วนลดแก้ไม่ได้หลังสร้าง' : undefined}
            />
          </div>
          {form.discountType === 'percent' && (
            <FormInput
              label="ลดได้สูงสุด"
              value={form.maxDiscount}
              onChange={(e) => set('maxDiscount', e.target.value)}
              postfix="฿"
              inputMode="decimal"
              placeholder="ไม่จำกัด"
              hint="กันบิลใหญ่โดนลดเกินตั้งใจ"
            />
          )}
        </div>

        {/* เงื่อนไขการใช้ */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FormInput
            label="ซื้อขั้นต่ำ"
            value={form.minSpend}
            onChange={(e) => set('minSpend', e.target.value)}
            postfix="฿"
            inputMode="decimal"
            placeholder="ไม่กำหนด"
          />
          <FormInput
            label="ใช้ได้ทั้งหมด"
            value={form.usageLimitTotal}
            onChange={(e) => set('usageLimitTotal', e.target.value)}
            postfix="ครั้ง"
            inputMode="numeric"
            placeholder="ไม่จำกัด"
          />
          <FormInput
            label="ต่อลูกค้า 1 คน"
            value={form.usageLimitPerCustomer}
            onChange={(e) => set('usageLimitPerCustomer', e.target.value)}
            postfix="ครั้ง"
            inputMode="numeric"
            placeholder="ไม่จำกัด"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <FormInput
            label="เริ่มใช้ได้"
            type="date"
            value={form.validFrom}
            onChange={(e) => set('validFrom', e.target.value)}
            hint="เว้นว่าง = ใช้ได้ทันที"
          />
          <FormInput
            label="ใช้ได้ถึง"
            type="date"
            value={form.validUntil}
            onChange={(e) => set('validUntil', e.target.value)}
            hint="เว้นว่าง = ไม่มีวันหมดอายุ"
          />
        </div>

        {/* ช่องทาง — marketplace ใช้คูปองไม่ได้ (ยอดมาจากแพลตฟอร์มแล้ว) จึงไม่มีในรายการ */}
        <div>
          <label className="field-label">ใช้คูปองนี้ได้ที่ไหนบ้าง</label>
          <Card flat padding="sm" className="mt-1">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {COUPON_CHANNELS.map((ch) => (
                <Checkbox
                  key={ch}
                  checked={form.channels.includes(ch)}
                  onChange={() => onToggleChannel(ch)}
                  label={COUPON_CHANNEL_LABEL[ch]}
                />
              ))}
            </div>
          </Card>
          <p className="helper-text mt-1">
            ออเดอร์จาก Shopee/Lazada/TikTok ใช้คูปองไม่ได้ เพราะยอดเงินมาจากแพลตฟอร์มแล้ว
          </p>
        </div>

        {/* เปิด/ปิด */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-900 dark:text-white">เปิดใช้งาน</p>
            <p className="subtitle-text">ปิดแล้วลูกค้ากรอกโค้ดนี้ไม่ได้ทันที แต่ประวัติการใช้ยังอยู่</p>
          </div>
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} />
        </div>
      </div>
    </Modal>
  );
}
