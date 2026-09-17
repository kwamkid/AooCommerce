'use client';

// ฟอร์มแบรนด์ของกลาง — ใช้ทั้งหน้า /settings/brands และหน้า Supplier
//
// ⛔ ห้ามเขียนฟอร์มแบรนด์ซ้ำที่อื่นอีก · ที่ไหนอยากได้แค่บางช่องให้ปิดด้วย prop
//    (`hideSupplier` · `supplierId` = ผูก Supplier ให้เลยโดยไม่ต้องเลือก)
// เพิ่ม/แก้ไข = ใบเดียวกัน ต่างแค่หัวข้อกับปลายทางที่บันทึก (POST/PUT)
//
// ⛔ **ห้ามเอาช่อง GP ฝากขากลับมาที่แบรนด์อีก** (ถอดออก 17 ก.ย. 2569 ตามคำสั่งเจ้าของ)
//    เหตุผลสองชั้น: (1) `product_brands` ไม่มีคอลัมน์ `default_gp_rate`/`gp_base_price`
//    อยู่จริง — ส่งไปเมื่อไหร่ PostgREST ตีกลับทั้งใบ (สร้างแบรนด์ใหม่พังทุกครั้ง)
//    (2) GP ระดับแบรนด์ที่ `lib/gp-resolver.ts` อ่านจริงคือ `companies.settings.brand_gp_overrides`
//    ซึ่งตั้งที่ **ตั้งค่า › ลูกค้าธุรกิจ** อยู่แล้ว — มีสองที่ให้กรอกคือที่มาของความสับสน

import { useEffect, useState } from 'react';
import { Award, Edit2, Factory } from 'lucide-react';
import Button from '@/components/ui/Button';
import EntitySearchInput from '@/components/ui/EntitySearchInput';
import FormField from '@/components/ui/FormField';
import FormInput from '@/components/ui/FormInput';
import ImageDropzone from '@/components/ui/ImageDropzone';
import Modal, { ModalFormBody, ModalFormFooter } from '@/components/ui/Modal';
import SaveButton from '@/components/ui/SaveButton';
import SlugField from '@/components/ui/SlugField';
import { apiFetch } from '@/lib/api-client';
import { useFeatures } from '@/lib/features-context';
import { masterSlugErrorMessage, validateMasterSlug } from '@/lib/master-slug';
import { storageKeyFor } from '@/lib/storage-key';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/lib/toast-context';
import { useStorefrontLinks } from '@/lib/useStorefrontLinks';

export interface BrandFormValue {
  id: string;
  name: string;
  logo_url?: string | null;
  supplier_id?: string | null;
  /** ลิงก์หน้าร้าน (`?brand=<slug>`) — DB เติมให้ตอนสร้าง แก้ได้ทีหลังจากฟอร์มนี้ */
  slug?: string | null;
}

interface SupplierOption {
  id: string;
  name: string;
  supplier_type?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** มีค่า = แก้ไขแบรนด์นั้น · ไม่มี = เพิ่มใหม่ */
  brand?: BrandFormValue | null;
  /** ผูกกับ Supplier นี้ทันที (หน้า Supplier) — ช่องเลือก Supplier จะไม่ขึ้น */
  supplierId?: string;
  /** ซ่อนช่องเลือก Supplier (นอกเหนือจากที่ปิดตามฟีเจอร์อยู่แล้ว) */
  hideSupplier?: boolean;
  /** ตัวเลือก Supplier ที่หน้าแม่โหลดไว้แล้ว — ไม่ส่งมาก็โหลดเอง */
  suppliers?: SupplierOption[];
  /** ลิงก์ของแบรนด์อื่นในร้าน (ไม่รวมตัวที่กำลังแก้) — เตือนซ้ำตั้งแต่ตอนพิมพ์ */
  takenSlugs?: string[];
  onSaved: (brand: BrandFormValue) => void;
}

