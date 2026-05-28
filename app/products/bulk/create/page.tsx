'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { useFeatures } from '@/lib/features-context';
import { useToast } from '@/lib/toast-context';
import { apiFetch } from '@/lib/api-client';
import {
  readFileToRows, rowsToSheet, getCell, isRowEmpty, isInstructionRow,
  validateHeaders, type RequiredColumn,
} from '@/lib/bulk/parse-template';
import { addTemplateHeader } from '@/lib/bulk/excel-template';
import {
  STATUS_COLUMN_HEADER, STATUS_INSTRUCTION,
  STATUS_LABEL_ACTIVE, STATUS_LABEL_INACTIVE, parseStatusValue,
} from '@/lib/bulk/status-enum';

import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal, { type BulkErrorReport } from '@/components/bulk/BulkErrorModal';

import {
  AlertCircle, PackagePlus, FileSpreadsheet,
} from 'lucide-react';

interface CreateItem {
  code: string;
  name?: string;
  variation_label?: string;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  brand_name?: string;
  category_name?: string;
  description?: string;
  is_active?: boolean;
  __rowNum?: number;
}

interface ResultRow {
  code: string;
  name: string;
  action: 'created' | 'error';
  product_id?: string;
  variation_count?: number;
  is_multi?: boolean;
  brand_name?: string;
  category_name?: string;
  error?: string;
}

interface RunResponse {
  dry_run: boolean;
  results: ResultRow[];
  summary: { total: number; created: number; errors: number };
}

