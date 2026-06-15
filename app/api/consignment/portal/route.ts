// Public API for consignment dealer portal — no authentication required
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY!),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// GET — Fetch portal data by portal_token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Find customer by portal_token
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, name, customer_code, phone, customer_type, consignment_mode, company_id')
      .eq('portal_token', token)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลตัวแทน' }, { status: 404 });
    }

    const companyId = customer.company_id;

    // Fetch company info
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('id, name, logo_url')
      .eq('id', companyId)
      .single();

    // Find consignment warehouse for this dealer
    const { data: consignWarehouse } = await supabaseAdmin
      .from('warehouses')
      .select('id')
      .eq('company_id', companyId)
      .eq('customer_id', customer.id)
      .eq('warehouse_type', 'consignment')
      .single();

    // Fetch stock from inventory (consignment warehouse)
    const stockRows = consignWarehouse
      ? (await supabaseAdmin
          .from('inventory')
          .select('variation_id, quantity')
          .eq('company_id', companyId)
          .eq('warehouse_id', consignWarehouse.id)
          .gt('quantity', 0)).data?.map(r => ({
            variation_id: r.variation_id,
            total_remaining: r.quantity,
            total_sent: r.quantity,
            total_sold: 0,
            total_returned: 0,
          })) ?? []
      : [];

    // Enrich stock with product/variation names + images
    let stockSummary: {
      variation_id: string;
      total_sent: number;
      total_sold: number;
      total_returned: number;
      total_remaining: number;
      sku: string | null;
      variation_label: string | null;
      product_name: string;
      product_code: string | null;
      image_url: string | null;
    }[] = [];

    if (stockRows && stockRows.length > 0) {
      const variationIds = stockRows.map(r => r.variation_id).filter(Boolean);

      if (variationIds.length > 0) {
        const { data: variations } = await supabaseAdmin
          .from('product_variations')
          .select('id, sku, barcode, variation_label, product_id, product:products(name, code)')
          .in('id', variationIds);

        const variationMap: Record<string, { sku: string | null; barcode: string | null; label: string | null; product_name: string; product_code: string | null; product_id: string | null }> = {};
        for (const v of variations || []) {
          const product = v.product as unknown as { name: string; code: string } | { name: string; code: string }[] | null;
          const p = Array.isArray(product) ? product[0] : product;
          variationMap[v.id] = {
            sku: v.sku || null,
            barcode: v.barcode || null,
            label: v.variation_label || null,
            product_name: p?.name ?? '',
            product_code: p?.code || null,
            product_id: v.product_id || null,
          };
        }

        // Fetch images for variations + products
        const productIds = [...new Set(Object.values(variationMap).map(v => v.product_id).filter(Boolean))] as string[];
        const imageMap: Record<string, string> = {};
        if (variationIds.length > 0 || productIds.length > 0) {
          const orParts: string[] = [];
          if (variationIds.length > 0) orParts.push(`variation_id.in.(${[...new Set(variationIds)].join(',')})`);
          if (productIds.length > 0) orParts.push(`product_id.in.(${productIds.join(',')})`);
          const { data: images } = await supabaseAdmin
            .from('product_images')
            .select('product_id, variation_id, image_url')
            .or(orParts.join(','))
            .order('sort_order', { ascending: true });
          for (const img of images || []) {
            if (img.variation_id && !imageMap[`v:${img.variation_id}`]) imageMap[`v:${img.variation_id}`] = img.image_url;
            if (img.product_id && !imageMap[`p:${img.product_id}`]) imageMap[`p:${img.product_id}`] = img.image_url;
          }
        }

        stockSummary = stockRows.map(row => {
          const info = variationMap[row.variation_id];
          const image = (info?.product_id ? imageMap[`v:${row.variation_id}`] || imageMap[`p:${info.product_id}`] : null) || null;
          return {
            variation_id: row.variation_id,
            total_sent: row.total_sent ?? 0,
            total_sold: row.total_sold ?? 0,
            total_returned: row.total_returned ?? 0,
            total_remaining: row.total_remaining ?? 0,
            sku: info?.sku ?? null,
            barcode: info?.barcode ?? null,
            variation_label: info?.label ?? null,
            product_name: info?.product_name ?? '',
            product_code: info?.product_code ?? null,
            image_url: image,
          };
        });

        // Sort by product_name
        stockSummary.sort((a, b) => a.product_name.localeCompare(b.product_name, 'th'));
      }
    }

    // Fetch recent consignment reports (last 6)
    const { data: reports } = await supabaseAdmin
      .from('consignment_reports')
      .select('id, report_number, period_year, period_month, status, total_qty_sold, our_amount, due_date, report_token')
      .eq('customer_id', customer.id)
      .eq('company_id', companyId)
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })
      .limit(6);

    return NextResponse.json({
      customer: {
        id: customer.id,
        name: customer.name,
        customer_code: customer.customer_code,
        phone: customer.phone,
        consignment_mode: customer.consignment_mode,
      },
      company: {
        id: company?.id ?? companyId,
        name: company?.name ?? '',
        logo_url: company?.logo_url ?? null,
      },
      stock_summary: stockSummary,
      reports: reports ?? [],
    });
  } catch (error) {
    console.error('GET consignment portal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — Submit consignment report
export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get('token');

    if (!token) {
      return NextResponse.json({ error: 'Token is required' }, { status: 400 });
    }

    // Find customer by portal_token
    const { data: customer, error: customerError } = await supabaseAdmin
      .from('customers')
      .select('id, company_id')
      .eq('portal_token', token)
      .single();

    if (customerError || !customer) {
      return NextResponse.json({ error: 'ไม่พบข้อมูลตัวแทน' }, { status: 404 });
    }

    const body = await request.json();
    const { report_id, items, notes } = body as {
      report_id: string;
      items: Array<{ variation_id: string; qty_sold: number; qty_returned: number }>;
      notes?: string;
    };

    if (!report_id) {
      return NextResponse.json({ error: 'กรุณาระบุรายงาน' }, { status: 400 });
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: 'กรุณาระบุข้อมูลรายการ' }, { status: 400 });
    }

    // Validate report belongs to this customer and is draft
    const { data: report, error: reportError } = await supabaseAdmin
      .from('consignment_reports')
      .select('id, status, customer_id, company_id')
      .eq('id', report_id)
      .eq('customer_id', customer.id)
      .eq('company_id', customer.company_id)
      .single();

    if (reportError || !report) {
      return NextResponse.json({ error: 'ไม่พบรายงาน' }, { status: 404 });
    }

    if (report.status !== 'draft') {
      return NextResponse.json({ error: 'รายงานนี้ไม่สามารถแก้ไขได้' }, { status: 400 });
    }

    // Fetch existing report items for unit_price and gp_rate
    const { data: reportItems } = await supabaseAdmin
      .from('consignment_report_items')
      .select('id, variation_id, unit_price, gp_rate')
      .eq('report_id', report_id);

    const itemMap: Record<string, { id: string; unit_price: number; gp_rate: number }> = {};
    for (const ri of reportItems || []) {
      itemMap[ri.variation_id] = { id: ri.id, unit_price: ri.unit_price ?? 0, gp_rate: ri.gp_rate ?? 0 };
    }

    let totalQtySold = 0;
    let totalOurAmount = 0;

    // Update or insert each item
    for (const item of items) {
      const { variation_id, qty_sold, qty_returned } = item;
      const existing = itemMap[variation_id];
      const unitPrice = existing?.unit_price ?? 0;
      const gpRate = existing?.gp_rate ?? 0;
      // unit_price is already net (after per-item GP deduction)
      const ourAmount = qty_sold * unitPrice;

      totalQtySold += qty_sold;
      totalOurAmount += ourAmount;

      if (existing) {
        await supabaseAdmin
          .from('consignment_report_items')
          .update({
            qty_sold,
            qty_returned,
            our_amount: ourAmount,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
      } else {
        await supabaseAdmin
          .from('consignment_report_items')
          .insert({
            report_id: report_id,
            variation_id,
            qty_sold,
            qty_returned,
            unit_price: 0,
            gp_rate: 0,
            our_amount: ourAmount,
          });
      }
    }

    // Update report status to received
    await supabaseAdmin
      .from('consignment_reports')
      .update({
        status: 'received',
        received_at: new Date().toISOString(),
        total_qty_sold: totalQtySold,
        our_amount: totalOurAmount,
        notes: notes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', report_id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('POST consignment portal error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