export default function BrandFormModal({
  open,
  onClose,
  brand,
  supplierId,
  hideSupplier = false,
  suppliers: suppliersProp,
  takenSlugs = [],
  onSaved,
}: Props) {
  const { features } = useFeatures();
  const { showToast } = useToast();
  const storefront = useStorefrontLinks();
  const isEditing = Boolean(brand?.id);

  const [name, setName] = useState('');
  /** ไฟล์โลโก้ที่เพิ่งเลือก (ยังไม่อัป) · `null` = ไม่ได้แตะ หรือกดลบรูปเดิม */
  const [logo, setLogo] = useState<File | null>(null);
  /** รูปเดิมของแบรนด์ — แยกจากไฟล์ใหม่ เพื่อให้รู้ว่า "ลบรูปเดิม" ต่างจาก "ไม่ได้แตะ" */
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  /** ImageDropzone กำลังย่อรูปอยู่ — ปิดปุ่มบันทึกไว้ก่อน ไม่งั้นได้แบรนด์ที่ไม่มีรูป */
  const [logoBusy, setLogoBusy] = useState(false);
  const [supplier, setSupplier] = useState('');
  /** ลิงก์หน้าร้านของแบรนด์ — แก้ได้เฉพาะตอนแก้ไข (ตอนสร้าง DB เติมให้จากชื่อ) */
  const [slug, setSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>(suppliersProp || []);

  const showSupplierPicker = features.supplier && !hideSupplier && !supplierId;

  // เติมค่าตั้งต้นทุกครั้งที่เปิด — ปิดแล้วเปิดใหม่ต้องไม่ค้างค่าของรอบก่อน
  useEffect(() => {
    if (!open) return;
    setName(brand?.name || '');
    setLogo(null);
    setLogoUrl(brand?.logo_url || null);
    setSupplier(brand?.supplier_id || supplierId || '');
    setSlug(brand?.slug || '');
  }, [open, brand, supplierId]);

  useEffect(() => {
    if (suppliersProp) { setSuppliers(suppliersProp); return; }
    if (!open || !showSupplierPicker) return;
    apiFetch('/api/suppliers')
      .then(async res => { if (res.ok) setSuppliers(((await res.json()).data || []) as SupplierOption[]); })
      .catch(() => { /* ไม่มีรายการ Supplier ก็ยังบันทึกแบรนด์ได้ */ });
  }, [open, showSupplierPicker, suppliersProp]);

  const handleSave = async () => {
    if (!name.trim()) return showToast('กรุณากรอกชื่อแบรนด์', 'error');
    setSaving(true);
    try {
      // อัปโลโก้ก่อน แล้วค่อยบันทึกแบรนด์ — อัปไม่ผ่านต้องไม่บันทึกชื่อไปครึ่ง ๆ
      // ⚠️ ชื่อไฟล์ต้องผ่าน storageKeyFor — Storage ตอบ 400 InvalidKey กับชื่อไทย/อีโมจิ/#
      let savedLogoUrl = logoUrl;
      if (logo) {
        const path = `brand-logos/${storageKeyFor(logo.name, 'jpg')}`;
        const { error: uploadError } = await supabase.storage
          .from('chat-media')
          .upload(path, logo, { contentType: logo.type || 'image/jpeg' });
        if (uploadError) throw new Error(`อัปโหลดโลโก้ไม่สำเร็จ: ${uploadError.message}`);
        savedLogoUrl = supabase.storage.from('chat-media').getPublicUrl(path).data.publicUrl;
      }
      const payload: Record<string, unknown> = {
        name: name.trim(),
        logo_url: savedLogoUrl || '',
        supplier_id: supplier || null,
      };
      // ส่ง slug เฉพาะตอนที่ผู้ใช้เปลี่ยนจริง — ตอนสร้างปล่อยให้ trigger ที่ DB เติมจากชื่อ
      if (isEditing && slug && slug !== (brand?.slug || '')) {
        const slugError = validateMasterSlug(slug, takenSlugs);
        if (slugError) {
          setSaving(false);
          return showToast(masterSlugErrorMessage(slugError), 'error');
        }
        payload.slug = slug;
      }
      const res = await apiFetch('/api/brands', {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEditing ? { id: brand!.id, ...payload } : payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      }
      const saved = (await res.json().catch(() => ({}))).data as BrandFormValue | undefined;
      showToast(isEditing ? 'อัปเดตแบรนด์สำเร็จ' : 'เพิ่มแบรนด์สำเร็จ');
      onSaved(saved || { id: brand?.id || '', name: name.trim(), logo_url: savedLogoUrl });
      onClose();
    } catch (error: unknown) {
      showToast(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ', 'error');
    } finally { setSaving(false); }
  };

  return (
    <Modal
      open={open}
      onClose={() => { if (!saving) onClose(); }}
      title={isEditing ? 'แก้ไขแบรนด์' : 'เพิ่มแบรนด์'}
      icon={isEditing ? <Edit2 /> : <Award />}
      size="md"
      disableBackdropClose={saving}
      footer={
        <ModalFormFooter>
          <Button variant="secondary" onClick={onClose} disabled={saving}>ยกเลิก</Button>
          <SaveButton onClick={handleSave} loading={saving} disabled={logoBusy || !name.trim()} />
        </ModalFormFooter>
      }
    >
      <ModalFormBody stacked>
        <FormInput label="ชื่อแบรนด์" required value={name} onChange={event => setName(event.target.value)}
          placeholder="เช่น Nike, Samsung" autoFocus />
        {/* โลโก้แบรนด์ — หน้าร้านออนไลน์ดึงไปแสดงบนหัวหน้ากรองแบรนด์
            ย่อเหลือ 400px พอสำหรับที่แสดงจริง 44px เผื่อจอ retina แล้ว */}
        <FormField label="โลโก้แบรนด์" hint="ไม่ใส่ก็ได้ — หน้าร้านจะแสดงแค่ชื่อแบรนด์">
          <ImageDropzone
            value={logo}
            // กดกากบาทลบรูป = `onChange(null)` — ต้องล้างรูปเดิมด้วย ไม่งั้นกดลบแล้วยังบันทึกรูปเก่ากลับไป
            onChange={file => { setLogo(file); if (!file) setLogoUrl(null); }}
            initialPreviewUrl={logoUrl}
            onBusyChange={setLogoBusy}
            alt={`โลโก้ ${name}`}
            label="เลือกรูปโลโก้"
            maxWidthOrHeight={400}
            maxSizeMB={0.15}
            changeOnClick
          />
        </FormField>
        {showSupplierPicker && (
          <FormField label="Supplier" hint="เจ้าของสินค้าที่เรารับมาขาย — ใช้กับใบสั่งซื้อและรายงาน">
            <EntitySearchInput value={supplier} onChange={setSupplier} onClear={() => setSupplier('')}
              options={suppliers.map(item => ({ id: item.id, label: item.name, subtitle: item.supplier_type }))}
              placeholder="ค้นหา Supplier..."
              selectedDisplay={supplier ? (
                <span className="entity-selected-value"><Factory /><span className="entity-selected-value-text">{suppliers.find(item => item.id === supplier)?.name}</span></span>
              ) : undefined} />
          </FormField>
        )}
        {/* ลิงก์หน้าร้าน — ขึ้นเฉพาะตอนแก้ไขและร้านเปิดหน้าร้านแล้ว
            (ยังไม่เปิด = ไม่มีหน้าให้ลิงก์ไป · เจ้าของกำหนด 17 ก.ย. 2569) */}
        {isEditing && storefront.enabled && (
          <SlugField
            value={slug}
            onChange={setSlug}
            originalValue={brand?.slug || ''}
            takenSlugs={takenSlugs}
            previewPrefix={storefront.brand('')}
          />
        )}
      </ModalFormBody>
    </Modal>
  );
}
