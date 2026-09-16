---
paths:
  - "app/store/**/*"
  - "lib/storefront*.ts"
  - "app/api/storefront/**/*"
  - "app/settings/storefront/**/*"
  - "app/api/settings/**/*"
  - "components/storefront/**/*"
---
# Storefront — หน้าร้านออนไลน์ + SEO/AEO + ตะกร้า/checkout

> ย้ายมาจาก CLAUDE.md (2026-09-10) · โหลดเองเมื่อ Claude อ่านไฟล์ที่ตรง `paths:` ด้านบน · งานหัวข้อนี้ที่ยังไม่ได้แตะไฟล์เหล่านั้น → `Read` ไฟล์นี้เองก่อนลงมือ

## 🛍 Storefront (เพิ่ม 2026-08-18 — หน้าร้านออนไลน์ + SEO/AEO)

**สถาปัตยกรรม: 1 engine 2 shells** — ตัดสินใจแล้วหลังเทียบ WooCommerce sync / custom WP plugin / iframe (ดู memory `storefront-architecture`)
1. **Standalone = surface หลัก** — `/store/[slug]` chrome ของ aoo เอง theme ต่อ company **ต้องทำ SEO+AEO ได้เต็ม ไม่ต้องมี WordPress**
2. **Embedded = add-on** สำหรับลูกค้าที่มีเว็บ WordPress อยู่แล้ว — plugin ดึง "เนื้อ" จาก aoo มาแปะในหน้า WP จริง (ยังไม่ทำ)
3. **Checkout อยู่บน aoo เต็มหน้าเสมอ** ทั้ง 2 ทาง (ยังไม่ทำ)
- ❌ **ห้ามย้อนไปเสนอ**: sync สินค้าเข้า WooCommerce · iframe (SEO ตาย + cookie ตะกร้าพังบน Safari ITP)

**กติกา SEO/AEO ที่ห้ามพัง**
- **ไม่มี `public_base_url` (โดเมนของร้านเอง) = `noindex` เสมอ** — SEO บนโดเมน aoo ไม่มีค่ากับลูกค้า + หลาย tenant โดเมนเดียวกัน · หน้า filter (`?cat=`) ก็ `noindex` กัน facet ระเบิด
- **ข้อเท็จจริงต้องเป็น text ใน server HTML** — AI crawler ส่วนใหญ่ไม่รัน JS · เขียนเป็น**ประโยคเต็ม** เพราะ AEO อ้างอิงทีละ passage
- **`/store/[slug]` ต้องอยู่ใน `PUBLIC_PREFIXES` ของ [proxy.ts](../../../proxy.ts)** ไม่งั้น Googlebot โดนเด้งไป `/login`
- Config เก็บใน `companies.settings.storefront` (JSONB) — [lib/storefront.ts](../../../lib/storefront.ts) (client-safe: theme token + URL builder) + [lib/storefront-server.ts](../../../lib/storefront-server.ts) (service role — **select เฉพาะ field ที่เปิดเผยได้** ห้ามหลุด cost_price/stock count/supplier) ห่อ `cache()` ให้ generateMetadata + page ใช้ fetch เดียว
- **สต็อกเปิดเผยเป็น boolean เท่านั้น** (`in_stock`) ห้ามส่งจำนวนจริงออกหน้าร้าน
- `products.slug` (unique ต่อ company, Thai-safe, backfill จากชื่อ) + `products.storefront_visible` (แยกจาก `is_active`)
- **ตัวตนของ "ร้าน" แยกขาดจาก "บริษัท" แล้ว (2026-09-08)** — ตั้งที่ `/settings/storefront` · ทุกช่องยกเว้นชื่อลิงก์ **เว้นว่าง = ตกไปใช้ของบริษัทตอนแสดงผล ไม่ copy มาเก็บ** (copy ไว้แล้วแก้ข้อมูลบริษัททีหลัง หน้าร้านจะค้างของเก่าโดยไม่มีใครรู้):

