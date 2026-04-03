import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkSuperAdmin } from '@/lib/supabase-admin';
import { getAllTranslations, getBuiltInDefaults, invalidateErrorCache } from '@/lib/shopee/errors';

// ─── GET: List all error translations ───

export async function GET(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const translations = await getAllTranslations();
    return NextResponse.json({ translations });
  } catch (error) {
    console.error('GET error-translations error:', error);
    return NextResponse.json({ error: 'Failed to fetch translations' }, { status: 500 });
  }
}

// ─── POST: Create or seed translations ───

export async function POST(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();

    // Seed defaults
    if (body.action === 'seed') {
      const defaults = getBuiltInDefaults();
      const { error } = await supabaseAdmin
        .from('marketplace_error_translations')
        .upsert(
          defaults.map(d => ({
            error_key: d.error_key,
            is_regex: d.is_regex,
            thai_message: d.thai_message,
            category: d.category,
            is_active: d.is_active,
            sort_order: d.sort_order,
          })),
          { onConflict: 'error_key' }
        );
      if (error) throw error;
      invalidateErrorCache();
      return NextResponse.json({ success: true, message: `Seeded ${defaults.length} translations` });
    }

    // Create new
    const { error_key, is_regex, thai_message, category, sort_order } = body;
    if (!error_key?.trim() || !thai_message?.trim()) {
      return NextResponse.json({ error: 'error_key and thai_message are required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('marketplace_error_translations')
      .insert({
        error_key: error_key.trim(),
        is_regex: is_regex || false,
        thai_message: thai_message.trim(),
        category: category || 'common',
        is_active: true,
        sort_order: sort_order || 99,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'error_key ซ้ำ' }, { status: 400 });
      }
      throw error;
    }

    invalidateErrorCache();
    return NextResponse.json({ success: true, translation: data });
  } catch (error) {
    console.error('POST error-translations error:', error);
    return NextResponse.json({ error: 'Failed to create translation' }, { status: 500 });
  }
}

// ─── PUT: Update translation ───

export async function PUT(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await request.json();
    const { id, ...updates } = body;

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {};
    if (updates.error_key !== undefined) updateData.error_key = updates.error_key.trim();
    if (updates.is_regex !== undefined) updateData.is_regex = updates.is_regex;
    if (updates.thai_message !== undefined) updateData.thai_message = updates.thai_message.trim();
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.is_active !== undefined) updateData.is_active = updates.is_active;
    if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order;

    const { error } = await supabaseAdmin
      .from('marketplace_error_translations')
      .update(updateData)
      .eq('id', id);

    if (error) throw error;
    invalidateErrorCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('PUT error-translations error:', error);
    return NextResponse.json({ error: 'Failed to update translation' }, { status: 500 });
  }
}

// ─── DELETE: Remove translation ───

export async function DELETE(request: NextRequest) {
  try {
    const auth = await checkSuperAdmin(request);
    if (!auth.isAuth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!auth.isSuperAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('marketplace_error_translations')
      .delete()
      .eq('id', id);

    if (error) throw error;
    invalidateErrorCache();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('DELETE error-translations error:', error);
    return NextResponse.json({ error: 'Failed to delete translation' }, { status: 500 });
  }
}
