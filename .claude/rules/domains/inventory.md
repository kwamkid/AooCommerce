---
paths:
  - "app/inventory/**/*"
  - "app/api/inventory/**/*"
  - "lib/stock-service.ts"
  - "lib/stock-utils.ts"
  - "app/api/header/summary/**/*"
---
# สต็อก / คลังสินค้า — หน้า `/inventory` · RPC · กติกาแสดงผล

> สร้าง 2026-09-13 ตอนรื้อโมดูล (แผนเต็ม `memo/plan-stock-module-2026-09-13.md`) · โหลดเองเมื่อแตะไฟล์ตาม `paths:` · ตัดสต็อกจริงต้องผ่าน `lib/stock-service.ts` เสมอ (ดู `lib-services.md`)

## หน้ารายการ (แท็บสินค้าคงคลัง) — RPC `get_inventory_list` รอบเดียวจบ

- `GET /api/inventory?view=list` → RPC `get_inventory_list(company, page, limit, search, warehouse_ids[], category, brand, supplier, status, sort_by, sort_asc)` คืน `{items, total, status_counts}` · **path เดิม** `?warehouse_id=` / `?dealer_id=` (OrderForm สลับคลัง · ReplenishmentForm · หน้า PO · รายงานตัวแทน/ห้าง · DealerOrderForm) = `inventoryScopeView`: อ่าน `inventory` ของคลังที่ขอทั้งหมดผ่าน `fetchAllRows` รวมต่อตัวเลือก คืนแค่ `variation_id · quantity · reserved_quantity · available · in_transit_quantity` (+ `consign_breakdown` เมื่อเป็นตัวแทน) **ไม่มีข้อมูลสินค้า** · ไม่ส่งทั้งสอง = 400 · RPC `get_inventory_filtered` / `get_inventory_by_warehouse` / view `inventory_summary` ลบแล้ว (Phase 5)
- **แถว = 1 ตัวเลือก รวมทุกคลังในขอบเขต** (`p_warehouse_ids` null = ทุกคลัง · ตัวแทน = คลัง consignment ทุกใบของลูกค้า) · ตัดสินค้าชุดออก (ชุดย่อยไม่มีสต็อกของตัวเอง) · ตัวเลือกที่ถูกลบ/ปิด และสินค้าปิด ไม่แสดง
- `by_warehouse` ของแต่ละแถว = **ทุกคลังที่มีของจริง ไม่ตัดตามตัวกรอง** (กล่อง "แยกคลัง" ต้องบอกว่าของอยู่ไหนบ้าง) · `in_transit` มาจากคอลัมน์ `inventory.in_transit_quantity` ที่ stock-service ดูแล ส่วน `in_transit_breakdown` รายตัวแทนมาจากใบเติมของสถานะ `shipped` (สองค่านี้ต่างกันได้เล็กน้อย)
- **สถานะ** (ตัดสินจากยอดในขอบเขตคลังที่เลือก · `available = quantity − reserved`):
  `negative` <0 · `none` ไม่มีแถว `inventory` เลย (ยังไม่เคยมีสต็อก — ABC 5,346 จาก 6,216) · `out` ≤0 · `low` min>0 และ ≤min · `near_low` ≤min×1.5 · `ok`
  แท็บเริ่มต้น `stocked` = ทุกอย่างยกเว้น `none` · `all` = รวม none · ป้ายใช้ `StatusBadge domain="stockLevel"`
- รูปในแถว: รูปตัวเลือก → (สินค้าปกติเท่านั้น) รูปหลัก/`products.image` → **สินค้ามีตัวเลือกไม่ fallback** (กติกาเดียวกับหน้าสินค้า)
- Badge "สต็อกต่ำ" ใน Sidebar = RPC `get_low_stock_count` = แท็บ `low` เป๊ะ (มีแถว inventory · min>0 · 0 < พร้อมขายรวมทุกคลัง ≤ min · ตัดสินค้าชุด/ตัวที่ถูกลบ) — `api/header/summary` เรียกตัวนี้ ห้ามนับ `quantity <= 5` เอง

## แท็บความเคลื่อนไหว (ยุบ ประวัติ + Monitor แล้ว 2026-09-13) — RPC `get_inventory_transactions`