| อยากตั้งทับ | เก็บที่ | ว่างแล้วตกไปใช้ |
|---|---|---|
| **URL ของร้าน** | **`companies.storefront_slug`** (คอลัมน์จริง unique) | **ไม่มีทางถอย — ไม่ตั้ง = เปิดร้านไม่ได้** |
| ชื่อร้าน | `storefront.display_name` | `companies.name` |
| โลโก้ | `storefront.logo_url` | `companies.logo_url` |
| คำโปรย | `storefront.tagline` | `companies.description` |
| เบอร์ / อีเมล / ที่อยู่ (ท้ายหน้าร้าน) | `storefront.contact_phone/_email/_address` | `companies.phone/email/address` |

- ⛔ **`/store/[slug]` อ่านจาก `storefront_slug` อย่างเดียว ห้ามเอา `companies.slug` กลับมาเป็นทางถอย** — `companies.slug` เป็นตัวระบุภายในที่ลูกค้าไม่เคยเห็น (ไม่มีช่องแก้ใน UI · สร้างครั้งเดียวตอนสมัคร · `PUT /api/companies` ไม่รับด้วยซ้ำ) · เคยให้มันเป็นทางถอยแล้วกลายเป็น **สอง namespace ปนกัน** ต้องคอยกันชนข้ามคอลัมน์ทุกจุดที่เขียน — ตัดออกแล้วเหลือความจริงเดียวและ unique index ของ DB กันซ้ำให้พอ
- **ไม่มีชื่อลิงก์ = เปิดหน้าร้านไม่ได้** (กันทั้งที่ toggle และที่ API) — เปิดได้แต่ไม่มีใครเข้าถึงคือสภาพที่ไม่ควรมี · หน้าตั้งค่าเติม `companies.slug` ให้เป็น **ค่าที่แนะนำ** ตอนยังไม่เคยตั้ง แก้ทับได้ก่อนบันทึก
- **ชื่อลิงก์เปลี่ยนได้ครั้งเดียวทุก 7 วัน — ทุกกรณี ไม่ว่าร้านเปิดหรือปิดอยู่** (`companies.storefront_slug_changed_at` · `STOREFRONT_SLUG_LOCK_DAYS` — 2026-09-14 ลดจาก 30 และเลิกยกเว้นตอนร้านปิด ตามคำสั่งเจ้าของ) · ตั้งชื่อครั้งแรกจากว่างไม่นับเป็นการแก้ ไม่ stamp เวลา · ⛔ ห้ามกลับไปผูกล็อกกับ `enabled`
- **ช่องชื่อลิงก์ล็อกไว้เมื่อร้านมีชื่อแล้ว ต้องกด "แก้ไข" ก่อนถึงพิมพ์ทับได้** (มีปุ่มยกเลิกคืนค่าเดิม) · ยังไม่เคยตั้ง = เปิดให้พิมพ์ทันที · ชื่อเดิมไม่ขึ้นไอคอน ✓/✕ (ไม่มีอะไรให้ยืนยัน) · **กติกาตัวอักษร (`STOREFRONT_SLUG_RE/_RULE/_MAX` ใน lib/storefront.ts) มีที่เดียว** หน้าตั้งค่า · slug-check · PUT import ไปใช้ — ห้ามพิมพ์ regex/ข้อความซ้ำ · ไม่รับจุด (a–z 0–9 ขีดกลาง 3–40 ตัว)
- **ช่องที่ต้องเช็คความซ้ำ ต้องบอกผลตั้งแต่ตอนพิมพ์** — `GET /api/settings/storefront/slug-check?slug=` (debounce 400ms) คืน `available/current/taken/invalid` + วันที่เหลือของล็อก → ไอคอนในช่องกรอก (หมุน/✓/✕) · **ต้องใช้กติกาชุดเดียวกับ PUT เป๊ะ ๆ** ไม่งั้นหน้าจอบอกว่าว่างแล้วบันทึกโดนปฏิเสธ
- **`StorefrontCompany.slug` = slug สาธารณะที่ใช้ประกอบลิงก์ทุกที่** (sitemap · canonical · llms.txt) ไม่ใช่ `companies.slug` ดิบ — ใช้ตัวดิบจะได้ URL ที่พาไปคนละหน้า
- `companies.slug` **ไม่มีช่องแก้ใน UI** (สร้างอัตโนมัติจากชื่อบริษัทตอนสมัคร) และไม่ต้องแก้แล้ว — อยากได้ URL สวยให้ตั้ง `storefront_slug` แทน · ที่เคยแก้ `ampstark`→`abcthebaby` เป็นการ UPDATE ตรงที่ DB

