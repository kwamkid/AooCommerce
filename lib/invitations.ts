// Path: lib/invitations.ts
// จุดเดียวของ logic "รับคำเชิญเข้าบริษัท" — เดิมถูกเขียนซ้ำ 4 ที่
// (accept-invite, invitations/[token], LINE login, register) แล้วพฤติกรรม
// แตกกันจนเป็นทั้ง bug (เชิญซ้ำไม่อัพเดท role) และช่องยกระดับสิทธิ์
// (ลิงก์เชิญเขียนทับ membership ใครก็ได้) — ห้าม inline logic นี้ใน route อีก
//
// กติกาความปลอดภัย:
// - สมาชิกใหม่ → insert ตามคำเชิญ (ลิงก์เชิญคือ bearer token สำหรับ "เข้าร่วม")
// - สมาชิกเดิม → อัพเดทสิทธิ์ตามคำเชิญ "เฉพาะเมื่อคำเชิญผูก email และตรงกับ
//   บัญชีที่กดรับ" (= admin ตั้งใจเชิญคนนี้ซ้ำเพื่อเปลี่ยนสิทธิ์/เปิดใช้งานคืน)
//   ลิงก์แชร์ที่ไม่ผูก email ห้ามแก้สิทธิ์สมาชิกเดิมเด็ดขาด — กันเคส sales
//   เก็บลิงก์ admin ในแชทมากดเลื่อนขั้นตัวเอง / owner เผลอกดลิงก์เก่าแล้วโดนลดขั้น
// - สมาชิกเดิมที่เป็น owner → ไม่แตะเลยไม่ว่ากรณีไหน (ไม่มีทางกู้ owner คืนจาก API)
// - token ถูก mark accepted เฉพาะเมื่อมีการ insert/update จริง — เคส no-op
//   ปล่อย pending ไว้ให้คนที่ถูกเชิญตัวจริงใช้ต่อ

import { SupabaseClient } from '@supabase/supabase-js';
import { resolveCanViewCost } from '@/lib/permissions';

export interface InvitationRow {
  id: string;
  company_id: string;
  email: string | null;
  roles: string[];
  invited_by: string | null;
  warehouse_ids: string[] | null;
  terminal_ids: string[] | null;
  can_view_cost: boolean | null;
}

export type ApplyInvitationResult =
  | { status: 'joined' | 'updated' }
  | { status: 'already_member' }   // ลิงก์ไม่ผูก email + เป็นสมาชิกอยู่แล้ว → no-op, token ไม่ถูกใช้
  | { status: 'owner_untouched' }  // เป้าหมายเป็น owner → no-op, token ไม่ถูกใช้
  | { status: 'email_mismatch' }   // คำเชิญผูก email คนอื่น → ปฏิเสธ
  | { status: 'error'; error: string };

export async function applyInvitation(
  admin: SupabaseClient,
  invitation: InvitationRow,
  user: { id: string; email?: string | null },
): Promise<ApplyInvitationResult> {
  const { data: existingMember } = await admin
    .from('company_members')
    .select('id, roles')
    .eq('company_id', invitation.company_id)
    .eq('user_id', user.id)
    .single();

  if (existingMember) {
    if (Array.isArray(existingMember.roles) && existingMember.roles.includes('owner')) {
      return { status: 'owner_untouched' };
    }

    const invEmail = (invitation.email || '').trim().toLowerCase();
    const userEmail = (user.email || '').trim().toLowerCase();
    if (!invEmail) {
      // ลิงก์แชร์ — พิสูจน์ไม่ได้ว่าตั้งใจเชิญคนนี้ → ห้ามแก้สิทธิ์สมาชิกเดิม
      return { status: 'already_member' };
    }
    if (invEmail !== userEmail) {
      return { status: 'email_mismatch' };
    }

    // Re-invite ที่ยืนยันตัวตนแล้ว = admin ตั้งใจตั้งสิทธิ์ใหม่ตามคำเชิญนี้
    // (invitation ไม่มี warehouse/terminal = ทุกคลัง ตาม convention ตอนสร้าง)
    const { error: updateError } = await admin
      .from('company_members')
      .update({
        roles: invitation.roles,
        terminal_ids: invitation.terminal_ids ?? null,
        warehouse_ids: invitation.warehouse_ids ?? null,
        can_view_cost: resolveCanViewCost(invitation.roles, invitation.can_view_cost),
        is_active: true,
      })
      .eq('id', existingMember.id);

    if (updateError) {
      console.error('applyInvitation: member update error:', updateError);
      return { status: 'error', error: 'ไม่สามารถอัพเดทสิทธิ์สมาชิกได้' };
    }
    await markAccepted(admin, invitation.id);
    return { status: 'updated' };
  }

  const { error: insertError } = await admin.from('company_members').insert({
    company_id: invitation.company_id,
    user_id: user.id,
    roles: invitation.roles,
    invited_by: invitation.invited_by,
    terminal_ids: invitation.terminal_ids ?? null,
    warehouse_ids: invitation.warehouse_ids ?? null,
    can_view_cost: resolveCanViewCost(invitation.roles, invitation.can_view_cost),
    is_active: true,
  });

  if (insertError) {
    console.error('applyInvitation: member insert error:', insertError);
    return { status: 'error', error: 'ไม่สามารถเพิ่มสมาชิกได้' };
  }
  await markAccepted(admin, invitation.id);
  return { status: 'joined' };
}

async function markAccepted(admin: SupabaseClient, invitationId: string): Promise<void> {
  const { error } = await admin
    .from('company_invitations')
    .update({ status: 'accepted' })
    .eq('id', invitationId);
  // ไม่ fatal — membership เขียนสำเร็จแล้ว แต่ต้องเห็นใน log ว่า token ยังไม่ถูกเผา
  if (error) console.error('applyInvitation: mark accepted error:', error);
}
