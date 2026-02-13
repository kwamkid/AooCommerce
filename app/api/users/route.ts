// Path: app/api/users/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

// Type definitions
interface UserData {
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'manager' | 'operation' | 'sales';
  phone?: string;
  is_active?: boolean;
}

// สร้าง Supabase Admin client (service role)
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

// Helper function: ตรวจสอบว่าเป็น admin หรือไม่
async function checkIsAdmin(request: NextRequest): Promise<boolean> {
  try {
    // Get token from Authorization header
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader?.startsWith('Bearer ')) {
      console.log('No auth header found');
      return false;
    }
    
    const token = authHeader.substring(7);
    
    // Verify token with Supabase
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
    
    if (error || !user) {
      console.log('Invalid token or no user:', error);
      return false;
    }
    
    // Check if user is admin from database
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profileError) {
      console.log('Error fetching profile:', profileError);
      return false;
    }
    
    return profile?.role === 'admin';
  } catch (error) {
    console.error('Auth check error:', error);
    return false;
  }
}

// POST - สร้าง user ใหม่ (Admin only)
export async function POST(request: NextRequest) {
  try {
    // ตรวจสอบสิทธิ์ admin
    const isAdmin = await checkIsAdmin(request);
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const userData: UserData = await request.json();

    // Validate required fields
    if (!userData.email || !userData.password || !userData.name || !userData.role) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(userData.email)) {
      return NextResponse.json(
        { error: 'Invalid email format' },
        { status: 400 }
      );
    }

    // Validate password length
    if (userData.password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existingUser } = await supabaseAdmin
      .from('user_profiles')
      .select('id')
      .eq('email', userData.email)
      .single();

    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 }
      );
    }

    // Create auth user with metadata
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: userData.email,
      password: userData.password,
      email_confirm: true, // Auto confirm email
      user_metadata: {
        name: userData.name,
        role: userData.role,
        phone: userData.phone
      }
    });

    if (authError) {
      console.error('Auth creation error:', authError);
      return NextResponse.json(
        { error: authError.message },
        { status: 400 }
      );
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Profile should be created by trigger, but ensure it exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        id: authData.user.id,
        email: userData.email,
        name: userData.name,
        role: userData.role,
        phone: userData.phone || null,
        is_active: userData.is_active !== undefined ? userData.is_active : true
      })
      .select()
      .single();

    if (profileError) {
      console.error('Profile error:', profileError);
      // Try to clean up auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      return NextResponse.json(
        { error: 'Failed to create user profile: ' + profileError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      user: {
        id: authData.user.id,
        email: userData.email,
        name: userData.name,
        role: userData.role
      }
    });
  } catch (error) {
    console.error('Server error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET - ดึงรายการ users (Admin only)
export async function GET(request: NextRequest) {
  try {
    // ตรวจสอบสิทธิ์ admin
    const isAdmin = await checkIsAdmin(request);
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ users: data });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT - อัพเดท user (Admin only)
export async function PUT(request: NextRequest) {
  try {
    // ตรวจสอบสิทธิ์ admin
    const isAdmin = await checkIsAdmin(request);
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { id, name, role, phone, is_active } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .update({
        name,
        role,
        phone,
        is_active,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    // Update auth metadata if role changed
    if (role && data) {
      await supabaseAdmin.auth.admin.updateUserById(id, {
        user_metadata: { role }
      });
    }

    return NextResponse.json({ 
      success: true,
      user: data 
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - ลบ/ระงับ user (Admin only)
export async function DELETE(request: NextRequest) {
  try {
    // ตรวจสอบสิทธิ์ admin
    const isAdmin = await checkIsAdmin(request);
    
    if (!isAdmin) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('id');
    const hardDelete = searchParams.get('hard') === 'true';

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      );
    }

    if (hardDelete) {
      // Hard delete - ลบจริง
      await supabaseAdmin.auth.admin.deleteUser(userId);
    } else {
      // Soft delete - ระงับการใช้งาน
      const { error } = await supabaseAdmin
        .from('user_profiles')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', userId);

      if (error) {
        return NextResponse.json(
          { error: error.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}