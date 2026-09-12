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
  - "lib/composite*.ts"
---
# สินค้า — สินค้าชุด · Import/Export · Bulk edit · Promotion

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## สต็อกที่แสดงในหน้าสินค้า — จาก `inventory` เท่านั้น

- ⛔ **`product_variations.stock` / `min_stock`-คู่-`stock` ใน view `products_with_variations` (`stock`, `simple_stock`) เป็นค่าเก่า** — ไม่ตรง `inventory` 763/872 ตัวเลือก (วัด 2026-09-11) · ห้ามแสดง ห้ามเอาไปคิด (`min_stock` ยังเป็นค่าตั้งที่ใช้ได้)
- **พร้อมขาย** = Σ `inventory.quantity − reserved_quantity` **ทุกคลัง รวมคลังฝากขายของตัวแทน** (เจ้าของตัดสิน 2026-09-11: "ของยังไม่ถูกขาย ถือว่ายังมี") — กติกาเดียวกับหน้าคลัง `get_inventory_filtered` · เลือกคลังเดียวได้ด้วย `warehouse_id` · RPC `get_variation_stock` (ดู `lib-services.md`)
- ระดับสินค้า: สินค้ามีตัวเลือก = Σ ตัวเลือกที่เปิด · **สินค้าชุด = "ชุดที่มีของ/ชุดทั้งหมด"** (ชุดย่อยใช้ชิ้นส่วนร่วม รวมกันแล้วนับซ้ำ)

## เปลี่ยนประเภทสินค้า (ปกติ ↔ มีตัวเลือก) หลังบันทึกแล้ว

- **เปลี่ยนได้** เมื่อไม่มีอะไรอ้างตัวเลือกที่ยังใช้อยู่ — ด่านอยู่ที่ [lib/product-type-change.ts](../../../lib/product-type-change.ts): `getTypeChangeBlockers()` = สต็อก**ยอดไม่เป็นศูนย์** (ร้านที่ไม่ใช้ระบบสต็อกจึงไม่ติด) · `order_items` · `marketplace_product_links` · เป็นชิ้นส่วนของสินค้าชุด → `typeChangeBlockReason()` ข้อความไทย · `GET /api/products/[id]` ส่ง `type_change_blockers` ให้ฟอร์มจางปุ่ม (ไม่ซ่อน) + PUT ตรวจซ้ำ**ก่อน write ตัวแรก** · สินค้าชุดเข้า/ออกไม่ได้เลย
- **ตอนสลับ** PUT soft-delete ตัวเลือกเดิมทั้งหมด (`deleted_at` **และ** `is_active=false` — RPC คลัง/export กรองด้วย `is_active` อย่างเดียว) + ลบแถว `product_images` รายตัวเลือก (ไฟล์ใน storage ไม่ลบ) · ห้าม hard-delete (`product_variations.id` ถูก FK 19 ตาราง)
- แถว `deleted_at` ไม่บวม DB (74 แถว / 2.8MB ทั้งตาราง วัด 2026-09-13) — ไม่ต้องกวาด

## สินค้าชุด (composite) — ชุดย่อย = variation จริง ไม่มีสต็อกของตัวเอง

