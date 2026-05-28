// Sales channels ↔ chat_accounts sync layer.
//
// sales_channels has two row flavors: manual (managed via /settings/sales-channels)
// and chat (one-to-one mirror of chat_accounts). The mirror has no UI of its own —
// any chat_accounts mutation must run through these helpers so OrderForm + filters
// see a consistent list. Migration 20260528_sales_channels.sql backfills existing
// rows; from this point forward the application owns the lifecycle.
//
// Soft-delete contract: when a chat account is removed we deactivate (is_active=false)
// the mirror row rather than deleting it, so historical orders.sales_channel_id still
// resolves to a name in detail/list views.

import { supabaseAdmin } from './supabase-admin';

type ChatPlatform = 'line' | 'facebook';

function buildCode(chatAccountId: string): string {
  return `chat_${chatAccountId}`;
}

function buildName(platform: ChatPlatform, accountName: string): string {
  return platform === 'line' ? `LINE - ${accountName}` : `FB - ${accountName}`;
}

/**
 * Mirror a newly-created chat account into sales_channels. Idempotent — safe to call
 * after a re-activation or if the trigger somehow fires twice.
 */
export async function createSalesChannelForChatAccount(args: {
  companyId: string;
  chatAccountId: string;
  platform: ChatPlatform;
  accountName: string;
}): Promise<void> {
  const { companyId, chatAccountId, platform, accountName } = args;

  // sort_order: place chat-linked rows after manual seeds (which end ~110).
  // Use next-available slot starting at 200.
  const { data: maxRow } = await supabaseAdmin
    .from('sales_channels')
    .select('sort_order')
    .eq('company_id', companyId)
    .gte('sort_order', 200)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextSort = (maxRow?.sort_order ?? 199) + 1;

  await supabaseAdmin
    .from('sales_channels')
    .upsert(
      {
        company_id: companyId,
        code: buildCode(chatAccountId),
        name: buildName(platform, accountName),
        channel_type: 'chat',
        platform,
        chat_account_id: chatAccountId,
        is_system: false,
        is_active: true,
        sort_order: nextSort,
      },
      { onConflict: 'company_id,code', ignoreDuplicates: false },
    );
}

/**
 * Keep the mirror row's name + is_active in sync when the chat account is edited.
 * Always safe to call even if the mirror row doesn't exist yet (will no-op).
 */
export async function syncSalesChannelFromChatAccount(args: {
  companyId: string;
  chatAccountId: string;
  platform: ChatPlatform;
  accountName: string;
  isActive: boolean;
}): Promise<void> {
  const { companyId, chatAccountId, platform, accountName, isActive } = args;

  const { data: existing } = await supabaseAdmin
    .from('sales_channels')
    .select('id')
    .eq('company_id', companyId)
    .eq('chat_account_id', chatAccountId)
    .maybeSingle();

  if (!existing) {
    // No mirror row yet (e.g. account predates this feature) — create it.
    await createSalesChannelForChatAccount({ companyId, chatAccountId, platform, accountName });
    if (!isActive) {
      await supabaseAdmin
        .from('sales_channels')
        .update({ is_active: false })
        .eq('company_id', companyId)
        .eq('chat_account_id', chatAccountId);
    }
    return;
  }

  await supabaseAdmin
    .from('sales_channels')
    .update({
      name: buildName(platform, accountName),
      is_active: isActive,
    })
    .eq('id', existing.id);
}

/**
 * Remove the mirror row when its chat account is disconnected.
 *
 * - If no orders reference the mirror → hard-delete (clean removal; row disappears
 *   from /settings/sales-channels and chat-channels list).
 * - If any orders reference it → fall back to is_active=false (after the chat_account
 *   delete, the FK SET NULL also clears chat_account_id, so the GET handler hides it
 *   from the UI while orders.sales_channel_id stays resolvable for historical lookups).
 */
export async function removeSalesChannelForChatAccount(args: {
  companyId: string;
  chatAccountId: string;
}): Promise<void> {
  const { companyId, chatAccountId } = args;

  const { data: mirror } = await supabaseAdmin
    .from('sales_channels')
    .select('id')
    .eq('company_id', companyId)
    .eq('chat_account_id', chatAccountId)
    .maybeSingle();

  if (!mirror) return;

  const { count } = await supabaseAdmin
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .eq('sales_channel_id', mirror.id);

  if ((count ?? 0) === 0) {
    await supabaseAdmin.from('sales_channels').delete().eq('id', mirror.id);
    return;
  }

  await supabaseAdmin
    .from('sales_channels')
    .update({ is_active: false })
    .eq('id', mirror.id);
}
