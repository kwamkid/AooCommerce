// Centralized package gating — decides which Feature เสริม toggles a company
// can turn on based on their active subscription. Used by:
//   - Onboarding wizard (channels step + warehouse step gating)
//   - Settings → Feature เสริม (lock toggles with upgrade hint)
//   - Sidebar (hide menu items whose feature is gated off)
//   - Server APIs that need to enforce limits (e.g. warehouse insert)
//
// Today only stock is package-gated (Free = stock disabled). The other
// FeatureFlags keys are always available; that may change as more packages
// are added — extend FEATURE_GATES below rather than scattering checks.

import type { FeatureFlags } from '@/lib/features';

export interface PackageGates {
  /** stock_enabled from packages.features */
  stockEnabled: boolean;
  /** max_warehouses from packages.features — null = unlimited */
  maxWarehouses: number | null;
}

// Permissive defaults — used when subscription/package is unknown.
// Prefer this over `false` so missing data doesn't lock users out by surprise.
export const PERMISSIVE_GATES: PackageGates = {
  stockEnabled: true,
  maxWarehouses: null,
};

// Build PackageGates from raw packages.features JSONB (matches stock-utils.ts).
export function gatesFromPackageFeatures(features: Record<string, unknown> | null | undefined): PackageGates {
  const f = features || {};
  return {
    stockEnabled: f.stock_enabled !== false,
    maxWarehouses: (f.max_warehouses as number | null | undefined) ?? null,
  };
}

// Per-feature lockout: returns reason string if locked, null if available.
// Add more gates here as packages grow more capabilities.
export function featureLockReason(key: keyof FeatureFlags, gates: PackageGates): string | null {
  switch (key) {
    case 'stock':
      return gates.stockEnabled ? null : 'แพ็คเกจปัจจุบันยังไม่รองรับระบบคลังสินค้า';
    default:
      return null;
  }
}

// Force any feature flags that are package-locked back to OFF, no matter what
// the user previously saved. Used when reading features so a downgraded
// subscription doesn't continue to expose disallowed UI.
export function applyPackageGates(features: FeatureFlags, gates: PackageGates): FeatureFlags {
  return {
    ...features,
    stock: gates.stockEnabled ? features.stock : false,
  };
}