**โมเดล**: `products.is_composite` + `composite_slots` (ช่องประกอบ `{key,name,product_id,variation_ids,quantity}`) · ชุดย่อยแต่ละคู่ (เช่น โครงดำ + ผ้าแดง) = แถว `product_variations` ปกติของสินค้าชุด → ออเดอร์ · POS · link marketplace · รายงาน ใช้ของเดิมได้หมด · ชิ้นส่วนอยู่ใน `product_variation_components(variation_id=ชุดย่อย, component_variation_id, quantity=ชิ้นต่อชุด)` · `product_variations.price_locked` = ตั้งราคาเอง
- **สต็อก**: `lib/stock-service.ts` แตก reserve/unreserve/deduct/deductAndUnreserve/return ไปที่ชิ้นส่วนเอง (`checkAvailable` เช็คครบทุกชิ้นก่อนตัด) · ⛔ ชุดย่อยมีแถว `inventory` ไม่ได้ — trigger `trg_guard_composite_inventory` ปฏิเสธ · พร้อมขาย = RPC `get_composite_availability` (ชิ้นที่เหลือน้อยสุด) ผ่าน `getCompositeAvailability()` · หน้าจัดการสต็อก (รับ/เบิก/โอน/เติมของ/ส่งห้าง/PO/bulk stock) ตัดสินค้าชุดออก (`/api/products?exclude_composite=true` · RPC คลังกรอง `NOT p.is_composite`)
- **ราคา**: ตั้งต้น = Σ ราคาชิ้นส่วน × จำนวน — trigger `trg_component_price_changed` คำนวณชุดที่ไม่ล็อกใหม่เมื่อราคาชิ้นส่วนเปลี่ยน (`recompute_composite_prices()` = สูตรจริง · `comboPrice()` ใน `lib/composite-shared.ts` = พรีวิว **ต้องตรงกัน**) · แก้ราคาชุดผ่าน Excel ราคา = ล็อกให้อัตโนมัติ
- **ต้นทุน**: `fetchCostMap()` คืน Σ WAC ชิ้นส่วน — ห้ามเขียน WAC ลงชุดย่อย
- **บิล/PDF**: trigger `trg_fill_composite_order_components` เติม `order_items.promotion_components` (role `'component'` · `product_name` = "สินค้า - ตัวเลือก") ให้บรรทัดชุดที่ไม่มี `promotion_id` · ⚠️ เซ็ตโปรโมชั่น bundle_set ก็ใช้ role `'component'` — แยกด้วย `isCompositeLine()` (ไม่มี `promotion_id`) เท่านั้น ห้ามดู role · ป้าย "ชุดประกอบ (N รายการ)" · ไม่โชว์ราคาต่อชิ้นส่วน · PDF หัวแถวใช้ `productDisplayName`
- **บันทึก**: ทุกทาง (ฟอร์ม `/api/products` · Excel) ผ่าน `saveCompositeVariations()` ใน `lib/composite-save.ts` ตัวเดียว — key ชุดย่อย = ชุดชิ้นส่วน (`comboKey`) แก้ช่องแล้วแถวเดิมยังอยู่ · ชุดที่หลุด soft-archive · ตรวจทุกอย่างก่อนเขียน (โยน `CompositeValidationError` ข้อความไทย) · ⛔ เปลี่ยนประเภทเข้า/ออกจากสินค้าชุดไม่ได้ · ห้ามชุดซ้อนชุด (trigger กันด้วย)
- **ฟอร์ม**: การ์ดประเภทที่ 3 ใน `ProductForm` + `components/products/composite/` (`useCompositeEditor` = state/payload · `CompositeEditor` = UI) · GET `/api/products/[id]` คืน `composite_slots/combos/options` · `?view=component` = สินค้า 1 ตัวพร้อมตัวเลือกให้ช่องประกอบ · สินค้าชุดมีชื่อ/คำอธิบาย/รูปหลัก/หมวด/แบรนด์/slug ของตัวเองเหมือนสินค้าทั่วไป
- **ตารางชุดย่อย** เรียงคอลัมน์ชุดเดียวกับตารางตัวเลือก: รูป → ชื่อ → SKU → (ตั้งราคาเอง) → ราคาปกติ → ราคาขาย → พร้อมขาย → เปิดขาย
- **รูปชุดย่อย**: อัปรายชุดในตารางชุดย่อย (flow รูปรายตัวเลือกเดิมของ ProductForm · ชุดใหม่ผูกรูปหลังบันทึกผ่าน `composite_combos: [{key, variation_id}]` ใน response) · ไม่มีรูปของตัวเอง = ใช้รูปชิ้นส่วนแทน: ช่องที่มีตัวเลือกมากสุดก่อน (`componentImageRank` + `comboFallbackImage` ใน composite-shared = กติกาเดียว · server `getComboFallbackImages`) — ⚠️ ต่างจากสินค้ามีตัวเลือกปกติที่ห้าม fallback ไปรูปสินค้า
- **หน้าร้าน**: `StorefrontProduct.option_groups` (1 กลุ่ม/ช่อง จาก `attributes` ของชุดย่อย · ช่องที่มีค่าเดียวไม่แสดง) + `variation.options` → `AddToCartButton` เลือกทีละช่อง ค่าที่ไม่มีชุดที่มีของคู่กับที่เลือกอยู่ = กดไม่ได้ · ข้อมูลชุดไม่ครบ (ชุดย่อยขาดค่า/เลือกซ้ำกัน) = ถอยไปรายการแบน · รูปหลักเปลี่ยนตามที่เลือกผ่าน `GalleryMainImage` (event `SF_VARIATION_IMAGE_EVENT` — ใช้กับสินค้ามีตัวเลือกที่มีรูปด้วย) · เพิ่มด่วนในหน้ารวม = ลิงก์ไปหน้าสินค้า · `composite_slots` ดิบห้ามส่งออกหน้าร้าน
- **Excel**: คอลัมน์ `ส่วนประกอบ (สินค้าชุด)` = `REF + REF×2` (REF = SKU → `รหัสสินค้า/ตัวเลือก` → รหัสสินค้าเดี่ยว) · parse/format ที่ `lib/bulk/composite-ref.ts` · สร้างผ่าน `importCompositeProducts()` (`lib/bulk/composite-import.ts`) หลัง RPC สร้างสินค้าปกติในไฟล์เดียวกันแล้ว · export มี `ราคาตั้งเอง`
- **ยังไม่ทำ**: ส่งขึ้น/ดึงจาก marketplace (รอ re-flow · Shopee Kit ได้แค่ 1 ชั้น ≤9 ตัวเลือก → ใช้ listing ปกติ 2 ชั้น) — ดู `todo.md`

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