export default function BulkCreateProductsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles } = useCompany();
  const { features } = useFeatures();
  const { showToast } = useToast();
  const brandEnabled = features.product_brand;

  const isAdmin = companyRoles.includes('owner') || companyRoles.includes('admin');
  const canEditCost = userProfile?.canViewCost === true;

  const [step, setStep] = useState<'upload' | 'checking' | 'preview' | 'importing' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<CreateItem[]>([]);
  const [dryRun, setDryRun] = useState<RunResponse | null>(null);
  const [finalRun, setFinalRun] = useState<RunResponse | null>(null);
  const [errorReport, setErrorReport] = useState<BulkErrorReport | null>(null);

  // Cost column is permission-gated AND user-toggleable. Default = include when the
  // user has permission. The toggle controls both the download template column AND
  // the import parser so the exported file shape matches what the importer reads.
  const [includeCost, setIncludeCost] = useState<boolean>(canEditCost);
  const costInTemplate = canEditCost && includeCost;

  // Brand + category names for pre-validation (catches "ไม่พบแบรนด์/หมวดหมู่"
  // before sending to RPC, so all errors surface in one modal).
  // `optionsLoaded` gates the upload button so we never miss a lookup error
  // due to a race between the fetch and the user clicking upload.
  const [brandNames, setBrandNames] = useState<Set<string>>(new Set());
  const [categoryNames, setCategoryNames] = useState<Set<string>>(new Set());
  const [optionsLoaded, setOptionsLoaded] = useState(false);

  useEffect(() => {
    if (!userProfile) return;
    (async () => {
      try {
        const tasks: Promise<Response>[] = [apiFetch('/api/categories')];
        if (brandEnabled) tasks.push(apiFetch('/api/brands'));
        const [catRes, brRes] = await Promise.all(tasks);

        // Categories API returns nested {data: [{id, name, children: [{id, name, ...}]}]}.
        // Walk recursively to collect all names (parents + children).
        type CatNode = { id: string; name: string; children?: CatNode[] };
        const catData = await catRes.json();
        const catRoot: CatNode[] = catData.data || catData.categories || [];
        const allCatNames: string[] = [];
        const walk = (nodes: CatNode[]) => {
          for (const n of nodes) {
            if (n.name) allCatNames.push(n.name);
            if (n.children?.length) walk(n.children);
          }
        };
        walk(catRoot);
        setCategoryNames(new Set(allCatNames));

        if (brRes) {
          const brData = await brRes.json();
          const brs: { id: string; name: string }[] = brData.data || brData.brands || [];
          setBrandNames(new Set(brs.map(b => b.name)));
        }
      } catch (err) {
        console.error('load brands/categories error:', err);
      } finally {
        setOptionsLoaded(true);
      }
    })();
  }, [userProfile, brandEnabled]);

  // Group parsed variations by product code so the preview can show actual
  // variation_label / SKU / Barcode rows instead of just a count.
  const parsedByCode = useMemo(() => {
    const map = new Map<string, CreateItem[]>();
    for (const it of parsedItems) {
      if (!it.code) continue;
      const list = map.get(it.code) || [];
      list.push(it);
      map.set(it.code, list);
    }
    return map;
  }, [parsedItems]);

  // Required column headers (presence required, values usually optional). Guards
  // against users who accidentally delete columns from the template.
  const requiredHeaders = useMemo<RequiredColumn[]>(() => {
    const list: RequiredColumn[] = [
      { aliases: ['รหัสสินค้า*', 'รหัสสินค้า', 'code'], label: 'รหัสสินค้า' },
      { aliases: ['ชื่อสินค้า*', 'ชื่อสินค้า', 'name'], label: 'ชื่อสินค้า' },
      { aliases: ['ตัวเลือก', 'variation_label'], label: 'ตัวเลือก' },
      { aliases: ['SKU', 'sku'], label: 'SKU' },
      { aliases: ['Barcode', 'barcode'], label: 'Barcode' },
      { aliases: ['ราคาปกติ', 'default_price', 'price'], label: 'ราคาปกติ' },
      { aliases: ['ราคาขาย', 'discount_price', 'discount'], label: 'ราคาขาย' },
    ];
    if (costInTemplate) {
      list.push({ aliases: ['ราคาทุน', 'cost_price', 'cost'], label: 'ราคาทุน' });
    }
    if (brandEnabled) {
      list.push({ aliases: ['แบรนด์', 'brand_name', 'brand'], label: 'แบรนด์' });
    }
    list.push({ aliases: ['หมวดหมู่', 'category_name', 'category'], label: 'หมวดหมู่' });
    list.push({ aliases: ['คำอธิบาย', 'description'], label: 'คำอธิบาย' });
    return list;
  }, [costInTemplate, brandEnabled]);

  const handleDownloadTemplate = async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('new-products');

    const headers = [
      'รหัสสินค้า*',
      'ชื่อสินค้า*',
      STATUS_COLUMN_HEADER,
      'ประเภท',
      'ตัวเลือก',
      'SKU',
      'Barcode',
      'ราคาปกติ',
      'ราคาขาย',
      ...(costInTemplate ? ['ราคาทุน'] : []),
      ...(brandEnabled ? ['แบรนด์'] : []),
      'หมวดหมู่',
      'คำอธิบาย',
    ];

    type Row = (string | number)[];
    const optionalCols = (cost: string, brand: string): Row =>
      [...(costInTemplate ? [cost] : []), ...(brandEnabled ? [brand] : [])];

    const instructions: string[] = [
      '(จำเป็น)',
      '(จำเป็น)',
      STATUS_INSTRUCTION,
      '(สินค้าปกติ = 1 แถว / สินค้าย่อย = หลายแถวรหัสเดียวกัน)',
      '(ใส่ "-" ถ้าไม่มี)',
      '(ไม่บังคับ)',
      '(ไม่บังคับ)',
      '(ค่าว่าง = 0)',
      '(ค่าว่าง = 0)',
      ...(costInTemplate ? ['(ค่าว่าง = 0)'] : []),
      ...(brandEnabled ? ['(ชื่อต้องตรงในระบบ — ไม่ตรง = error)'] : []),
      '(ชื่อต้องตรงในระบบ — ไม่ตรง = error)',
      '(หลายบรรทัดได้)',
    ];
    addTemplateHeader(ws, headers, instructions);

    const samples: Row[] = [
      ['P001', 'กางเกงยีนส์ ทรงสลิม', STATUS_LABEL_ACTIVE,   'สินค้าปกติ', '-',     'JN-001',  '8850010', 890, 790, ...optionalCols('450', 'Brand A'), 'เสื้อผ้า',         'ทรงตรง กระเป๋าหลัง 2 ใบ'],
      ['P002', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE,   'สินค้าย่อย', 'ไซส์ M', 'TS-M',    '8850020', 350, 299, ...optionalCols('180', 'Brand A'), 'เสื้อผ้า',         'เนื้อผ้าคอตตอน 100%'],
      ['P002', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE,   'สินค้าย่อย', 'ไซส์ L', 'TS-L',    '8850021', 350, 299, ...optionalCols('180', ''),         '',                   ''],
      ['P003', 'กระเป๋าผ้าแคนวาส',     STATUS_LABEL_INACTIVE, 'สินค้าปกติ', '-',     'BAG-001', '8850030', 450, 399, ...optionalCols('200', 'Brand B'), 'กระเป๋า',           'ยังไม่พร้อมขาย — รอผลิตล็อตใหม่'],
      ['P004', 'แก้วเซรามิก Premium',  STATUS_LABEL_ACTIVE,   'สินค้าย่อย', 'สีขาว',  'MUG-WHT', '8850040', 220, 199, ...optionalCols('90',  'Brand C'), 'ของใช้ในบ้าน',     ''],
      ['P004', 'แก้วเซรามิก Premium',  STATUS_LABEL_ACTIVE,   'สินค้าย่อย', 'สีดำ',   'MUG-BLK', '8850041', 220, 199, ...optionalCols('90',  ''),         '',                   ''],
      ['P004', 'แก้วเซรามิก Premium',  STATUS_LABEL_ACTIVE,   'สินค้าย่อย', 'สีฟ้า',  'MUG-BLU', '8850042', 220, 199, ...optionalCols('90',  ''),         '',                   ''],
    ];
    samples.forEach(s => {
      const row = ws.addRow(s);
      row.getCell(headers.length).alignment = { wrapText: true, vertical: 'top' };
    });

    const colWidths = [16, 44, 10, 20, 16, 16, 16, 12, 12];
    if (costInTemplate) colWidths.push(12);
    if (brandEnabled) colWidths.push(20);
    colWidths.push(20, 60);
    ws.columns = colWidths.map(w => ({ width: w }));

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `product-create-template.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const handleFile = async (file: File) => {
    setErrorReport(null);

    const headerIssues: string[] = [];
    const rowIssues: string[] = [];
    const otherIssues: string[] = [];

    let raw: string[][];
    try {
      raw = await readFileToRows(file);
    } catch (err) {
      console.error('read error:', err);
      setErrorReport({
        headerIssues: [],
        rowIssues: [],
        otherIssues: [
          `อ่านไฟล์ไม่สำเร็จ: ${err instanceof Error ? err.message : 'unknown'}`,
          'รองรับเฉพาะไฟล์ .xlsx, .xls, .csv',
        ],
      });
      return;
    }

    const sheet = rowsToSheet(raw);
    if (sheet.headers.length === 0 || sheet.rows.length === 0) {
      setErrorReport({
        headerIssues: [],
        rowIssues: [],
        otherIssues: ['ไฟล์ว่างเปล่า — ต้องมี header (แถว 1) + ข้อมูลอย่างน้อย 1 แถว'],
      });
      return;
    }

    // 1. Validate ALL required column headers — collect missing, don't early-return
    const v = validateHeaders(sheet.headers, requiredHeaders);
    if (!v.ok) {
      for (const m of v.missing) {
        headerIssues.push(`column "${m}" หายไป`);
      }
    }

    const hasCostCol = sheet.headers.some(h => h && (h.includes('ราคาทุน') || h.toLowerCase().includes('cost')));
    const items: CreateItem[] = [];
    // Aggregate unknown brand/category names so we show one summary line per unique
    // value instead of repeating the same error for every row that uses it.
    const unknownBrands = new Set<string>();
    const unknownCategories = new Set<string>();

    try {
      for (let i = 0; i < sheet.rows.length; i++) {
        const row = sheet.rows[i];
        if (isRowEmpty(row)) continue;
        if (isInstructionRow(row)) continue;

        const rowNum = i + 2;
        const code = getCell(row, 'รหัสสินค้า*', 'รหัสสินค้า', 'code');
        const name = getCell(row, 'ชื่อสินค้า*', 'ชื่อสินค้า', 'name');

        if (!code && !name) continue;
        if (!code) {
          rowIssues.push(`แถว ${rowNum}: ไม่มีรหัสสินค้า`);
          continue;
        }
        if (!name) {
          rowIssues.push(`แถว ${rowNum}: ไม่มีชื่อสินค้า (รหัส "${code}")`);
          continue;
        }

        const numericChecks: Array<{ key: string; label: string }> = [
          { key: 'ราคาปกติ', label: 'ราคาปกติ' },
          { key: 'ราคาขาย', label: 'ราคาขาย' },
        ];
        if (canEditCost && includeCost && hasCostCol) {
          numericChecks.push({ key: 'ราคาทุน', label: 'ราคาทุน' });
        }
        let badNumeric = false;
        for (const c of numericChecks) {
          const raw = getCell(row, c.key, c.label);
          if (raw && Number.isNaN(Number(raw))) {
            rowIssues.push(`แถว ${rowNum}: ${c.label} "${raw}" ไม่ใช่ตัวเลข`);
            badNumeric = true;
          }
        }
        if (badNumeric) continue;

        const item: CreateItem = { code, name: name || code, __rowNum: rowNum };
        // Status: read from "สถานะ" (current header) or legacy "ใช้งาน" for files
        // generated before standardization. parseStatusValue handles both labels.
        const statusRaw = getCell(row, 'สถานะ', 'ใช้งาน', 'status', 'active', 'is_active');
        const parsedActive = parseStatusValue(statusRaw);
        if (parsedActive === false) item.is_active = false;
        const vlabel = getCell(row, 'ตัวเลือก', 'variation_label');
        if (vlabel) item.variation_label = vlabel;
        const sku = getCell(row, 'SKU', 'sku');
        if (sku) item.sku = sku;
        const barcode = getCell(row, 'Barcode', 'barcode');
        if (barcode) item.barcode = barcode;
        const def = getCell(row, 'ราคาปกติ', 'default_price', 'price');
        if (def !== '') item.default_price = Number(def);
        const disc = getCell(row, 'ราคาขาย', 'discount_price', 'discount');
        if (disc !== '') item.discount_price = Number(disc);
        if (canEditCost && includeCost && hasCostCol) {
          const cost = getCell(row, 'ราคาทุน', 'cost_price', 'cost');
          if (cost !== '') item.cost_price = Number(cost);
        }
        if (brandEnabled) {
          const brand = getCell(row, 'แบรนด์', 'brand_name', 'brand');
          if (brand) {
            item.brand_name = brand;
            // `optionsLoaded` (not size > 0) is the right guard — a company
            // with 0 brands should still flag every brand value as invalid.
            if (optionsLoaded && !brandNames.has(brand)) unknownBrands.add(brand);
          }
        }
        const cat = getCell(row, 'หมวดหมู่', 'category_name', 'category');
        if (cat) {
          item.category_name = cat;
          if (optionsLoaded && !categoryNames.has(cat)) unknownCategories.add(cat);
        }
        const desc = getCell(row, 'คำอธิบาย', 'description');
        if (desc) item.description = desc;

        items.push(item);
      }
    } catch (err) {
      console.error('parse error:', err);
      otherIssues.push(`เกิดข้อผิดพลาดตอนอ่านข้อมูล: ${err instanceof Error ? err.message : 'unknown'}`);
    }

    // Aggregate brand/category lookup failures — 1 line per unique unknown name
    if (unknownBrands.size > 0) {
      const names = [...unknownBrands].map(n => `"${n}"`).join(', ');
      rowIssues.push(`ไม่พบแบรนด์ในระบบ: ${names} — สร้างใน "ตั้งค่า > แบรนด์" ก่อน`);
    }
    if (unknownCategories.size > 0) {
      const names = [...unknownCategories].map(n => `"${n}"`).join(', ');
      rowIssues.push(`ไม่พบหมวดหมู่ในระบบ: ${names} — สร้างใน "ตั้งค่า > หมวดหมู่" ก่อน`);
    }

    if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
      otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีรหัสสินค้า + ชื่อสินค้า ในแถวข้อมูล');
    }

    if (headerIssues.length > 0 || rowIssues.length > 0 || otherIssues.length > 0) {
      setErrorReport({ headerIssues, rowIssues, otherIssues });
      return;
    }

    setParsedItems(items);
    setStep('checking');

    try {
      const res = await apiFetch('/api/products/bulk/create/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items, dry_run: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorReport({
          headerIssues: [],
          rowIssues: [],
          otherIssues: [data.error || 'ตรวจสอบไม่สำเร็จ — ลองอีกครั้ง'],
        });
        setStep('upload');
        return;
      }
      setDryRun(data);
      setStep('preview');
    } catch (err) {
      console.error('dry-run error:', err);
      setErrorReport({
        headerIssues: [],
        rowIssues: [],
        otherIssues: ['เชื่อมต่อ server ไม่ได้ — ลองอีกครั้ง'],
      });
      setStep('upload');
    }
  };

  const handleConfirmImport = async () => {
    setStep('importing');
    try {
      const res = await apiFetch('/api/products/bulk/create/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: parsedItems, dry_run: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || 'บันทึกไม่สำเร็จ', 'error');
        setStep('preview');
        return;
      }
      setFinalRun(data);
      setStep('done');
      const parts: string[] = [];
      if (data.summary.created > 0) parts.push(`สร้างใหม่ ${data.summary.created}`);
      if (data.summary.errors > 0) parts.push(`ล้มเหลว ${data.summary.errors}`);
      showToast(parts.join(', ') || 'เสร็จสิ้น', data.summary.errors > 0 ? 'error' : 'success');
    } catch (err) {
      console.error('import error:', err);
      showToast('บันทึกไม่สำเร็จ', 'error');
      setStep('preview');
    }
  };

  const resetAll = () => {
    setStep('upload');
    setParsedItems([]);
    setDryRun(null);
    setFinalRun(null);
  };

  if (!userProfile) return null;

  if (!isAdmin) {
    return (
      <Layout>
        <NoPermissionCard />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-5xl space-y-6">
        <PageHeader
          title="เพิ่มสินค้าแบบชุด"
          subtitle="สร้างสินค้าใหม่หลายตัวพร้อมกันจากไฟล์ Excel"
          backHref="/products/bulk"
        />

        {step === 'upload' && (
          <div className="space-y-4">
            {canEditCost && (
              <Card padding="sm">
                <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    checked={includeCost}
                    onChange={(e) => setIncludeCost(e.target.checked)}
                    className="w-4 h-4 accent-[#F4511E]"
                  />
                  รวมคอลัมน์ <strong>ราคาทุน</strong> ใน Template
                </label>
              </Card>
            )}

            <BulkUploadCard
              title="ดาวน์โหลด Template → กรอกข้อมูล → อัพโหลด"
              subtitle="สร้างสินค้าใหม่ — ห้ามใช้กับสินค้าที่มีอยู่แล้ว"
              onFile={handleFile}
              onDownloadTemplate={handleDownloadTemplate}
              disabled={!optionsLoaded}
              help={
                <>
                  <p className="font-medium text-gray-800 dark:text-slate-300 mb-2">วิธีใช้:</p>
                  <ul className="space-y-1 list-disc list-inside">
                    <li><strong>1 แถว = 1 ตัวเลือกสินค้า</strong> (variation)</li>
                    <li>สินค้าปกติ (มีตัวเลือกเดียว) → ใส่ <code>-</code> ใน column &quot;ตัวเลือก&quot;</li>
                    <li>สินค้าหลายตัวเลือก (เช่น สี/ไซส์) → ใส่หลายแถวที่มี <strong>รหัสสินค้าเดียวกัน</strong> + ตัวเลือกต่างกัน</li>
                    <li>
                      {brandEnabled ? 'แบรนด์/หมวดหมู่' : 'หมวดหมู่'}: <strong>ชื่อต้องตรงกับที่มีในระบบ</strong>{' '}
                      — ถ้าไม่ตรง <strong className="text-red-600 dark:text-red-400">แถวนั้นจะ error</strong>{' '}
                      | เว้นว่าง = ไม่มี (สร้างได้ปกติ)
                    </li>
                    <li>คำอธิบาย: ใส่หลายบรรทัดได้</li>
                    <li>ถ้ารหัสสินค้ามีอยู่แล้ว → แถวนั้นจะ error (ใช้ &quot;แก้ไขข้อมูลพื้นฐาน&quot; แทน)</li>
                  </ul>
                  <div className="mt-3 p-2.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-300">
                    <FileSpreadsheet className="inline w-3 h-3 mr-1" />
                    Template มี <strong>แถวคำอธิบาย</strong> (สีเทา ใต้ header) + <strong>ตัวอย่าง 4 สินค้า</strong> — ลบตัวอย่างก่อนกรอกข้อมูลจริง
                  </div>
                </>
              }
            />
          </div>
        )}

        {step === 'checking' && (
          <LoadingCard title="กำลังตรวจสอบข้อมูล..." subtitle={`${parsedItems.length} แถว`} />
        )}

        {step === 'preview' && dryRun && (
          <div className="space-y-4">
            <BulkPreviewBar
              title="ตรวจสอบรายการก่อนสร้าง"
              icon={<PackagePlus className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <PackagePlus className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
                    </span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertCircle className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
                    </span>
                  )}
                </>
              }
              confirmLabel="ยืนยันสร้าง"
              confirmDisabled={!dryRun || dryRun.summary.created === 0}
              onConfirm={handleConfirmImport}
              onCancel={resetAll}
            />

            {dryRun.results.length > 0 ? (
              <>
                {/* Desktop: table */}
                <div className="hidden md:block bg-white dark:bg-slate-800 rounded-lg shadow-sm overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="data-thead">
                      <tr>
                        <th className="data-th w-20">รหัส</th>
                        <th className="data-th">ชื่อสินค้า</th>
                        <th className="data-th">ตัวเลือก / SKU / Barcode</th>
                        <th className="data-th">แบรนด์ / หมวดหมู่</th>
                      </tr>
                    </thead>
                    <tbody className="data-tbody">
                      {dryRun.results.map((r, i) => {
                        const variations = parsedByCode.get(r.code) || [];
                        const isError = r.action === 'error';
                        return (
                          <tr key={i} className={isError ? 'bg-red-50 dark:bg-red-900/10' : ''}>
                            <td className="px-4 py-3 align-top font-mono text-xs text-gray-500">{r.code}</td>
                            <td className="px-4 py-3 align-top">
                              <div className="text-gray-900 dark:text-white font-medium">{r.name}</div>
                              {isError && r.error && (
                                <div className="text-xs text-red-600 dark:text-red-400 mt-1">⚠ {r.error}</div>
                              )}
                            </td>
                            <td className="px-4 py-3 align-top">
                              {variations.length > 0 ? (
                                <ul className="space-y-1">
                                  {variations.map((v, vi) => (
                                    <li key={vi} className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                                      <span className="text-gray-700 dark:text-slate-300 font-medium min-w-[60px]">
                                        {v.variation_label || '-'}
                                      </span>
                                      <span className="font-mono text-gray-500">
                                        {v.sku || <span className="text-gray-300">—</span>}
                                      </span>
                                      <span className="font-mono text-gray-400">
                                        {v.barcode || <span className="text-gray-300">—</span>}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              ) : <span className="text-gray-400 text-xs">—</span>}
                            </td>
                            <td className="px-4 py-3 align-top text-xs text-gray-600 dark:text-slate-400">
                              {r.brand_name && <div>🏷️ {r.brand_name}</div>}
                              {r.category_name && <div>📁 {r.category_name}</div>}
                              {!r.brand_name && !r.category_name && <span className="text-gray-400">—</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile: cards */}
                <div className="md:hidden space-y-3">
                  {dryRun.results.map((r, i) => {
                    const variations = parsedByCode.get(r.code) || [];
                    const isError = r.action === 'error';
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border p-3 ${
                          isError
                            ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/10'
                            : 'border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-mono text-xs text-gray-500">{r.code}</span>
                          {isError && (
                            <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-900/30 px-2 py-0.5 rounded-full">
                              <AlertCircle className="w-3 h-3" /> Error
                            </span>
                          )}
                        </div>
                        <div className="text-gray-900 dark:text-white font-medium mb-2">{r.name}</div>
                        {isError && r.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mb-2">⚠ {r.error}</div>
                        )}
                        {variations.length > 0 && (
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded p-2 space-y-1 mb-2">
                            {variations.map((v, vi) => (
                              <div key={vi} className="text-xs flex flex-wrap gap-x-2">
                                <span className="font-medium text-gray-700 dark:text-slate-300">
                                  {v.variation_label || '-'}
                                </span>
                                <span className="font-mono text-gray-500">{v.sku || '—'}</span>
                                <span className="font-mono text-gray-400">{v.barcode || '—'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {(r.brand_name || r.category_name) && (
                          <div className="text-xs text-gray-600 dark:text-slate-400">
                            {r.brand_name && <div>🏷️ {r.brand_name}</div>}
                            {r.category_name && <div>📁 {r.category_name}</div>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <EmptyCard title="ไม่พบรายการในไฟล์" />
            )}
          </div>
        )}

        {step === 'importing' && <LoadingCard title="กำลังสร้างสินค้า..." />}

        {step === 'done' && finalRun && (
          <DoneCard
            hasErrors={finalRun.summary.errors > 0}
            summary={
              <>
                {finalRun.summary.created > 0 && (
                  <span className="text-emerald-600 font-medium">{finalRun.summary.created} สร้างใหม่</span>
                )}
                {finalRun.summary.errors > 0 && (
                  <span className="text-red-600 font-medium">{finalRun.summary.errors} ล้มเหลว</span>
                )}
              </>
            }
            actions={
              <>
                <Button variant="primary" onClick={() => router.push('/products')}>
                  ไปหน้าสินค้า
                </Button>
                <Button variant="secondary" onClick={resetAll}>
                  อัพโหลดเพิ่ม
                </Button>
              </>
            }
          />
        )}
      </div>

      <BulkErrorModal
        report={errorReport}
        onClose={() => setErrorReport(null)}
        onDownloadTemplate={handleDownloadTemplate}
      />
    </Layout>
  );
}