**หน้ารายการสินค้า — แบ่งหน้า/เรียง/กรองที่ DB** (2026-09-14)
- RPC **`get_storefront_catalog(p_company_id, p_category, p_search, p_sort, p_stock_enabled, p_hide_out_of_stock, p_hide_no_image, p_limit, p_offset)`** → `(id, total_count)` — คืนแค่ id ของหน้านั้น แล้ว `getStorefrontCatalog()` ไปประกอบรายละเอียดเฉพาะ id นั้น **ตามลำดับที่ RPC ให้มา** (ห้ามเรียงชื่อทับ)
- ⛔ **เงื่อนไข "ขึ้นหน้าร้านได้" ใน RPC ต้องตรงกับ `getStorefrontProduct()` เป๊ะ** (`is_active` + `storefront_visible` + มี variation ที่ `is_active and deleted_at is null`) — ต่างกันเมื่อไหร่ = ลิงก์ในรายการพาไปหน้า 404
- แบ่งหน้า `STOREFRONT_PAGE_SIZE = 20` · `?page=N` (หน้า 1 ไม่ใส่) · `StorePagination` **ทุกลิงก์ต้องคง `cat` และ `q` เดิม** · หน้า >1 มี canonical ของตัวเอง (`?page=N`) + title ต่อท้าย " — หน้า N"
- **หน้าแรกไม่มี h1/คำโปรย** (เจ้าของสั่ง 2026-09-14 — ชื่อร้านอยู่ที่หัวร้าน คำโปรยอยู่ใน `<title>`/description พอ · ห้ามเอากลับมา) · หน้าหมวด h1 = ชื่อหมวด · หน้าค้นหา h1 = ผลการค้นหา
- ⛔ **สต็อกหน้าร้านมาจาก RPC `get_variation_stock` เท่านั้น — ห้ามอ่าน `product_variations.stock`** (คอลัมน์ค้าง ไม่มีใครอัปเดต ดู fix-bug.md 2026-09-14) · ร้านที่ไม่เปิดระบบคลังถือว่าพร้อมขายเสมอ
- config `show_out_of_stock` (มีผลเฉพาะเมื่อเปิดระบบคลัง) · `show_without_image` · `sort_by` ส่งผ่าน **`catalogOptionsFor(company)`** ทุก caller — **รวม `sitemap.xml` และ `llms.txt` ด้วย** (ไม่พา crawler ไปหน้าที่ลูกค้าหาไม่เจอในรายการ)

