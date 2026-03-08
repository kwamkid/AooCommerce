import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, checkAuthWithCompany } from '@/lib/supabase-admin';
import { ENTITY_PRINT_TYPES, ENTITY_TABLE, PrintEntityType } from '@/lib/print-tracking';

export async function POST(request: NextRequest) {
  try {
    const auth = await checkAuthWithCompany(request);
    if (!auth.isAuth || !auth.companyId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entity_type, entity_ids, print_type } = await request.json();

    // Validate entity_type
    const validEntities = Object.keys(ENTITY_TABLE) as PrintEntityType[];
    if (!entity_type || !validEntities.includes(entity_type)) {
      return NextResponse.json({ error: `entity_type must be one of: ${validEntities.join(', ')}` }, { status: 400 });
    }

    // Validate entity_ids
    if (!entity_ids || !Array.isArray(entity_ids) || entity_ids.length === 0) {
      return NextResponse.json({ error: 'entity_ids is required' }, { status: 400 });
    }

    // Validate print_type for this entity
    const validTypes = ENTITY_PRINT_TYPES[entity_type as PrintEntityType];
    if (!print_type || !validTypes.includes(print_type)) {
      return NextResponse.json({ error: `print_type must be one of: ${validTypes.join(', ')}` }, { status: 400 });
    }

    const table = ENTITY_TABLE[entity_type as PrintEntityType];
    const column = `printed_${print_type}_at`;

    const { error } = await supabaseAdmin
      .from(table)
      .update({ [column]: new Date().toISOString() })
      .in('id', entity_ids)
      .eq('company_id', auth.companyId);

    if (error) {
      console.error('mark-printed error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('mark-printed server error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
