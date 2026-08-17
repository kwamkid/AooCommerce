// Server-side delivery helpers (uses service role — API routes only).
// Client-safe logic (zone matching, fee, slot availability) lives in lib/delivery.ts.
import { supabaseAdmin } from '@/lib/supabase-admin';
import { buildSlotLabel } from '@/lib/delivery';

export interface DeliverySnapshot {
  delivery_zone_id: string | null;
  delivery_zone_label: string | null;
  delivery_slot_id: string | null;
  delivery_slot_label: string | null;
  delivery_slot_start: string | null;
  delivery_slot_end: string | null;
}

export const EMPTY_DELIVERY_SNAPSHOT: DeliverySnapshot = {
  delivery_zone_id: null,
  delivery_zone_label: null,
  delivery_slot_id: null,
  delivery_slot_label: null,
  delivery_slot_start: null,
  delivery_slot_end: null,
};

/**
 * Resolve zone/slot ids → snapshot columns for orders.
 * Labels + times are copied at save time so later edits to the zone/slot
 * never rewrite what the customer chose (same rule as tax invoice snapshot).
 * Ids not found under this company are silently dropped (cross-tenant guard).
 */
export async function resolveDeliverySnapshot(
  companyId: string,
  zoneId: string | null | undefined,
  slotId: string | null | undefined,
): Promise<DeliverySnapshot> {
  const snapshot: DeliverySnapshot = { ...EMPTY_DELIVERY_SNAPSHOT };

  if (zoneId) {
    const { data: zone } = await supabaseAdmin
      .from('delivery_zones')
      .select('id, name')
      .eq('id', zoneId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (zone) {
      snapshot.delivery_zone_id = zone.id;
      snapshot.delivery_zone_label = zone.name;
    }
  }

  if (slotId) {
    const { data: slot } = await supabaseAdmin
      .from('delivery_slots')
      .select('id, start_time, end_time')
      .eq('id', slotId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (slot) {
      snapshot.delivery_slot_id = slot.id;
      snapshot.delivery_slot_label = buildSlotLabel(slot);
      snapshot.delivery_slot_start = slot.start_time;
      snapshot.delivery_slot_end = slot.end_time;
    }
  }

  return snapshot;
}
