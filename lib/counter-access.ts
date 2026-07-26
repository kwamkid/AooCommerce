// Path: lib/counter-access.ts
// Server-only access checks for branch counters.
// A PC user can work a counter when they are assigned to it (counter_assignments),
// OR when their membership has pc_all_counters = true ("หน่วยแทน" rover — every
// active counter company-wide, new branches included automatically).

import type { SupabaseClient } from '@supabase/supabase-js';

/** True when the member is a rover (pc_all_counters). */
export async function isPcRover(
  supabase: SupabaseClient,
  companyId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('company_members')
    .select('pc_all_counters')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();
  return data?.pc_all_counters === true;
}

/** True when the user may record/view sales for this counter (assigned OR rover). */
export async function canAccessCounter(
  supabase: SupabaseClient,
  companyId: string,
  counterId: string,
  userId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('counter_assignments')
    .select('id')
    .eq('company_id', companyId)
    .eq('counter_id', counterId)
    .eq('user_id', userId)
    .maybeSingle();
  if (data) return true;
  return isPcRover(supabase, companyId, userId);
}
