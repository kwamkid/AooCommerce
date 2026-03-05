/**
 * Shared PDF utilities for pdfMake-based documents.
 * Used by inventory-pdf.ts and order-invoice-pdf.ts.
 */

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  tax_id?: string;
  tax_company_name?: string;
  tax_branch?: string | null;
  logo_url?: string | null;
  vat_registered?: boolean;
}

export const formatPdfDate = (d: string) =>
  new Date(d).toLocaleDateString('th-TH', { day: '2-digit', month: 'long', year: 'numeric' });

const toBase64 = (buf: ArrayBuffer) => {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
};

// Cache company info to avoid repeated API calls
let cachedCompanyInfo: CompanyInfo | null = null;

export async function fetchCompanyInfo(): Promise<CompanyInfo | null> {
  if (cachedCompanyInfo) return cachedCompanyInfo;
  try {
    const { apiFetch } = await import('@/lib/api-client');
    const res = await apiFetch('/api/companies');
    if (!res.ok) return null;
    const result = await res.json();
    const memberships = result.companies || [];
    const currentId = typeof window !== 'undefined' ? localStorage.getItem('aoo-current-company-id') : null;
    const membership = (currentId
      ? memberships.find((m: { company_id: string }) => m.company_id === currentId)
      : null) || memberships[0];
    const co = membership?.company;
    if (!co) return null;
    cachedCompanyInfo = {
      name: co.name || '',
      address: co.address || '',
      phone: co.phone || '',
      tax_id: co.tax_id || '',
      tax_company_name: co.tax_company_name || '',
      tax_branch: co.tax_branch || null,
      logo_url: co.logo_url || null,
      vat_registered: co.vat_registered || false,
    };
    return cachedCompanyInfo;
  } catch { return null; }
}

/** Load and configure pdfMake with IBMPlexSansThai fonts */
export async function setupPdfMake() {
  const pdfMake = (await import('pdfmake/build/pdfmake')).default;

  const [regularBuf, boldBuf] = await Promise.all([
    fetch('/fonts/IBMPlexSansThai-Regular.ttf').then(r => r.arrayBuffer()),
    fetch('/fonts/IBMPlexSansThai-Bold.ttf').then(r => r.arrayBuffer()),
  ]);

  pdfMake.addFontContainer({
    vfs: {
      'IBMPlexSansThai-Regular.ttf': toBase64(regularBuf),
      'IBMPlexSansThai-Bold.ttf': toBase64(boldBuf),
    },
    fonts: {
      IBMPlexSansThai: {
        normal: 'IBMPlexSansThai-Regular.ttf',
        bold: 'IBMPlexSansThai-Bold.ttf',
        italics: 'IBMPlexSansThai-Regular.ttf',
        bolditalics: 'IBMPlexSansThai-Bold.ttf',
      },
    },
  });

  return pdfMake;
}

/** Fetch logo image and convert to data URL */
export async function loadLogoDataUrl(logoUrl: string): Promise<string | null> {
  try {
    const response = await fetch(logoUrl);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; }
}

/** Build company header stack (logo + name + address/tax/phone) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCompanyStack(company: CompanyInfo | undefined, logoDataUrl: string | null): any[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stack: any[] = [];

  if (logoDataUrl) {
    stack.push({ image: logoDataUrl, width: 40, height: 40, fit: [40, 40], margin: [0, 0, 0, 2] });
  }

  const companyName = company?.tax_company_name || company?.name || '';
  if (companyName) {
    const branchText = company?.tax_branch ? ` (${company.tax_branch})` : '';
    stack.push({ text: companyName + branchText, bold: true, fontSize: 11, color: '#333333' });
  }
  if (company?.address) {
    stack.push({ text: company.address, fontSize: 10, color: '#666666' });
  }
  if (company?.tax_id) {
    stack.push({ text: `เลขประจำตัวผู้เสียภาษี ${company.tax_id}`, fontSize: 10, color: '#666666' });
  }
  if (company?.phone) {
    stack.push({ text: `โทร ${company.phone}`, fontSize: 10, color: '#666666' });
  }

  return stack;
}

/** Build corner triangle background element */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCornerTriangle(color: string): any {
  const pageWidth = 595.28;
  const triangleSize = 50;
  return {
    canvas: [{
      type: 'polyline',
      closePath: true,
      points: [
        { x: pageWidth - 8, y: 8 },
        { x: pageWidth - 8 - triangleSize, y: 8 },
        { x: pageWidth - 8, y: 8 + triangleSize },
      ],
      color,
    }],
  };
}