- `GET /api/inventory/transactions` → RPC รอบเดียวคืน `{items, total, summary}` · `summary` = จำนวน/ยอดต่อประเภท **ในตัวกรองเดียวกันยกเว้นตัวกรองประเภท** (การ์ด 8 ใบเห็นครบและกดเลือกได้) · ตัวกรอง: ช่วงเวลา (bare date → ขอบเขตเวลาไทย +07:00 ใน route) · คลัง/ตัวแทน · ตัวเลือกสินค้า · ประเภทหลายค่า (`types=a,b`) · ที่มา (`reference_type`) · ค้นหา (ชื่อ/รหัส/SKU/บาร์โค้ด/หมายเหตุ)
- URL: `?tab=movements&from=&to=&wh=&type=&ref=&q=&variation=&label=&page=` · ค่าเริ่มต้นช่วงเวลา = 7 วันล่าสุด (ไม่เขียนลง URL) · มี `variation` = ไม่จำกัดช่วง · `tab=history`/`monitor` เก่า map มาที่นี่
- `balance_after` = ยอดคงเหลือ**ของคลังนั้น**หลังรายการ ไม่ใช่รวมทุกคลัง (มี HelpHint บอก) · จำนวนแสดงเครื่องหมายตาม `POSITIVE_TYPES`/`NEGATIVE_TYPES` (adjust ใช้เครื่องหมายของค่าเอง)
- ลิงก์ที่มา: `MOVEMENT_REFERENCE_LINK` ใน `types.ts` (order · replenishment · transfer · receive · issue) — เพิ่ม reference_type ใหม่ต้องเพิ่ม `REFERENCE_TYPE_LABELS` ที่นั่นด้วย
- refresh อัตโนมัติผ่าน `useLiveRefresh` 30 วิ เฉพาะเมื่อช่วงเวลารวมวันนี้ · ห้าม `setInterval` เอง
- ดัชนี `idx_inv_tx_company_created (company_id, created_at desc)` ให้เรียงล่าสุดก่อนไม่ต้อง sort ทั้งบริษัท

## รายการเอกสาร 4 หน้า (รับเข้า · เบิกออก · โอนย้าย · PO) — กรอง/นับ/แบ่งหน้าที่ DB (Phase 3 · 2026-09-13)

- route list รับ `page limit search warehouse_id status created_by date_from date_to` (+ `supplier_id` ของ PO) คืน `{items, total, status_counts, users}` · `status_counts` = ตัวกรองเดียวกันยกเว้นสถานะ · `users` = ผู้ทำรายการทั้งหมดของเอกสารประเภทนั้น (ห้าม derive จากหน้าที่โหลด)
- หน้าใช้ hook กลาง `useDocListParams(basePath, {defaultStatus, extraKeys})` (URL: `q wh status by from to page limit`) + `DocListFilters` (ค้นหา · ช่วงวัน · คลัง · ผู้ทำ · slot `extra`) · ค่าเริ่มต้นช่วงวัน = 30 วันล่าสุด (ไม่เขียนลง URL) · `setParams` ลบ `status` เมื่อเท่ากับ default ของหน้า (โอนย้าย default `pending`)
- route PO ยังคืนคีย์เดิม `purchase_orders` และไม่ส่ง page/limit = limit 200 (ฟอร์มรับเข้าใช้เติมตัวเลือก PO) — อย่าตัด

## ฟอร์มรับเข้า / เบิกออก / โอนย้าย — `StockDocForm mode` ตัวเดียว (Phase 4 · 2026-09-13)

- `app/inventory/components/StockDocForm.tsx` · หน้า `receive|issue|transfer/page.tsx` เป็น wrapper 8 บรรทัด · เลือกสินค้าด้วย `useServerSearch` + `/api/products/search?exclude_composite=1` (route กรอง `products.is_composite` ให้) · ยอดเฉพาะบรรทัดที่เลือกผ่าน **`GET /api/inventory/stock?variation_ids=&warehouse_id=`** (RPC `get_variation_stock` · `cost` map เฉพาะ `canViewCost` ใช้เติมต้นทุนรับเข้า)
- POST `receives/issues/transfers` **ตรวจทุกบรรทัดก่อน write ตัวแรก** ผ่าน `parseStockDocLines()` + `checkStockAvailability()` ใน `lib/stock-utils.ts` (ใช้ RPC `get_variation_stock` — อ่าน `inventory` ตรงจะตัดสินสินค้าชุดเป็น 0) → 400 ระบุรายการที่ผิด · โอนย้ายไม่บันทึกบางส่วนอีกแล้ว (เดิมบรรทัดของไม่พอหายเงียบ) · atomic จริงยังไม่ทำ (ต้องย้าย stock-service ลง SQL)
- route เอกพจน์ `receive/issue/transfer` ลบแล้ว — UI ใช้พหูพจน์เท่านั้น

