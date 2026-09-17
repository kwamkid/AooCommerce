// ─────────────────────────────────────────────────────────────────────────────
// ค่าตั้งต้นของลูกค้าธุรกิจ — ใช้ร่วมกันทั้งแท็บ "ลูกค้าตัวแทน" และ "ลูกค้าห้าง"
//
// สองแท็บต่างกันแค่ว่าเก็บลงก้อนไหนใน settings และมีเงื่อนไขส่งยอด/ชำระหรือไม่
// (ฝากขายตัวแทนต้องรอให้ตัวแทนแจ้งยอดขายก่อน ห้างแจ้งยอดผ่านรายงานของห้างเอง)
// เดิมฟอร์มนี้ฝังอยู่ในการ์ดของหน้า Feature เสริม — หน้ารวมฟีเจอร์ไม่ควรถือฟอร์มตั้งค่า
// ─────────────────────────────────────────────────────────────────────────────
'use client';

import { useEffect, useRef, useState } from 'react';
import Layout from '@/components/layout/Layout';
import Container from '@/components/ui/Container';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import Toggle from '@/components/ui/Toggle';
import Alert from '@/components/ui/Alert';
import StickyActionBar from '@/components/ui/StickyActionBar';
import GeneralSettingsTabs, { type GeneralSettingsTabKey } from '@/components/settings/GeneralSettingsTabs';
import GpOverridePanel from '@/components/customers/GpOverridePanel';
import { type BrandGpRow } from '@/components/customers/BrandGpCommissions';
import UnitNumberField from '@/components/ui/UnitNumberField';
import { NoPermissionCard } from '@/components/ui/StateCard';
import { LoadingCard } from '@/components/ui/StateCard';
import { apiFetch } from '@/lib/api-client';
import { useToast } from '@/lib/toast-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';

export type BusinessCustomerScope = 'consignment' | 'department_store';

interface Defaults {
  default_gp_rate: number;
  default_gp_base_price: 'retail' | 'discounted';
  default_report_due_days?: number;
  default_payment_terms?: number;
  statement_day: number;
  credit_days: number;
  vat_included: boolean;
}

const SCOPE_META: Record<BusinessCustomerScope, {
  tab: GeneralSettingsTabKey;
  title: string;
  subtitle: string;
  gpLabel: string;
  vatLabel: string;
  /** มีเงื่อนไขส่งยอด/ชำระของสายฝากขายหรือไม่ */
  hasReportTerms: boolean;
  /** แก้ Brand GP ได้จากแท็บนี้ไหม (เป็นค่าร่วม แก้ได้ที่เดียวพอ) */
  ownsBrandGp: boolean;
  /** บอกผู้ใช้ว่าตั้งทับรายคนได้ที่ไหน */
  perCustomerHint: string;
}> = {
  consignment: {
    tab: 'consignment',
    title: 'ลูกค้าตัวแทน',
    subtitle: 'ค่าตั้งต้นของตัวแทนฝากขายและตัวแทนขายขาด — ตั้งทับรายคนได้ที่หน้าลูกค้า',
    gpLabel: 'GP% ตัวแทน',
    vatLabel: 'ราคาตัวแทนรวม VAT แล้ว',
    hasReportTerms: true,
    ownsBrandGp: true,
    perCustomerHint: 'ตัวแทนแต่ละรายตั้งทับได้เองที่หน้าลูกค้า',
  },
  department_store: {
    tab: 'department-store',
    title: 'ลูกค้าห้าง',
    subtitle: 'ค่าตั้งต้นของห้างฝากขายและห้างขายขาด — ตั้งทับรายคนได้ที่หน้าลูกค้า',
    gpLabel: 'GP% ห้าง',
    vatLabel: 'ราคาห้างรวม VAT แล้ว',
    hasReportTerms: false,
    ownsBrandGp: false,
    perCustomerHint: 'ห้างแต่ละเจ้ากำหนดไม่เหมือนกัน — ตั้งทับได้เองที่หน้าลูกค้า',
  },
};