/** Build signature footer (2-sided) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildSignatureFooter(companyName: string, leftLabel: string, rightLabel: string): any {
  const buildSide = (topLabel: string, signLabel: string) => ({
    width: '*',
    stack: [
      { text: topLabel || ' ', fontSize: 10, color: '#666666' },
      { text: ' ', margin: [0, 18, 0, 0] },
      {
        columns: [
          {
            width: '*',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 140, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
              { text: signLabel, fontSize: 10, margin: [0, 3, 0, 0] },
            ],
          },
          {
            width: 'auto',
            stack: [
              { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 80, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }] },
              { text: 'วันที่', fontSize: 10, margin: [0, 3, 0, 0] },
            ],
          },
        ],
        columnGap: 10,
      },
    ],
  });

  return {
    columns: [
      buildSide(companyName ? `ในนาม ${companyName}` : ' ', leftLabel),
      { width: 30, text: '' },
      buildSide(' ', rightLabel),
    ],
    margin: [40, 0, 40, 12],
  };
}

/** Format number with 2 decimal places and commas */
export function formatPdfPrice(amount: number): string {
  return amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Build a copy label badge (ต้นฉบับ / สำเนา) positioned at top-right of page.
 * Use as the last item in a page's content array (absolute positioned).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildCopyLabel(label: '(ต้นฉบับ)' | '(สำเนา)'): any {
  const isOriginal = label === '(ต้นฉบับ)';
  return {
    absolutePosition: { x: 40, y: 30 },
    text: label,
    fontSize: 9,
    color: isOriginal ? '#15803d' : '#6b7280',
    bold: true,
  };
}

/**
 * Duplicate a pdfMake content array into 2 pages:
 * page 1 = ต้นฉบับ, page 2 = สำเนา
 *
 * Usage:
 *   const singlePageContent = [...];
 *   docDefinition.content = withOriginalAndCopy(singlePageContent);
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
/**
 * Returns a header function for pdfMake that shows ต้นฉบับ on page 1, สำเนา on page 2+
 * Use as: header: withOriginalAndCopyHeader()
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withOriginalAndCopyHeader(): (page: number, pages: number) => any {
  return (page: number) => ({
    text: page === 1 ? '(ต้นฉบับ)' : '(สำเนา)',
    fontSize: 9,
    bold: true,
    color: page === 1 ? '#15803d' : '#6b7280',
    margin: [40, 20, 0, 0],
  });
}

/**
 * Inject a copy label text node as the first item of a content array.
 * Looks for the first `columns` block (the header row) and prepends label
 * to the right-side stack's first text item subtitle.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function injectCopyLabel(pageContent: any[], label: string, color: string): any[] {
  // Deep clone so layout functions etc. are preserved by re-running through JSON
  // We add a standalone label text before all content
  return [
    { text: label, fontSize: 9, bold: true, color, margin: [0, 0, 0, -2] },
    ...pageContent,
  ];
}

export function withOriginalAndCopy(pageContent: any[]): any[] {
  const clone = JSON.parse(JSON.stringify(pageContent));
  return [
    ...injectCopyLabel(pageContent, '(ต้นฉบับ)', '#15803d'),
    { text: '', pageBreak: 'after' },
    ...injectCopyLabel(clone, '(สำเนา)', '#6b7280'),
  ];
}
