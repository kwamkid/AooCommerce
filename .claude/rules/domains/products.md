---
paths:
  - "app/products/**/*"
  - "app/api/products/**/*"
  - "lib/bulk/**/*"
  - "components/products/**/*"
  - "components/bulk/**/*"
  - "app/promotions/**/*"
  - "app/api/promotions/**/*"
  - "lib/promotion-service.ts"
  - "lib/promotions/**/*"
---
# สินค้า — Import/Export · Bulk edit · Promotion

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## Promotion Module

### Types
`bundle_set`, `buy_get_free`, `buy_get_discount`, `qty_discount`

### Shopee Push
- `PushDealModal` → SSE progress → auto-export product if no link
- Action matrix: create/edit/push/sync/unsync/resync/delete × status

---

## Product Import/Export

### Export (1 ไฟล์ใหญ่ — ทุก field)
- ปุ่ม Export ในหน้าสินค้า — RPC `export_products` (products + shops + marketplace links)
- ID columns (A,B) สีเทา + locked | Parent row bold | Child rows แยกชัด
- ราคา marketplace แยกทุกร้าน (dynamic columns) | ชื่อไฟล์: `{all|filter}-product-{count}-{date}.xlsx`

### Bulk Edit (อัพเดท 2026-05-27 — แยก action เหมือน Shopee)
**Hub**: `/products/bulk` — เลือก action แล้วได้ template เฉพาะส่วนนั้น (เลียนแบบ Shopee mass_update_*)

| Action | URL | RPC | Editable fields |
|---|---|---|---|
| เพิ่มสินค้าใหม่ | `/products/bulk/create` | `bulk_create_products` | code, name, variations, brand, category, description (create-only, error if code exists) |
| ข้อมูลพื้นฐาน | `/products/bulk/basic-info` | `bulk_update_product_basic_info` | code, name, is_active, brand (by name), category (by name), description |
| ราคา | `/products/bulk/price` | `bulk_update_variation_prices` | default_price, discount_price, cost_price (perm) |
| สต็อก | `/inventory/bulk-stock-update` | (inline) | stock per warehouse |
| ราคา Marketplace | (planned) | — | per-shop prices |

**Pattern ทุก module**: Filter → Export → แก้ใน Excel → Upload → **Dry-run preview (diff)** → Confirm → Apply
- **Parser**: [lib/bulk/parse-template.ts](../../../lib/bulk/parse-template.ts) — header-based (ทนต่อ column reorder) — **ห้ามอ่าน column ตามตำแหน่ง** (เคยมี bug, ดู [fix-bug.md](../../../fix-bug.md))
- **APIs**: `/api/products/bulk/<action>/export` (GET, template data) + `/api/products/bulk/<action>/apply` (POST, dry_run + import)
- **RPC pattern**: ทุก bulk RPC return `{ results[], summary: {updated, unchanged, errors}, dry_run }`

### Legacy (ลบแล้ว 2026-05-27)
- ~~`/products/import`~~ (mega template) → แทนที่ด้วย `/products/bulk` hub
- ~~`/api/products/bulk-import`~~ → แทนที่ด้วย `/api/products/bulk/<action>/apply`
- `bulk_upsert_products` RPC ยังอยู่ใน DB (รอ drop ใน migration ต่อไป)

