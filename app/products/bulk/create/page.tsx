'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/lib/auth-context';
import { useCompany } from '@/lib/company-context';
import { can } from '@/lib/permissions';
import { useFeatures } from '@/lib/features-context';
import { apiFetch } from '@/lib/api-client';
import {
  getCell, isRowEmpty, isInstructionRow,
  validateHeaders, type RequiredColumn, type ParsedSheet,
} from '@/lib/bulk/parse-template';
import { useBulkApply, type ParseOutcome } from '@/lib/bulk/use-bulk-apply';
import { addTemplateHeader } from '@/lib/bulk/excel-template';
import {
  COMPOSITE_COLUMN_HEADER, COMPOSITE_COLUMN_ALIASES, COMPOSITE_TYPE_LABEL, parseComponentCell,
} from '@/lib/bulk/composite-ref';
import { formatPrice } from '@/lib/utils/format';
import {
  STATUS_COLUMN_HEADER, STATUS_INSTRUCTION,
  STATUS_LABEL_ACTIVE, parseStatusValue,
} from '@/lib/bulk/status-enum';

import Button from '@/components/ui/Button';
import PageHeader from '@/components/ui/PageHeader';
import { LoadingCard, EmptyCard, NoPermissionCard, DoneCard } from '@/components/ui/StateCard';
import Badge from '@/components/ui/Badge';
import BulkUploadCard from '@/components/bulk/BulkUploadCard';
import BulkPreviewBar from '@/components/bulk/BulkPreviewBar';
import BulkErrorModal from '@/components/bulk/BulkErrorModal';
import IncludeCostToggle from '@/components/bulk/IncludeCostToggle';
import { downloadBlob } from '@/lib/utils/download';

import { FileSpreadsheet } from 'lucide-react';
import { AlertIcon } from '@/lib/icons';
import { ProductIcon } from '@/lib/icons';

interface CreateItem {
  code: string;
  name?: string;
  variation_label?: string;
  /** key = variation_type name (e.g. "สี"), value = the choice (e.g. "ขาว").
   *  RPC uses these keys to resolve / auto-create variation_types per company
   *  and to set products.selected_variation_types + product_variations.attributes. */
  attributes?: Record<string, string>;
  sku?: string;
  barcode?: string;
  default_price?: number;
  discount_price?: number;
  cost_price?: number;
  brand_name?: string;
  category_name?: string;
  description?: string;
  is_active?: boolean;
  /** composite product (สินค้าชุด) row: "SKU1 + SKU2×2" — resolved on the server */
  components?: string;
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
  is_composite?: boolean;
}

// หน้าฝั่ง "สร้างใหม่" นับผลเป็น created — ประกาศไว้เองเพื่ออ่านตัวเลขได้โดยไม่ต้องเช็ค null
interface CreateSummary { total: number; created: number; errors: number }

/** บริบทที่ตัวแปลงชีตต้องรู้ — มาจาก state/สิทธิ์/ฟีเจอร์ของหน้า */
interface ParseContext {
  requiredHeaders: RequiredColumn[];
  canEditCost: boolean;
  includeCost: boolean;
  brandEnabled: boolean;
  /** ชื่อแบรนด์/หมวดที่มีจริงในระบบ — ใช้ตรวจว่าไฟล์อ้างของที่ไม่มี */
  brandNames: Set<string>;
  categoryNames: Set<string>;
  /** โหลดรายการอ้างอิงเสร็จหรือยัง — **ต้องใช้ตัวนี้ ไม่ใช่ `size > 0`**
   *  ร้านที่ยังไม่มีแบรนด์สักอันก็ต้องฟ้องทุกค่าที่กรอกมา ไม่ใช่ปล่อยผ่าน */
  optionsLoaded: boolean;
}

/**
 * แปลงชีตเป็นรายการสินค้าที่จะสร้าง — ตัวที่ซับซ้อนสุดในบรรดาหน้า bulk
 * รวมสินค้าชุด · ตัวเลือก 2 มิติ · ตรวจชื่อแบรนด์/หมวดกับของจริงในระบบ
 * ⛔ อ่านตามชื่อ header เสมอ (`getCell`) ห้ามอ่านตามตำแหน่งคอลัมน์
 */
