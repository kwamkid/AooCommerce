/**
 * Header-based bulk template parser.
 * Looks up column index by header name (tolerant of column reorder, optional columns).
 * Reads Excel (.xlsx, .xls) or CSV. Returns rows as { [headerName]: value }.
 */

type Cell = string | number | boolean | null;

export interface ParsedSheet {
  headers: string[];
  rows: Record<string, string>[];
}

/** Normalize a header for matching: trim + lowercase. Strip wrap-text newlines. */
function normalize(h: string): string {
  return (h || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Find a column index by trying multiple header aliases. Returns -1 if none match. */
export function findColumnIndex(headers: string[], ...aliases: string[]): number {
  const normalized = headers.map(normalize);
  for (const alias of aliases) {
    const i = normalized.indexOf(normalize(alias));
    if (i >= 0) return i;
  }
  return -1;
}

/** Build a header → index map for quick lookup. */
export function buildHeaderMap(headers: string[]): Map<string, number> {
  const m = new Map<string, number>();
  headers.forEach((h, i) => m.set(normalize(h), i));
  return m;
}

/** Parse a CSV text into rows (handles quoted cells + commas). */
function parseCSV(text: string): string[][] {
  // Strip BOM if present
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let buf = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          buf += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        buf += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        cur.push(buf);
        buf = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        cur.push(buf);
        rows.push(cur);
        cur = [];
        buf = '';
      } else {
        buf += c;
      }
    }
  }
  if (buf.length || cur.length) {
    cur.push(buf);
    rows.push(cur);
  }
  return rows.filter(r => r.some(v => v && v.length));
}

/** Read a File (.xlsx/.xls/.csv) → raw rows[][] as strings. */
export async function readFileToRows(file: File): Promise<string[][]> {
  const isExcel = /\.xlsx?$/i.test(file.name);
  if (isExcel) {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, row => {
      // ExcelJS row.values has a leading null at index 0
      const values = (row.values as Cell[]).slice(1).map(cellToString);
      if (values.some(v => v.length)) rows.push(values);
    });
    return rows;
  } else {
    const text = await file.text();
    return parseCSV(text);
  }
}

function cellToString(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    // ExcelJS rich text / hyperlink
    const o = v as { text?: string; richText?: { text: string }[]; result?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (Array.isArray(o.richText)) return o.richText.map(r => r.text).join('');
    if (o.result !== undefined) return String(o.result);
    return '';
  }
  return String(v);
}

/**
 * Parse raw rows[][] into ParsedSheet.
 * - Row 0 is treated as headers.
 * - Empty rows skipped.
 * - Optionally skip the "metadata row" at index 1 (when present — used by templates that
 *   store extra info like warehouse_id in row 1, with visible headers on row 2).
 *
 * For our bulk templates, we use a single header row at index 0. The caller can pass
 * `skipMetadataRow: true` if their template has a sentinel row underneath.
 */
export function rowsToSheet(rawRows: string[][], opts?: { skipMetadataRow?: boolean }): ParsedSheet {
  if (rawRows.length < 2) {
    return { headers: rawRows[0] || [], rows: [] };
  }
  const headers = rawRows[0];
  const dataStart = opts?.skipMetadataRow ? 2 : 1;
  const dataRows = rawRows.slice(dataStart);
  const rows = dataRows.map(cols => {
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[normalize(h)] = (cols[i] || '').toString().trim();
    });
    return obj;
  });
  return { headers, rows };
}

/** Get value from a parsed row using normalized header name. */
export function getCell(row: Record<string, string>, ...aliases: string[]): string {
  for (const a of aliases) {
    const v = row[normalize(a)];
    if (v !== undefined && v !== '') return v;
  }
  return '';
}

/** Check if a parsed row appears empty (all cells blank). */
export function isRowEmpty(row: Record<string, string>): boolean {
  return Object.values(row).every(v => !v || !v.trim());
}

/**
 * Detect an "instruction/note" row — a row where every non-empty cell is
 * wrapped in parentheses, e.g. "(จำเป็น)", "(ค่าว่าง = 0)". Templates downloaded
 * from our app place such a row right below the header; some users delete it,
 * some don't. This detector lets the parser skip it in either case.
 */
export function isInstructionRow(row: Record<string, string>): boolean {
  const values = Object.values(row).map(v => (v || '').trim()).filter(v => v.length > 0);
  if (values.length === 0) return false;
  return values.every(v => /^\(.*\)$/.test(v));
}

/** Required column descriptor for header validation. */
export interface RequiredColumn {
  /** Header aliases tried in order (e.g. "รหัสสินค้า*", "รหัสสินค้า", "code"). */
  aliases: string[];
  /** Display label used in user-facing error messages. */
  label: string;
}

export interface HeaderValidation {
  ok: boolean;
  /** Labels of required columns that could not be found in the file. */
  missing: string[];
  /** Original header texts received from the file (first row), for hinting. */
  headers: string[];
}

/**
 * Validate that all required columns exist in the parsed header row.
 * Matching uses `findColumnIndex` (case-insensitive, whitespace-trimmed).
 */
export function validateHeaders(headers: string[], required: RequiredColumn[]): HeaderValidation {
  const missing: string[] = [];
  for (const r of required) {
    if (findColumnIndex(headers, ...r.aliases) < 0) {
      missing.push(r.label);
    }
  }
  return { ok: missing.length === 0, missing, headers };
}