## บทเรียนเขียน RPC รายการ (วัดจริง 2026-09-13 บน ABC 6,216 ตัวเลือก)

1. **ต้องเป็น `language plpgsql`** — `language sql` วางแผน query ใหม่ทุกครั้งที่เรียก (12 CTE × หลายตาราง = 500+ ms บนเครื่อง DB นี้) · plpgsql cache plan ต่อ session ของ PostgREST → ครั้งแรก ~500 ms แล้ว 44–69 ms
2. **สแกนแถวทั้งหมดด้วยคอลัมน์แคบ** (id · ตัวเลข · ชื่อไว้เรียง) แล้วค่อย join คอลัมน์หนัก (รูป · attributes · SKU · barcode) เฉพาะแถวในหน้า — อ่านคอลัมน์หนักครบ 6,000 แถว = 209 ms vs 10 ms
3. lookup ที่จำกัดด้วยแถวในหน้า ใช้ `= any(coalesce((select array_agg(id) …), '{}'::uuid[]))` — `in (select … from cte)` ทำ planner เดาขนาด CTE ผิดแล้วไป seq scan ตารางรูป/คลังทั้งตาราง (77 ms)
4. `materialized` เฉพาะ CTE ที่ถูกอ้างหลายครั้ง (params · page · counts) — ที่เหลือปล่อยให้ planner pipeline
5. ค้นหาแยกเป็นสองชุด id ที่ใช้ trgm index (products name/code · variations sku/barcode) แล้ว `union` — แบบเดียวกับ `get_products_list`
6. เวลาบนเครื่อง DB นี้แกว่งมาก (query เดียวกัน 4 ↔ 150 ms) — วัดซ้ำ ≥3 รอบ และดู mean จาก `pg_stat_statements` ของจริง (`get_inventory_filtered` เดิม mean 103 ms · `get_products_list` mean 259 ms ไม่ใช่ 14 ms ที่เคยจด)

## กติกา UI ของโมดูล (ทุกหน้าใน `app/inventory/**`)

- กรอง/แบ่งหน้า/นับ **ที่ DB เสมอ** — ห้าม `filter()`/`slice()` รายการใน client (เคยทำให้แท็บสถานะกรองแค่ 20 แถวที่โหลด)
- ตาราง = `DataTable` + `StatusTabs` + `SearchInput`/`FormSelect` · tooltip ตัวเลข = `HelpHint portal` · เมนูแถว = `ActionMenu` · แก้ค่าที่แก้บ่อย (Min) inline ในคอลัมน์ + หลายแถวผ่าน `BulkActionBar`
- ตัวกรอง/แท็บ/หน้า อยู่ใน URL (`?tab=&q=&wh=&status=&page=` …) — ลิงก์จากแถวสต็อกไปประวัติ = `?tab=history&variation=<id>`
- เลือกสินค้าในฟอร์ม = `ProductSearchInput` โหมด server (`useServerSearch` + `/api/products/search`) · ยอดคงเหลือของบรรทัดที่เลือกผ่าน `GET /api/inventory/stock` (`get_variation_stock`) — ⛔ ห้าม `?limit=9999` (route เพิกเฉย limit แล้ว คืนครบผ่าน `fetchAllRows`) · ตารางร้อน (`product_variations` · `inventory` · `products`) ตั้ง autovacuum scale 5% ไว้แล้ว
- AdjustStockModal รับ `by_warehouse` จากแถว ไม่โหลดคลังเพื่อหายอดตัวเดียว · โพสต์ `POST /api/inventory {warehouse_id, variation_id, new_quantity, notes}`
