// Path: app/api/onboarding/finalize/route.ts
//
// One-shot endpoint called on "เสร็จสิ้น" of the onboarding wizard. Creates the
// company + applies every wizard step + uploads logo + marks onboarding complete
// in a single request so the user never has a half-created company sitting
// around when they abandon the wizard mid-way.

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuth } from '@/lib/supabase-admin';
import { applyChannels, applyWarehouse, applyCarriers, applyPayment, type WarehouseBody, type PaymentBody } from '@/lib/onboarding-actions';

interface CompanyInfo {
  name: string;
  description?: string | null;
  // Logo encoded as data URL (data:image/png;base64,...) — wizard form holds
  // it client-side until finalize so abandoned wizards leave no orphan uploads.
  logoDataUrl?: string | null;
  logoFileName?: string | null;
  logoMimeType?: string | null;
}

interface FinalizeBody {
  company: CompanyInfo;
  channels: string[];
  warehouse: WarehouseBody;
  carriers: string[];
  payment: PaymentBody;
}

// Decode a "data:image/png;base64,XXXX" URL back into a Buffer for upload.
function decodeDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } | null {
  const match = /^data:([^;,]+)(?:;[^,]*)?,(.+)$/.exec(dataUrl);
  if (!match) return null;
  const mimeType = match[1];
  const data = match[2];
  // base64 payloads include the "base64" token before the comma — handle both.
  const isBase64 = dataUrl.slice(0, match[0].length).toLowerCase().includes(';base64');
  try {
    const buffer = isBase64 ? Buffer.from(data, 'base64') : Buffer.from(decodeURIComponent(data));
    return { buffer, mimeType };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuth(request);
    if (!auth.isAuth || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as FinalizeBody | null;
    if (!body?.company?.name?.trim()) {
      return NextResponse.json({ error: 'กรุณาระบุชื่อบริษัท' }, { status: 400 });
    }

    const name = body.company.name.trim();
    const description = body.company.description?.toString().trim() || null;

    // Re-use the slug + max_companies + uniqueness checks from /api/companies
    const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // max_companies check
    const { data: ownedCompanies } = await supabaseAdmin
      .from('company_members')
      .select('company_id')
      .eq('user_id', auth.userId)
      .contains('roles', ['owner'])
      .eq('is_active', true);
    const ownedCount = ownedCompanies?.length || 0;
    if (ownedCount > 0) {
      const { data: subscription } = await supabaseAdmin
        .from('user_subscriptions')
        .select('package:packages(*)')
        .eq('company_id', ownedCompanies![0].company_id)
        .eq('status', 'active')
        .single();
      const pkg = subscription?.package as unknown as { max_companies: number | null } | null;
      const maxCompanies = pkg?.max_companies;
      if (maxCompanies !== null && maxCompanies !== undefined && ownedCount >= maxCompanies) {
        return NextResponse.json(
          { error: `แพ็กเกจของคุณสร้างบริษัทได้สูงสุด ${maxCompanies} บริษัท กรุณาอัพเกรดแพ็กเกจ` },
          { status: 403 },
        );
      }
    }

    // Slug uniqueness — append -N if taken
    let companySlug = baseSlug || `company-${Date.now()}`;
    let suffix = 0;
    while (true) {
      const { data: existing } = await supabaseAdmin
        .from('companies')
        .select('id')
        .eq('slug', companySlug)
        .maybeSingle();
      if (!existing) break;
      suffix += 1;
      companySlug = `${baseSlug}-${suffix}`;
      if (suffix > 50) return NextResponse.json({ error: 'ไม่สามารถสร้าง slug ได้' }, { status: 500 });
    }

    // 1) Create company row
    const { data: company, error: companyError } = await supabaseAdmin
      .from('companies')
      .insert({
        name,
        slug: companySlug,
        description,
        created_by: auth.userId,
      })
      .select()
      .single();
    if (companyError || !company) {
      return NextResponse.json({ error: companyError?.message || 'สร้างบริษัทไม่สำเร็จ' }, { status: 500 });
    }

    // 2) Membership
    await supabaseAdmin.from('company_members').insert({
      company_id: company.id,
      user_id: auth.userId,
      roles: ['owner'],
      can_view_cost: true,
    });

    // 3) Default subscription — currently Enterprise (highest) for every new
    // signup. TODO: revert to 'free' once we have a real upgrade flow.
    const { data: defaultPackage } = await supabaseAdmin
      .from('packages')
      .select('id')
      .eq('slug', 'enterprise')
      .single();
    if (defaultPackage) {
      await supabaseAdmin.from('user_subscriptions').insert({
        company_id: company.id,
        user_id: auth.userId,
        package_id: defaultPackage.id,
        status: 'active',
      });
    }

    // 4) Seed CRM + variation types (same defaults as /api/companies POST)
    await supabaseAdmin.from('crm_settings').insert({
      company_id: company.id,
      setting_key: 'follow_up_day_ranges',
      setting_value: [
        { min: 0, max: 3, color: '#22C55E', label: 'ปกติ' },
        { min: 4, max: 7, color: '#EAB308', label: 'ควรติดตาม' },
        { min: 8, max: 14, color: '#F97316', label: 'เสี่ยง' },
        { min: 15, max: null, color: '#EF4444', label: 'วิกฤต' },
      ],
      description: 'ช่วงวันติดตามลูกค้า',
    });
    await supabaseAdmin.from('variation_types').insert([
      { name: 'ความจุ', sort_order: 1, company_id: company.id },
      { name: 'รูปทรง', sort_order: 2, company_id: company.id },
      { name: 'สี',     sort_order: 3, company_id: company.id },
      { name: 'ไซซ์',   sort_order: 4, company_id: company.id },
    ]);

    // 5) Upload logo if provided
    if (body.company.logoDataUrl) {
      const decoded = decodeDataUrl(body.company.logoDataUrl);
      if (decoded) {
        const mimeType = body.company.logoMimeType || decoded.mimeType;
        const fileName = body.company.logoFileName || 'logo.png';
        const ext = fileName.split('.').pop() || 'png';
        const filePath = `${company.id}/logo.${ext}`;
        const { error: uploadError } = await supabaseAdmin.storage
          .from('company-logos')
          .upload(filePath, decoded.buffer, { contentType: mimeType, upsert: true });
        if (!uploadError) {
          const { data: urlData } = supabaseAdmin.storage.from('company-logos').getPublicUrl(filePath);
          const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;
          await supabaseAdmin.from('companies').update({ logo_url: logoUrl }).eq('id', company.id);
        } else {
          console.error('[Finalize] Logo upload failed:', uploadError.message);
        }
      }
    }

    // 6) Apply wizard steps — channels → warehouse → carriers → payment
    try {
      await applyChannels(company.id, body.channels || ['retail']);
      await applyWarehouse(company.id, auth.userId, body.warehouse || null);
      await applyCarriers(company.id, body.carriers || []);
      await applyPayment(company.id, body.payment || null);
    } catch (e) {
      console.error('[Finalize] Apply step failed:', e);
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'ตั้งค่าไม่สำเร็จ', company },
        { status: 500 },
      );
    }

    // 7) Mark onboarding complete
    await supabaseAdmin
      .from('companies')
      .update({ onboarding_completed_at: new Date().toISOString() })
      .eq('id', company.id);

    return NextResponse.json({ success: true, company });
  } catch (error) {
    console.error('[Finalize] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'เกิดข้อผิดพลาด' },
      { status: 500 },
    );
  }
}
