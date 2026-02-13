// Path: app/api/settings/crm/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  }
);

// Helper function: ตรวจสอบว่าล็อกอินหรือไม่
async function checkAuth(request: NextRequest): Promise<{ isAuth: boolean; userId?: string }> {
  try {
    const authHeader = request.headers.get('authorization');

    if (!authHeader?.startsWith('Bearer ')) {
      return { isAuth: false };
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return { isAuth: false };
    }

    return { isAuth: true, userId: user.id };
  } catch {
    return { isAuth: false };
  }
}

interface DayRange {
  minDays: number;
  maxDays: number | null; // null = unlimited (e.g., 30+)
  label: string;
  color: string;
}

// GET - ดึงค่า settings
export async function GET(request: NextRequest) {
  try {
    const { isAuth } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('crm_settings')
      .select('*')
      .eq('setting_key', 'follow_up_day_ranges')
      .single();

    if (error) {
      // If table doesn't exist or no data, return defaults
      return NextResponse.json({
        dayRanges: [
          { minDays: 0, maxDays: 3, label: '0-3 วัน', color: 'green' },
          { minDays: 4, maxDays: 7, label: '4-7 วัน', color: 'yellow' },
          { minDays: 8, maxDays: 14, label: '8-14 วัน', color: 'orange' },
          { minDays: 15, maxDays: null, label: '15+ วัน', color: 'red' }
        ]
      });
    }

    return NextResponse.json({
      dayRanges: data.setting_value as DayRange[]
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - อัปเดตค่า settings
export async function PUT(request: NextRequest) {
  try {
    const { isAuth, userId } = await checkAuth(request);

    if (!isAuth) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Check if user is admin
    const { data: userProfile } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', userId)
      .single();

    if (userProfile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admin can update settings' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { dayRanges } = body as { dayRanges: DayRange[] };

    // Validate
    if (!dayRanges || !Array.isArray(dayRanges) || dayRanges.length === 0) {
      return NextResponse.json(
        { error: 'dayRanges is required and must be a non-empty array' },
        { status: 400 }
      );
    }

    // Validate each range
    for (const range of dayRanges) {
      if (typeof range.minDays !== 'number' || range.minDays < 0) {
        return NextResponse.json(
          { error: 'Each range must have a valid minDays value (>= 0)' },
          { status: 400 }
        );
      }
      if (!range.label || typeof range.label !== 'string') {
        return NextResponse.json(
          { error: 'Each range must have a label' },
          { status: 400 }
        );
      }
    }

    // Sort by minDays ascending
    const sortedRanges = [...dayRanges].sort((a, b) => a.minDays - b.minDays);

    // Upsert the setting
    const { data, error } = await supabaseAdmin
      .from('crm_settings')
      .upsert({
        setting_key: 'follow_up_day_ranges',
        setting_value: sortedRanges,
        description: 'ช่วงวันที่สำหรับติดตามลูกค้า (หน้า CRM และ LINE Chat)',
        updated_at: new Date().toISOString()
      }, {
        onConflict: 'setting_key'
      })
      .select()
      .single();

    if (error) {
      console.error('Error updating CRM settings:', error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      dayRanges: data.setting_value
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
