// Path: lib/consignment-warehouse.ts
// Resolve consignment warehouses (server-only).
// Takes the Supabase client as a param (same pattern as stock-service) so both
// authenticated routes (shared supabaseAdmin) and public routes (local client)
// can use it.
//
// Since branch counters (consignment_counters), one customer can own SEVERAL
// consignment warehouses (1 counter = 1 warehouse). Legacy customer-level flows
// must therefore never assume a single row: they resolve to the OLDEST warehouse
// (the original customer-level one, adopted by counter #1) until each flow
// becomes counter-aware (Phase 3).

import type { SupabaseClient } from '@supabase/supabase-js';

/** Customer-level consignment warehouse (oldest wins when counters added more). */
export async function getCustomerConsignmentWarehouse(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
): Promise<{ id: string } | null> {
  const { data } = await supabase
    .from('warehouses')
    .select('id')
    .eq('company_id', companyId)
    .eq('customer_id', customerId)
    .eq('warehouse_type', 'consignment')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/**
 * Destination warehouse for a consignment shipment (replenishment / department order):
 * the branch counter's warehouse when the shipment targets a counter, else the
 * customer-level consignment warehouse.
 */
export async function getConsignmentDestinationWarehouse(
  supabase: SupabaseClient,
  companyId: string,
  customerId: string,
  counterId?: string | null,
): Promise<{ id: string } | null> {
  if (counterId) {
    const { data: counter } = await supabase
      .from('consignment_counters')
      .select('warehouse_id')
      .eq('id', counterId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (counter?.warehouse_id) return { id: counter.warehouse_id };
  }
  return getCustomerConsignmentWarehouse(supabase, companyId, customerId);
}