function parseSheet(sheet: ParsedSheet, ctx: ParseContext): ParseOutcome<CreateItem> {
  const { requiredHeaders, canEditCost, includeCost, brandEnabled, brandNames, categoryNames, optionsLoaded } = ctx;
  const headerIssues: string[] = [];
  const rowIssues: string[] = [];
  const otherIssues: string[] = [];

  // เก็บ header ที่ขาดให้ครบก่อน ไม่ early-return ทีละตัว
  const v = validateHeaders(sheet.headers, requiredHeaders);
  if (!v.ok) for (const m of v.missing) headerIssues.push(`column "${m}" หายไป`);

  const hasCostCol = sheet.headers.some(h => h && (h.includes('ราคาทุน') || h.toLowerCase().includes('cost')));
  const items: CreateItem[] = [];
  // รวมชื่อที่ไม่รู้จักเป็นบรรทัดเดียวต่อชื่อ แทนที่จะซ้ำทุกแถวที่ใช้ชื่อนั้น
  const unknownBrands = new Set<string>();
  const unknownCategories = new Set<string>();

  for (let i = 0; i < sheet.rows.length; i++) {
    const row = sheet.rows[i];
    if (isRowEmpty(row) || isInstructionRow(row)) continue;

    const rowNum = i + 2;
    const code = getCell(row, 'รหัสสินค้า*', 'รหัสสินค้า', 'code');
    const name = getCell(row, 'ชื่อสินค้า*', 'ชื่อสินค้า', 'name');

    if (!code && !name) continue;
    if (!code) { rowIssues.push(`แถว ${rowNum}: ไม่มีรหัสสินค้า`); continue; }
    if (!name) { rowIssues.push(`แถว ${rowNum}: ไม่มีชื่อสินค้า (รหัส "${code}")`); continue; }

    // แถวสินค้าชุด — คอลัมน์ตัวเลือกกับต้นทุนไม่มีผล (ต้นทุนมาจากชิ้นส่วน)
    const componentsRaw = getCell(row, ...COMPOSITE_COLUMN_ALIASES);
    if (componentsRaw) {
      const { error: componentsError } = parseComponentCell(componentsRaw);
      if (componentsError) { rowIssues.push(`แถว ${rowNum}: ${componentsError}`); continue; }
    }

    const numericChecks: Array<{ key: string; label: string }> = [
      { key: 'ราคาปกติ*', label: 'ราคาปกติ' },
      { key: 'ราคาขาย', label: 'ราคาขาย' },
    ];
    if (canEditCost && includeCost && hasCostCol && !componentsRaw) {
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
    // สถานะ: header ปัจจุบัน "สถานะ" หรือ "ใช้งาน" ของไฟล์รุ่นก่อนมาตรฐาน
    const parsedActive = parseStatusValue(getCell(row, 'สถานะ', 'ใช้งาน', 'status', 'active', 'is_active'));
    if (parsedActive === false) item.is_active = false;

    // ตัวเลือกได้ถึง 2 มิติ (เช่น สี + ขนาด) · คอลัมน์ "ตัวเลือก" เดี่ยวของเทมเพลตเก่ายังอ่านได้
    const type1 = getCell(row, 'ประเภทตัวเลือก 1', 'variation_type_1');
    const value1 = getCell(row, 'ตัวเลือก 1', 'ตัวเลือก', 'variation_value_1', 'variation_label');
    const type2 = getCell(row, 'ประเภทตัวเลือก 2', 'variation_type_2');
    const value2 = getCell(row, 'ตัวเลือก 2', 'variation_value_2');

    const attributes: Record<string, string> = {};
    if (type1 && value1 && value1 !== '-') attributes[type1] = value1;
    if (type2 && value2 && value2 !== '-') attributes[type2] = value2;

    if (componentsRaw) {
      item.components = componentsRaw;   // ป้ายของชุดย่อยสร้างจากชิ้นส่วนเอง
    } else if (Object.keys(attributes).length > 0) {
      item.attributes = attributes;
      item.variation_label = Object.values(attributes).join(' / ');
    } else if (value1 && value1 !== '-') {
      item.variation_label = value1;     // เทมเพลตเก่าที่ไม่มีคอลัมน์ประเภท
    }

    const sku = getCell(row, 'SKU', 'sku');
    if (sku) item.sku = sku;
    const barcode = getCell(row, 'Barcode', 'barcode');
    if (barcode) item.barcode = barcode;
    const def = getCell(row, 'ราคาปกติ*', 'ราคาปกติ', 'default_price', 'price');
    if (def !== '') item.default_price = Number(def);
    const disc = getCell(row, 'ราคาขาย', 'discount_price', 'discount');
    if (disc !== '') item.discount_price = Number(disc);
    if (canEditCost && includeCost && hasCostCol && !componentsRaw) {
      const cost = getCell(row, 'ราคาทุน', 'cost_price', 'cost');
      if (cost !== '') item.cost_price = Number(cost);
    }
    if (brandEnabled) {
      const brand = getCell(row, 'แบรนด์', 'brand_name', 'brand');
      if (brand) {
        item.brand_name = brand;
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

  if (unknownBrands.size > 0) {
    rowIssues.push(`ไม่พบแบรนด์ในระบบ: ${[...unknownBrands].map(n => `"${n}"`).join(', ')} — สร้างใน "ตั้งค่า > แบรนด์" ก่อน`);
  }
  if (unknownCategories.size > 0) {
    rowIssues.push(`ไม่พบหมวดหมู่ในระบบ: ${[...unknownCategories].map(n => `"${n}"`).join(', ')} — สร้างใน "ตั้งค่า > หมวดหมู่" ก่อน`);
  }
  if (items.length === 0 && rowIssues.length === 0 && headerIssues.length === 0) {
    otherIssues.push('ไม่พบรายการที่กรอกข้อมูล — ตรวจสอบว่ามีรหัสสินค้า + ชื่อสินค้า ในแถวข้อมูล');
  }

  return { items, issues: { headerIssues, rowIssues, otherIssues } };
}


export default function BulkCreateProductsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const { companyRoles, permissions } = useCompany();
  const { features } = useFeatures();
  const brandEnabled = features.product_brand;

  const isAdmin = can({ roles: companyRoles, permissions }, 'product.bulk_edit');
  const canEditCost = userProfile?.canViewCost === true;

  // flow อัปไฟล์ → dry-run → Apply อยู่ที่ hook กลาง (lib/bulk/use-bulk-apply)
  const {
    step, parsedItems, dryRun, finalRun, errorReport, clearErrorReport,
    handleFile, confirmImport: handleConfirmImport, reset: resetAll,
  } = useBulkApply<CreateItem, ResultRow, CreateSummary>({
    endpoint: '/api/products/bulk/create/apply',
    errorMode: 'modal',
    parse: sheet => parseSheet(sheet, {
      requiredHeaders, canEditCost, includeCost, brandEnabled,
      brandNames, categoryNames, optionsLoaded,
    }),
  });

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
      { aliases: ['ตัวเลือก 1', 'ตัวเลือก', 'variation_value_1', 'variation_label'], label: 'ตัวเลือก 1' },
      { aliases: ['SKU', 'sku'], label: 'SKU' },
      { aliases: ['Barcode', 'barcode'], label: 'Barcode' },
      { aliases: ['ราคาปกติ*', 'ราคาปกติ', 'default_price', 'price'], label: 'ราคาปกติ' },
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
      'ประเภทตัวเลือก 1',
      'ตัวเลือก 1',
      'ประเภทตัวเลือก 2',
      'ตัวเลือก 2',
      COMPOSITE_COLUMN_HEADER,
      'SKU',
      'Barcode',
      'ราคาปกติ*',
      'ราคาขาย',
      ...(costInTemplate ? ['ราคาทุน'] : []),
      ...(brandEnabled ? ['แบรนด์'] : []),
      'หมวดหมู่',
      'คำอธิบาย',
    ];

    type Row = (string | number)[];
    const optionalCols = (cost: string, brand: string): Row =>
      [...(costInTemplate ? [cost] : []), ...(brandEnabled ? [brand] : [])];

    const instructions: import('@/lib/bulk/excel-template').InstructionCell[] = [
      { text: 'จำเป็นต้องกรอก', required: true },
      { text: 'จำเป็นต้องกรอก', required: true },
      STATUS_INSTRUCTION,
      '(สินค้าปกติ = 1 แถว / สินค้าย่อย = หลายแถวรหัสเดียวกัน / สินค้าชุด = 1 แถวต่อชุดย่อย)',
      '(สินค้าย่อย: ใส่ชื่อประเภท เช่น สี, ขนาด — เว้นว่างถ้าสินค้าปกติ)',
      '(สินค้าย่อย: ค่าของประเภทตัวเลือก 1 เช่น ขาว, M)',
      '(ถ้าสินค้าย่อยมี 2 ประเภท — เช่น สี + ขนาด)',
      '(ค่าของประเภทตัวเลือก 2)',
      '(ค่าว่าง = สินค้าปกติ · สินค้าชุด: SKU ส่วนประกอบคั่นด้วย + เช่น MUG-WHT + TS-WM, 2 ชิ้นใส่ ×2 · ไม่ต้องใส่ตัวเลือก/ราคาทุน · ราคาว่าง = รวมราคาส่วนประกอบ, ใส่ราคา = ตั้งราคาเอง)',
      '(ไม่บังคับ)',
      '(ไม่บังคับ)',
      { text: 'จำเป็นต้องกรอก (ตัวเลข ≥ 0 · สินค้าชุดเว้นว่างได้)', required: true },
      '(ค่าว่าง = 0)',
      ...(costInTemplate ? ['(ค่าว่าง = 0)'] : []),
      ...(brandEnabled ? ['(ชื่อต้องตรงในระบบ — ไม่ตรง = error)'] : []),
      '(ชื่อต้องตรงในระบบ — ไม่ตรง = error)',
      '(หลายบรรทัดได้)',
    ];
    addTemplateHeader(ws, headers, instructions);

    // Samples — 4 patterns:
    //   - Simple product (1 row, no variation types)
    //   - Variable product with 1 variation type (สี)
    //   - Variable product with 2 variation types (สี + ขนาด)
    //   - Composite product (สินค้าชุด) built from the samples above — 1 row per combo,
    //     first combo priced automatically, second with a manual price
    const samples: Row[] = [
      ['P001', 'กางเกงยีนส์ ทรงสลิม', STATUS_LABEL_ACTIVE, 'สินค้าปกติ', '',    '',    '',     '',  '', 'JN-001',  '8850010', 890, 790, ...optionalCols('450', 'Brand A'), 'เสื้อผ้า',     'ทรงตรง กระเป๋าหลัง 2 ใบ'],
      ['P002', 'แก้วเซรามิก Premium', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ขาว', '',     '',  '', 'MUG-WHT', '8850040', 220, 199, ...optionalCols('90',  'Brand C'), 'ของใช้ในบ้าน', ''],
      ['P002', 'แก้วเซรามิก Premium', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ดำ',  '',     '',  '', 'MUG-BLK', '8850041', 220, 199, ...optionalCols('90',  ''),         '',             ''],
      ['P003', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ขาว', 'ขนาด', 'M', '', 'TS-WM',   '8850050', 350, 299, ...optionalCols('180', 'Brand A'), 'เสื้อผ้า',     'เนื้อผ้าคอตตอน 100%'],
      ['P003', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ขาว', 'ขนาด', 'L', '', 'TS-WL',   '8850051', 350, 299, ...optionalCols('180', ''),         '',             ''],
      ['P003', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ดำ',  'ขนาด', 'M', '', 'TS-BM',   '8850052', 350, 299, ...optionalCols('180', ''),         '',             ''],
      ['P003', 'เสื้อยืดผู้ชาย คอกลม', STATUS_LABEL_ACTIVE, 'สินค้าย่อย', 'สี',  'ดำ',  'ขนาด', 'L', '', 'TS-BL',   '8850053', 350, 299, ...optionalCols('180', ''),         '',             ''],
      ['SET01', 'ชุดของขวัญ แก้ว + เสื้อยืด', STATUS_LABEL_ACTIVE, COMPOSITE_TYPE_LABEL, '', '', '', '', 'MUG-WHT + TS-WM', 'SET-W', '', '',  '',  ...optionalCols('', 'Brand A'), 'ของใช้ในบ้าน', 'แก้วเซรามิก 1 ใบ + เสื้อยืด 1 ตัว'],
      ['SET01', 'ชุดของขวัญ แก้ว + เสื้อยืด', STATUS_LABEL_ACTIVE, COMPOSITE_TYPE_LABEL, '', '', '', '', 'MUG-BLK + TS-BM', 'SET-B', '', 550, '', ...optionalCols('', ''),        '',             ''],
    ];
    samples.forEach(s => {
      const row = ws.addRow(s);
      row.getCell(headers.length).alignment = { wrapText: true, vertical: 'top' };
    });

    const colWidths = [16, 44, 10, 20, 16, 14, 16, 14, 36, 14, 14, 12, 12];
    if (costInTemplate) colWidths.push(12);
    if (brandEnabled) colWidths.push(20);
    colWidths.push(20, 60);
    ws.columns = colWidths.map(w => ({ width: w }));

    ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    downloadBlob(blob, 'product-create-template.xlsx');
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
            <IncludeCostToggle
              visible={canEditCost}
              checked={includeCost}
              onChange={setIncludeCost}
            />

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
                    <li>
                      <strong>{COMPOSITE_TYPE_LABEL}</strong> → 1 แถวต่อชุดย่อย ใส่ SKU ของส่วนประกอบใน column &quot;{COMPOSITE_COLUMN_HEADER}&quot;
                      คั่นด้วย <code>+</code> (เช่น <code>MUG-WHT + TS-WM</code>, 2 ชิ้นใส่ <code>×2</code>) · ราคาว่าง = รวมราคาส่วนประกอบ
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
              icon={<ProductIcon className="w-5 h-5 text-emerald-600" />}
              badges={
                <>
                  {dryRun.summary.created > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-lg font-medium">
                      <ProductIcon className="w-3.5 h-3.5" /> สร้างใหม่ {dryRun.summary.created}
                    </span>
                  )}
                  {dryRun.summary.errors > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg font-medium">
                      <AlertIcon className="w-3.5 h-3.5" /> ข้อผิดพลาด {dryRun.summary.errors}
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
                              {r.is_composite && (
                                <div className="mt-1">
                                  <Badge tone="purple" size="sm">{COMPOSITE_TYPE_LABEL} · {r.variation_count ?? variations.length} ชุดย่อย</Badge>
                                </div>
                              )}
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
                                        {v.components || v.variation_label || '-'}
                                      </span>
                                      <span className="font-mono text-gray-500">
                                        {v.sku || <span className="text-gray-300">—</span>}
                                      </span>
                                      <span className="font-mono text-gray-400">
                                        {v.barcode || <span className="text-gray-300">—</span>}
                                      </span>
                                      {v.components && (
                                        <span className="text-gray-500">
                                          {v.default_price != null ? `ตั้งราคาเอง ฿${formatPrice(v.default_price)}` : 'ราคารวมส่วนประกอบ'}
                                        </span>
                                      )}
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
                            <Badge tone="red" size="sm" icon={<AlertIcon className="w-3 h-3" />}>Error</Badge>
                          )}
                        </div>
                        <div className="text-gray-900 dark:text-white font-medium mb-2">{r.name}</div>
                        {r.is_composite && (
                          <div className="mb-2">
                            <Badge tone="purple" size="sm">{COMPOSITE_TYPE_LABEL} · {r.variation_count ?? variations.length} ชุดย่อย</Badge>
                          </div>
                        )}
                        {isError && r.error && (
                          <div className="text-xs text-red-600 dark:text-red-400 mb-2">⚠ {r.error}</div>
                        )}
                        {variations.length > 0 && (
                          <div className="bg-gray-50 dark:bg-slate-700/30 rounded p-2 space-y-1 mb-2">
                            {variations.map((v, vi) => (
                              <div key={vi} className="text-xs flex flex-wrap gap-x-2">
                                <span className="font-medium text-gray-700 dark:text-slate-300">
                                  {v.components || v.variation_label || '-'}
                                </span>
                                <span className="font-mono text-gray-500">{v.sku || '—'}</span>
                                <span className="font-mono text-gray-400">{v.barcode || '—'}</span>
                                {v.components && (
                                  <span className="text-gray-500">
                                    {v.default_price != null ? `ตั้งราคาเอง ฿${formatPrice(v.default_price)}` : 'ราคารวมส่วนประกอบ'}
                                  </span>
                                )}
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
        onClose={clearErrorReport}
        onDownloadTemplate={handleDownloadTemplate}
      />
    </Layout>
  );
}