**ตัวเลือกที่ถูกเลือกให้ตอนเปิดหน้าสินค้า — กติกา 3 ชั้น ที่เดียว**
- `pickDefaultVariation()` ใน [lib/storefront-server.ts](../../../lib/storefront-server.ts) = **ความจริงเดียว** — ใช้ทั้ง `AddToCartButton` (ผ่าน `StorefrontProduct.default_variation_id`) และลำดับ swatch · ⛔ ห้ามเขียนกติกาซ้ำในหน้า/การ์ด ไม่งั้นการ์ดกับหน้าสินค้าเลือกคนละตัว
- ลำดับ: 1) ตัวที่ร้านตั้ง `product_variations.is_default` ไว้**และมีของ** → 2) ตัวที่**ขายดีที่สุด**ในบรรดาตัวที่มีของ → 3) ตัวแรกที่มีของ
- "ขายดี" มาจาก RPC **`get_variation_sales(company, variation_ids[], days=90)`** ผ่าน `fetchVariationSales()` — **นิยามต้องตรงกับ CTE `sold` ของ `get_storefront_catalog`** (ไม่นับ `order_status='cancelled'` · ย้อน 90 วันจาก `orders.created_at` · filter `company_id`) ไม่งั้น "ขายดี" มีสองความหมาย
- ⛔ ยิง**ครั้งเดียวต่อหน้า** (รวม variation ของทุกสินค้าในหน้า เหมือน `fetchAvailability()`) · ตัดสินค้าที่มีตัวเลือกเดียวทิ้งก่อนยิง (`multiOptionVariationIds`) — ห้ามยิงต่อสินค้า
- `buildSwatches()` ยก**ค่าของตัวที่ถูกเลือก**ขึ้นเป็นอันแรก (swatch โชว์แค่ 6 อันแรก) · ⛔ **ที่เหลือคงลำดับเดิม (`created_at`) ห้ามเรียงทั้งแถวตามยอดขาย** — ลำดับจะขยับเองเรื่อย ๆ ลูกค้าที่กลับมาดูซ้ำจะงง
- สินค้าชุดไม่เข้ากติกานี้ — มี `option_groups` เลือกทีละช่องของตัวเอง

**ตัวกรอง หมวด/แบรนด์ — คนละกติกากันโดยตั้งใจ**
- `?cat=` รับได้ทั้ง **slug และชื่อ** (`resolveCategoryParam` → คืน `{filter, name}`) เพราะลิงก์ `?cat=<ชื่อ>` ถูกส่งออกไปหาลูกค้าและอยู่ใน index ของ Google แล้ว ⛔ ห้ามตัดขาชื่อทิ้ง
- `?brand=` รับ **slug เท่านั้น** (RPC กรองด้วย slug ตรง ๆ) — ตัวกรองแบรนด์เป็นของใหม่ ไม่มีลิงก์เก่าให้รองรับ จึงไม่ต้องแบกความกำกวม "slug ของอันนึงชนชื่อของอีกอัน"
- ⛔ **แยก "ค่าที่ใช้กรอง" ออกจาก "ค่าที่ใช้แสดง"** — ค่าที่หาไม่เจอห้ามเอาไปวาดเป็น `<h1>`/`<title>`/JSON-LD (ไม่งั้นใครก็ยัด `?cat=<ข้อความอะไรก็ได้>` แล้วได้หน้าที่มีข้อความตัวเองบนโดเมนร้าน) · คำค้น `?q=` clamp 50 ตัวก่อนแสดง
- `product_categories.slug` / `product_brands.slug` / `products.slug` เติมด้วย **trigger ที่ DB** (`slugify_th` · เก็บอักษรไทย ไม่ทับศัพท์) ⛔ **แตะเฉพาะตอน INSERT ห้ามอัปเดตตามชื่อตอน UPDATE** — ทั้งหมดของ slug คือความเสถียรของลิงก์ที่ส่งไปแล้ว
- `getStorefrontCategories()` / `getStorefrontBrands()` คืนเฉพาะที่ **มีสินค้าขึ้นหน้าร้านจริง** (หมวดที่ไม่มีของ ลิงก์ไปแล้วเจอหน้าเปล่า) · หมวดยุบ **ตามชื่อ ไม่ใช่ตามแถว** (ร้านมีหมวดชื่อซ้ำได้จริง)
- ⛔ **`indexable` ต้องรวมตัวกรองใหม่ทุกตัว** (`!cat && !brand && !q`) และ `StorePagination` ต้องคงตัวกรองทุกตัวไว้ — ลืมที่ใดที่หนึ่ง = facet หลุดเข้า index หรือกดหน้า 2 แล้วหลุดตัวกรอง