export default function BusinessCustomerDefaults({ scope }: { scope: BusinessCustomerScope }) {
  const meta = SCOPE_META[scope];
  const { companyRoles, permissions } = useCompany();
  const { showToast } = useToast();
  const canEdit = can({ roles: companyRoles, permissions }, 'settings.access');

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Defaults | null>(null);
  const [brandGpRows, setBrandGpRows] = useState<BrandGpRow[]>([]);
  const savedRef = useRef<string | null>(null);

  useEffect(() => {
    apiFetch('/api/settings/business-customers')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        const v = d[scope] as Defaults;
        const rows: BrandGpRow[] = (d.brand_gp_overrides || []).map((r: Record<string, unknown>) => ({
          brand_id: r.brand_id as string,
          gp_rate: String(r.gp_rate),
          gp_base_price: ((r.gp_base_price as string) || 'retail') as 'retail' | 'discounted',
        }));
        setValues(v);
        setBrandGpRows(rows);
        savedRef.current = JSON.stringify({ v, rows });
      })
      .finally(() => setLoading(false));
  }, [scope]);

  const dirty = values !== null
    && savedRef.current !== null
    && JSON.stringify({ v: values, rows: brandGpRows }) !== savedRef.current;

  const patch = (p: Partial<Defaults>) => setValues(prev => (prev ? { ...prev, ...p } : prev));

  const save = async () => {
    if (!values) return;
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings/business-customers', {
        method: 'PUT',
        body: JSON.stringify({
          [scope]: values,
          ...(meta.ownsBrandGp
            ? { brand_gp_overrides: brandGpRows.map(r => ({
                brand_id: r.brand_id,
                gp_rate: Number(r.gp_rate) || 0,
                gp_base_price: r.gp_base_price,
              })) }
            : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        showToast(err.error || 'บันทึกไม่สำเร็จ', 'error');
        return;
      }
      savedRef.current = JSON.stringify({ v: values, rows: brandGpRows });
      showToast('บันทึกการตั้งค่าแล้ว', 'success');
    } finally {
      setSaving(false);
    }
  };

  if (!canEdit && !loading) {
    return <Layout><NoPermissionCard subtitle="เฉพาะเจ้าของและผู้ดูแลระบบเท่านั้น" /></Layout>;
  }

  return (
    <Layout>
      <Container size="full">
        <PageHeader title={meta.title} subtitle={meta.subtitle} />
        <GeneralSettingsTabs active={meta.tab} />

        {loading || !values ? (
          <LoadingCard />
        ) : (
          <div className="flex flex-col gap-4">
            <Card className="card-p-lg">
              <h3 className="heading-3 mb-3">{meta.gpLabel}</h3>
              <GpOverridePanel
                mode="global"
                gpRate={values.default_gp_rate}
                gpBasePrice={values.default_gp_base_price}
                onGpRateChange={(v) => patch({ default_gp_rate: v })}
                onGpBasePriceChange={(v) => patch({ default_gp_base_price: v })}
                brandGpRows={brandGpRows}
                onBrandGpRowsChange={setBrandGpRows}
                canEdit={canEdit}
              />

              {!meta.ownsBrandGp && (
                <Alert tone="info" className="mt-4">
                  GP% เฉพาะแบรนด์เป็นค่าร่วมของทั้งระบบ — แก้ได้ที่แท็บ “ลูกค้าตัวแทน”
                  แล้วมีผลกับห้างด้วย เพราะเป็นเรทของแบรนด์ ไม่ใช่ของประเภทลูกค้า
                </Alert>
              )}
            </Card>

            {/* รอบวางบิลของกลุ่มนี้ — ตัวแทนกับห้างวางบิลคนละรอบกันจริงในธุรกิจ
                (ห้างมักกลางเดือน ตัวแทนมักสิ้นเดือน) จึงตั้งแยกกัน
                และของจริงยังต่างกันรายลูกค้าอีกชั้น — ที่นี่เป็นแค่ค่าตั้งต้น */}
            <Card className="card-p-lg">
              <h3 className="heading-3 mb-1">รอบวางบิล</h3>
              <p className="section-desc mb-4">
                ค่าตั้งต้นของกลุ่มนี้ — {meta.perCustomerHint}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                <UnitNumberField
                  label="วางบิลทุกวันที่"
                  value={values.statement_day}
                  onChange={(n) => patch({ statement_day: Math.min(Math.max(n || 31, 1), 31) })}
                  hint="31 = สิ้นเดือน · เดือนที่สั้นกว่าร่นมาเป็นวันสุดท้ายให้เอง"
                  min={1} max={31}
                />
                <UnitNumberField
                  label="ชำระภายใน"
                  value={values.credit_days}
                  onChange={(n) => patch({ credit_days: Math.min(Math.max(n ?? 30, 0), 180) })}
                  unit="วัน" hint="นับจากวันวางบิล ไม่ใช่วันที่กดยืนยัน"
                  min={0} max={180}
                />
              </div>
            </Card>

            {meta.hasReportTerms && (
              <Card className="card-p-lg">
                <h3 className="heading-3 mb-1">เงื่อนไขการแจ้งยอด</h3>
                <p className="section-desc mb-4">
                  ตัวแทนต้องแจ้งยอดที่ขายได้ภายในกี่วัน ระบบถึงจะออกใบกำกับให้ (สัญญา ม.78(3))
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
                  <UnitNumberField
                    label="ส่งยอดภายใน"
                    value={values.default_report_due_days ?? 15}
                    onChange={(n) => patch({ default_report_due_days: n || 15 })}
                    unit="วัน" hint="หลังสิ้นเดือน"
                    min={1} max={90}
                  />
                  <UnitNumberField
                    label="ชำระภายใน (สัญญาฝากขาย)"
                    value={values.default_payment_terms ?? 30}
                    onChange={(n) => patch({ default_payment_terms: n })}
                    unit="วัน" hint="ใช้แทนเครดิตด้านบนเมื่อเป็นตัวแทนฝากขาย"
                    min={0} max={180}
                  />
                </div>
              </Card>
            )}

            <Card className="card-p-lg">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="heading-3">{meta.vatLabel}</h3>
                  <p className="section-desc">ถ้าปิด = ราคาที่ตกลงยังไม่รวม VAT</p>
                </div>
                <Toggle
                  checked={values.vat_included}
                  onChange={() => patch({ vat_included: !values.vat_included })}
                  disabled={!canEdit}
                />
              </div>
            </Card>
          </div>
        )}

        {canEdit && (
          <StickyActionBar saving={saving} dirty={dirty} onSave={save} onCancel={() => window.location.reload()} />
        )}
      </Container>
    </Layout>
  );
}
