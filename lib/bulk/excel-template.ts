import type { Worksheet, Row } from 'exceljs';

/**
 * Standard row layout for every bulk Excel template in the system:
 *
 *   Row 1: Header        — orange background (#F4511E), white bold text, height 28
 *   Row 2: Instruction   — gray italic (size 9), guidance per column
 *   Row 3..: Data        — actual rows (samples for create templates, real rows for export)
 *
 * Use addHeaderRow() + addInstructionRow() (or addTemplateHeader() for both) at
 * the top of every template generator. The shared parseTemplate parser already
 * detects + skips instruction rows automatically.
 */

const HEADER_FILL = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF4511E' } };
const HEADER_FONT = { bold: true, color: { argb: 'FFFFFFFF' } };
const INSTRUCTION_FONT = { italic: true, color: { argb: 'FF999999' }, size: 9 };

export function addHeaderRow(ws: Worksheet, headers: string[]): Row {
  const row = ws.addRow(headers);
  row.height = 28;
  row.eachCell(cell => {
    cell.font = HEADER_FONT;
    cell.fill = HEADER_FILL;
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  });
  return row;
}

export function addInstructionRow(ws: Worksheet, instructions: string[]): Row {
  const row = ws.addRow(instructions);
  row.eachCell(cell => {
    cell.font = INSTRUCTION_FONT;
  });
  return row;
}

/** Convenience: header + instruction in one call. */
export function addTemplateHeader(
  ws: Worksheet,
  headers: string[],
  instructions: string[],
): void {
  addHeaderRow(ws, headers);
  addInstructionRow(ws, instructions);
}