**สต็อกของหน้าร้าน — ต้องตรงกันสามชั้น**
เพิ่มมิติใหม่ให้สต็อก (คลัง/ล็อต/สาขา) ต้องไล่ให้ครบ **ทั้งสามชั้น** ไม่งั้นลูกค้าเห็นของที่ซื้อไม่ได้:
**(1) RPC `get_storefront_catalog` ที่กรองรายการ** (`p_warehouse_id`) · **(2) `fetchAvailability()` ที่ตีป้าย "สินค้าหมด"** · **(3) ตัวจองตอน checkout**
— เคยตกชั้น (1) ไปแล้วตอนเพิ่ม `sell_warehouse_id` ⇒ หน้าร้านโชว์สินค้าที่ซื้อไม่ได้ 62 ตัว (ดู fix-bug.md 2026-09-17)

**ปิดร้าน vs พักรับออร์เดอร์ — คนละสวิตช์ ห้ามยุบรวม**
- `enabled: false` = ปิดเว็บ ทุก URL แสดงหน้า "ปิดร้าน" เหมือนกันหมด ⇒ **ต้อง noindex** (ไม่งั้นเนื้อหาซ้ำหลายร้อย URL) ⇒ **ถอนออกจาก Google ทั้งร้าน** · หน้าตั้งค่า**ต้องถามยืนยันก่อนปิดเสมอ** พร้อมเสนอสวิตช์ล่างแทน
- `accepting_orders: false` = เว็บเปิดดูได้ครบ แค่กดสั่งไม่ได้ · **ไม่แตะ SEO เลย** — นี่คือเหตุผลทั้งหมดที่แยกออกมา
- ⛔ **ด่านจริงอยู่ที่ `/api/storefront/checkout`** ไม่ใช่ปุ่มที่ disabled (เป็น public write path ใครก็ยิงตรงได้)

**วิธีชำระเงิน** — `getStorefrontPayments()` ประกอบจาก `payment_channels` ที่ร้านตั้งไว้จริง (หน้า /delivery · llms.txt · `paymentAccepted` ใน Store LD)
⛔ กรอง **`channel_group = 'bill_online'` เท่านั้น** (ช่องทาง POS ลูกค้าออนไลน์ใช้ไม่ได้ ประกาศไปคือโกหก) · ⛔⛔ **ห้าม select `config` ทั้งก้อน** — ในนั้นมี `api_key` · `webhook_secret` · `merchant_id` · `account_number` และฟังก์ชันนี้อยู่บนเส้นทางที่ออกสู่สาธารณะ

**SEO/AEO — กับดักที่เคยพังมาแล้ว**
- ⛔ **`noindex` + `canonical` ที่ชี้ไป URL อื่น = ห้ามจับคู่กัน** (Google อาจโอน noindex ไปติดหน้าเป้าหมาย — เคยชี้ไปหน้าแรก เสี่ยงหลุดทั้งร้าน) · หน้ากรอง/ค้นหาไม่ใส่ canonical เลย
- ⛔ JSON-LD ทุกจุดผ่าน **`jsonLdScript()`** (`JSON.stringify` ไม่ escape `<` ⇒ ชื่อสินค้าที่มี `</script>` ทำ LD พังเงียบ + ยัด HTML ได้) · URL ใน LD ต้องผ่าน **`storefrontAbsoluteUrl()`** (schema.org บังคับ absolute)
- ⛔ ช่องทางติดต่อของ **ร้าน** (`cfg.contact_*`) มาก่อน `company.*` **ทุกจุดที่ออกสู่สาธารณะ** — เคยหลุดที่ llms.txt ประกาศที่อยู่จดทะเบียนบริษัทให้ AI
- ⛔ ฟังก์ชันที่ห่อ `cache()` ต้องเรียกด้วย**อาร์กิวเมนต์ชุดเดียวกันทุกที่** — ต่างกัน = คนละคีย์ ยิง query ซ้ำโดยไม่มีอาการ
- ข้อเท็จจริงต้องเป็น **ประโยคเต็มใน server HTML** ไม่ใช่อยู่แต่ใน JSON-LD/ป้าย UI (หน้าสินค้าใช้ `.sf-sr-only`) · FAQ ใช้ `<h3>` จริง · ขั้นตอนใช้ `<ol>` จริง
- `ShopJsonLd` (Store + WebSite/SearchAction) วางที่ layout · ใส่เฉพาะร้านที่มี `public_base_url`

