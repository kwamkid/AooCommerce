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
- **ชื่อลิงก์เปลี่ยนได้ครั้งเดียวทุก 30 วัน — แต่นับเฉพาะการเปลี่ยนที่เกิดตอนร้านเปิดอยู่** (`companies.storefront_slug_changed_at` · `STOREFRONT_SLUG_LOCK_DAYS`) · ปิดร้านอยู่ = ยังไม่มีลิงก์ไหนอยู่ข้างนอก แก้คำที่พิมพ์ผิดได้อิสระ **และไม่ stamp เวลา** (stamp ตอนปิดร้านด้วย = เปิดร้านปุ๊บติดล็อกทันทีทั้งที่ยังไม่เคยส่งลิงก์ให้ใคร)
- **ช่องที่ต้องเช็คความซ้ำ ต้องบอกผลตั้งแต่ตอนพิมพ์** — `GET /api/settings/storefront/slug-check?slug=` (debounce 400ms) คืน `available/current/taken/invalid` + วันที่เหลือของล็อก → ไอคอนในช่องกรอก (หมุน/✓/✕) · **ต้องใช้กติกาชุดเดียวกับ PUT เป๊ะ ๆ** ไม่งั้นหน้าจอบอกว่าว่างแล้วบันทึกโดนปฏิเสธ
- **`StorefrontCompany.slug` = slug สาธารณะที่ใช้ประกอบลิงก์ทุกที่** (sitemap · canonical · llms.txt) ไม่ใช่ `companies.slug` ดิบ — ใช้ตัวดิบจะได้ URL ที่พาไปคนละหน้า
- `companies.slug` **ไม่มีช่องแก้ใน UI** (สร้างอัตโนมัติจากชื่อบริษัทตอนสมัคร) และไม่ต้องแก้แล้ว — อยากได้ URL สวยให้ตั้ง `storefront_slug` แทน · ที่เคยแก้ `ampstark`→`abcthebaby` เป็นการ UPDATE ตรงที่ DB

**ตะกร้า + checkout** (เพิ่ม 2026-08-18)
- **ตะกร้าอยู่ใน localStorage ของโดเมนที่ผู้ใช้ยืนอยู่** ([lib/storefront-cart.ts](../../../lib/storefront-cart.ts)) — **ห้ามย้ายไป cookie ของโดเมน aoo** เพราะตอนฝังใน WordPress ลูกค้าจะกลายเป็น third-party cookie → Safari ITP บล็อก → ตะกร้าหาย (เหตุผลเดียวกับที่ไม่เลือก iframe) · ยังไม่แตะ DB จนกดยืนยัน
- **`/api/storefront/checkout` = public write path — ถือว่าทุก field เป็นของปลอม**: company มาจาก shop slug ไม่ใช่ body · **อ่านราคา/ชื่อใหม่จาก DB ทั้งหมด ไม่เชื่อตัวเลขจาก client** · variation ต้อง active + storefront_visible + เป็นของ company นี้ · ค่าส่งคำนวณใหม่จาก zone · เช็ค slot availability ซ้ำฝั่ง server (อาจเต็มระหว่างลูกค้ากรอกฟอร์ม → 409) · rate limit ต่อ IP · items insert fail = rollback order ทิ้ง
- `/api/storefront/delivery-options` — resolve โซน+ค่าส่ง+รอบที่ว่างจากที่อยู่ (ใช้ตอนกรอก checkout)
- ออเดอร์ลงเป็น `source='storefront'`, `flow_type='r_retail'`, status `new`/`pending` → เด้งไป `/bills/[id]` ที่มีอยู่แล้วเป็นหน้าชำระเงิน/ติดตาม

**ไฟล์**: [/store/[slug]](../../../app/store/[slug]/page.tsx) catalog + ItemList LD · [/p/[product]](../../../app/store/[slug]/p/[product]/page.tsx) Product+Offer+BreadcrumbList LD · [/delivery](../../../app/store/[slug]/delivery/page.tsx) **generate จาก `delivery_zones`/`delivery_slots` จริง** + FAQPage LD (หน้าที่ AEO อ้างมากสุด) · `sitemap.xml` / `robots.txt` (toggle AI crawler ต่อร้าน) / `llms.txt` · [/settings/storefront](../../../app/settings/storefront/page.tsx)

