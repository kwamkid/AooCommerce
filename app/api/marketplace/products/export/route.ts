// ส่งสินค้าของเราขึ้นร้าน marketplace — **route เดียวทุกแพลตฟอร์ม**
//
//   POST { account_id, product_id, config, draft?, dry_run? }        → JSON (ทีละตัว)
//   POST { account_id, items: [{product_id, config}], draft?, cursor? } → SSE (หลายตัว)
//
// ⛔ ห้าม `switch (platform)` ที่นี่ — ตรรกะอยู่ `lib/marketplace/product-export.ts`
//    และ "ยิง API เจ้าไหนยังไง" อยู่ `lib/<platform>/product-export-adapter.ts`
//    (route เดิม `/api/shopee/products/export` ลบแล้ว ห้ามสร้างใหม่)

import { NextRequest, NextResponse } from 'next/server';
import { exportBulk, exportProduct, type ExportBulkItem, type ExportConfig } from '@/lib/marketplace/product-export';
import { resolveExportContext, isResponse, errorResponse } from './helpers';

export const maxDuration = 300;

/** งบเวลาจริง — หยุดเองก่อนโดน Vercel ตัดที่ 300 วิ แล้วคืน next_cursor */
const TIME_BUDGET_MS = 210_000;

interface ExportRequestBody {
  account_id?: string;
  product_id?: string;
  items?: { product_id: string; config: ExportConfig }[];
  config?: ExportConfig;
  draft?: boolean;
  dry_run?: boolean;
  cursor?: string;
}

/**
 * ข้อจำกัดของร้านนี้ที่หน้า wizard ต้องรู้ล่วงหน้า — `GET ?account_id=`
 *   → { platform, title_min, title_max, can_verify_link }
 * (หน้า wizard ห้ามรู้จัก platform เอง — ค่ามาจาก adapter ของร้านนั้น)
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ctx = await resolveExportContext(request, searchParams.get('account_id'));
    if (isResponse(ctx)) return ctx;

    return NextResponse.json({
      platform: ctx.platform,
      title_min: ctx.adapter.titleRules?.min ?? 0,
      title_max: ctx.adapter.titleRules?.max ?? 0,
      can_verify_link: typeof ctx.adapter.itemExists === 'function',
    });
  } catch (error) {
    return errorResponse(error, 'อ่านข้อจำกัดของร้านไม่สำเร็จ');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ExportRequestBody;
    const ctx = await resolveExportContext(request, body.account_id || null);
    if (isResponse(ctx)) return ctx;

    // ── ทีละตัว (JSON) ────────────────────────────────────────────────────
    if (body.product_id) {
      if (!body.config?.category_id) {
        return NextResponse.json({ error: 'ยังไม่ได้เลือกหมวดหมู่ของร้าน' }, { status: 400 });
      }
      const result = await exportProduct(ctx.account, body.product_id, body.config, {
        draft: body.draft === true,
        dryRun: body.dry_run === true,
      });
      return NextResponse.json(result, { status: result.success ? 200 : 400 });
    }

    // ── หลายตัว (SSE) ─────────────────────────────────────────────────────
    const items = (body.items || []).filter(i => i?.product_id && i?.config?.category_id) as ExportBulkItem[];
    if (items.length === 0) {
      return NextResponse.json({ error: 'ต้องระบุ product_id หรือ items (พร้อมหมวดหมู่)' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        const send = (data: object) => {
          if (closed) return;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'started', total: items.length });

        try {
          const result = await exportBulk(
            ctx.account,
            items,
            { draft: body.draft === true, cursor: body.cursor, timeBudgetMs: TIME_BUDGET_MS },
            (p) => send({ type: 'progress', ...p }),
          );
          send({ type: 'done', ...result });
        } catch (e) {
          send({ type: 'error', message: e instanceof Error ? e.message : 'ส่งสินค้าไม่สำเร็จ' });
        }

        closed = true;
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    return errorResponse(error, 'ส่งสินค้าไม่สำเร็จ');
  }
}