**Google Merchant** — ฟีด `/store/[slug]/feed.xml` (RSS 2.0 + `g:`) ร้านเอาไปใส่เป็น scheduled fetch
- **1 แถว = 1 ตัวเลือก ไม่ใช่ 1 สินค้า** · ผูกด้วย `item_group_id` เมื่อมีหลายตัวเลือก
- `g:id` ใช้ **id ของตัวเลือก ไม่ใช่ sku** (Merchant ผูกประวัติกับค่านี้ ต้องนิ่งตลอดอายุการขาย)
- ไม่มีทั้ง `gtin` และ `mpn` ต้องประกาศ `identifier_exists: no` ไม่งั้นโดนตีตกทั้งแถว
- ค่าจัดส่งเอา **เฉพาะโซนคิดค่าคงที่** — Lalamove คิดตามระยะทาง ประกาศตัวเลขผิด = Merchant ตีตก "price mismatch"
- ราคาลด: `g:price` = ราคา**ก่อนลด** + `g:sale_price` = ราคาจริง (สลับแล้วขีดฆ่าผิดด้าน) · `g:price` ออกได้ครั้งเดียว
- ⛔ **ไม่ใช้ `catalogOptionsFor()`** ต่างจาก sitemap/llms.txt โดยตั้งใจ — ฟีดส่งของหมดได้ (บอก `availability`) แต่ **บังคับต้องมีรูป**
- 404 เมื่อร้านยังไม่มีโดเมนของตัวเอง (Merchant บังคับ verify โดเมน)

**ตะกร้า + checkout** (เพิ่ม 2026-08-18)
- **ตะกร้าอยู่ใน localStorage ของโดเมนที่ผู้ใช้ยืนอยู่** ([lib/storefront-cart.ts](../../../lib/storefront-cart.ts)) — **ห้ามย้ายไป cookie ของโดเมน aoo** เพราะตอนฝังใน WordPress ลูกค้าจะกลายเป็น third-party cookie → Safari ITP บล็อก → ตะกร้าหาย (เหตุผลเดียวกับที่ไม่เลือก iframe) · ยังไม่แตะ DB จนกดยืนยัน
- **`/api/storefront/checkout` = public write path — ถือว่าทุก field เป็นของปลอม**: company มาจาก shop slug ไม่ใช่ body · **อ่านราคา/ชื่อใหม่จาก DB ทั้งหมด ไม่เชื่อตัวเลขจาก client** · variation ต้อง active + storefront_visible + เป็นของ company นี้ · ค่าส่งคำนวณใหม่จาก zone · เช็ค slot availability ซ้ำฝั่ง server (อาจเต็มระหว่างลูกค้ากรอกฟอร์ม → 409) · rate limit ต่อ IP · items insert fail = rollback order ทิ้ง
- `/api/storefront/delivery-options` — resolve โซน+ค่าส่ง+รอบที่ว่างจากที่อยู่ (ใช้ตอนกรอก checkout)
- ออเดอร์ลงเป็น `source='storefront'`, `flow_type='r_retail'`, status `new`/`pending` → เด้งไป `/bills/[id]` ที่มีอยู่แล้วเป็นหน้าชำระเงิน/ติดตาม

**ไฟล์**: [/store/[slug]](../../../app/store/[slug]/page.tsx) catalog + ItemList LD · [/p/[product]](../../../app/store/[slug]/p/[product]/page.tsx) Product+Offer+BreadcrumbList LD · [/delivery](../../../app/store/[slug]/delivery/page.tsx) **generate จาก `delivery_zones`/`delivery_slots` จริง** + FAQPage LD (หน้าที่ AEO อ้างมากสุด) · `sitemap.xml` / `robots.txt` (toggle AI crawler ต่อร้าน) / `llms.txt` · [/settings/storefront](../../../app/settings/storefront/page.tsx)

