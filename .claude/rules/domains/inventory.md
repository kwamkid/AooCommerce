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

- `GET /api/inventory?view=list` → RPC `get_inventory_list(company, page, limit, search, warehouse_ids[], category, brand, supplier, status, sort_by, sort_asc)` คืน `{items, total, status_counts}` · **path เดิม** `?warehouse_id=&limit=9999` / `?dealer_id=` ยังใช้โดยฟอร์มรับ/เบิก/โอน/PO/OrderForm 14 จุด (RPC `get_inventory_filtered`) — ห้ามแตะจนกว่าจะย้ายครบ (Phase 4–5)
- **แถว = 1 ตัวเลือก รวมทุกคลังในขอบเขต** (`p_warehouse_ids` null = ทุกคลัง · ตัวแทน = คลัง consignment ทุกใบของลูกค้า) · ตัดสินค้าชุดออก (ชุดย่อยไม่มีสต็อกของตัวเอง) · ตัวเลือกที่ถูกลบ/ปิด และสินค้าปิด ไม่แสดง
- `by_warehouse` ของแต่ละแถว = **ทุกคลังที่มีของจริง ไม่ตัดตามตัวกรอง** (กล่อง "แยกคลัง" ต้องบอกว่าของอยู่ไหนบ้าง) · `in_transit` มาจากคอลัมน์ `inventory.in_transit_quantity` ที่ stock-service ดูแล ส่วน `in_transit_breakdown` รายตัวแทนมาจากใบเติมของสถานะ `shipped` (สองค่านี้ต่างกันได้เล็กน้อย)
- **สถานะ** (ตัดสินจากยอดในขอบเขตคลังที่เลือก · `available = quantity − reserved`):
  `negative` <0 · `none` ไม่มีแถว `inventory` เลย (ยังไม่เคยมีสต็อก — ABC 5,346 จาก 6,216) · `out` ≤0 · `low` min>0 และ ≤min · `near_low` ≤min×1.5 · `ok`
  แท็บเริ่มต้น `stocked` = ทุกอย่างยกเว้น `none` · `all` = รวม none · ป้ายใช้ `StatusBadge domain="stockLevel"`
- รูปในแถว: รูปตัวเลือก → (สินค้าปกติเท่านั้น) รูปหลัก/`products.image` → **สินค้ามีตัวเลือกไม่ fallback** (กติกาเดียวกับหน้าสินค้า)
- Badge "สต็อกต่ำ" ใน Sidebar = RPC `get_low_stock_count` = แท็บ `low` เป๊ะ (มีแถว inventory · min>0 · 0 < พร้อมขายรวมทุกคลัง ≤ min · ตัดสินค้าชุด/ตัวที่ถูกลบ) — `api/header/summary` เรียกตัวนี้ ห้ามนับ `quantity <= 5` เอง

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
- เลือกสินค้าในฟอร์ม = `ProductSearchInput` โหมด server (`useServerSearch` + `/api/products/search`) · ยอดคงเหลือของบรรทัดที่เลือกผ่าน `get_variation_stock` — ⛔ ห้าม `?limit=9999` โหลดทั้งคลัง (เพดาน 1,000 แถว)
- AdjustStockModal รับ `by_warehouse` จากแถว ไม่โหลดคลังเพื่อหายอดตัวเดียว · โพสต์ `POST /api/inventory {warehouse_id, variation_id, new_quantity, notes}`
