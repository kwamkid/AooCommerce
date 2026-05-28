// Single source of truth for role-based permissions.
//
// Use this from BOTH client and server — pure functions, no Supabase deps.
// API route:    if (!can(auth.companyRoles, 'inventory.manage')) return 403;
// Client page:  const { allowed } = useAuthGuard('customer.edit');
//
// Adding/changing a permission = edit this file only.
// Migration plan: see todo.md "🔐 Centralized Permission System".

import type { CompanyRole } from '@/types';

// ─── Role groups (reused across capabilities) ────────────────────────
// Naming: keep these short — the capabilities below should read fluently.

const OWNER_ONLY = ['owner']                                        as const;
const ADMIN_PLUS = ['owner','admin']                                as const;  // strict: no manager
const ADMIN      = ['owner','admin','manager']                      as const;  // standard admin tier
const STAFF      = ['owner','admin','manager','warehouse']          as const;  // + warehouse ops
const SALES_TEAM = ['owner','admin','manager','sales']              as const;  // sales actions
const CRM_VIEW   = ['owner','admin','manager','sales','account']    as const;  // read-side: also accounting
const FINANCE    = ['owner','admin','manager','account']            as const;  // accounting actions

// ─── Capability matrix ────────────────────────────────────────────────
// Pattern: '{domain}.{action}'. Group by domain, alphabetical inside.

export const CAPABILITIES = {
  // Company-level
  'company.delete':              OWNER_ONLY,    // ลบบริษัท
  'company.edit':                ADMIN,         // logo, name, info

  // Members
  'members.view':                ADMIN,
  'members.invite':              ADMIN,         // invite staff/sales/cashier
  'members.grant_admin':         ADMIN_PLUS,    // promote to admin/owner — prevent escalation

  // Settings (page-level access)
  'settings.access':             ADMIN,         // general settings page
  'settings.delete_all_data':    ADMIN_PLUS,    // destructive — strict

  // Master data (1 capability per page; same tier today but ready to split)
  'masterdata.warehouses':       ADMIN,
  'masterdata.carriers':         ADMIN,
  'masterdata.suppliers':        ADMIN,
  'masterdata.payment_channels': ADMIN,
  'masterdata.sales_channels':   ADMIN,
  'masterdata.pos_terminals':    ADMIN,
  'masterdata.chat_channels':    ADMIN,         // LINE, Facebook, chat accounts
  'masterdata.brands':           ADMIN,
  'masterdata.categories':       ADMIN,

  // Inventory
  'inventory.view':              STAFF,
  'inventory.manage':            STAFF,         // transfer, receive, issue, adjust

  // Products
  'product.bulk_edit':           STAFF,         // Excel template import

  // Customers
  'customer.view':               CRM_VIEW,      // list + view (account also)
  'customer.edit':               SALES_TEAM,    // create/edit (sales but not account)

  // Suppliers / reports
  'supplier.edit':               ADMIN,
  'report.supplier.view':        FINANCE,
  'report.supplier.create':      FINANCE,
  'report.supplier.delete':      ADMIN,         // no 'account' for destructive

  // Marketplace (Shopee, TikTok, etc.)
  'marketplace.connect':         ADMIN,         // OAuth, account CRUD
  'marketplace.sync':            ADMIN,         // sync orders, products
  'marketplace.ship':            ADMIN,         // bulk-ship, label print, ship order
  'marketplace.push':            ADMIN,         // push price/stock/products to platform

  // Orders
  'order.split':                 ADMIN,         // split/unsplit (Shopee + manual)

  // POS
  'pos.manage':                  ADMIN,         // terminals + POS order management

  // Onboarding (initial setup wizard)
  'onboarding.manage':           ADMIN,

  // Logs / Admin tools
  'logs.view':                   ADMIN,
  'invoice.backfill':            ADMIN,
} as const satisfies Record<string, readonly CompanyRole[]>;

export type Capability = keyof typeof CAPABILITIES;

// ─── Public API ───────────────────────────────────────────────────────

/**
 * Check if the given roles have a capability.
 * Pure function — safe for client + server.
 *
 * @example
 *   if (!can(auth.companyRoles, 'inventory.manage')) return 403;
 *   const allowed = can(userProfile?.roles, 'customer.edit');
 */
export function can(
  roles: readonly string[] | undefined | null,
  capability: Capability,
): boolean {
  if (!roles || roles.length === 0) return false;
  const allowed = CAPABILITIES[capability] as readonly string[];
  return roles.some(r => allowed.includes(r));
}
