# Fix Bug

Systematic bug investigation and fix workflow.

## Trigger
When the user reports a bug, error, or unexpected behavior.

## Steps

### 1. Understand the Bug
Ask (if not provided):
- อะไรที่ควรเกิด vs อะไรที่เกิดจริง?
- หน้าไหน / flow ไหน?
- Error message (ถ้ามี)?

### 2. Locate the Code
Based on the bug context, find relevant files:
- **หน้า list** → `app/{page}/page.tsx`
- **หน้า detail/edit** → `app/{page}/[id]/page.tsx` or form component
- **API error** → `app/api/{route}/route.ts`
- **Document/PDF** → `lib/*-pdf.ts`
- **Status transition** → `app/api/orders/route.ts` (PUT handler)
- **Auto-issue doc** → `lib/invoice-service.ts`
- **Stock** → `lib/stock-service.ts`
- **Shopee** → `lib/shopee/*.ts`

### 3. Check Common Bugs
Read `memory/common-bugs.md` first — the bug might be a known pattern:
- Missing `company_id` filter
- GP ถูกหักซ้ำ (resolveGp returns NET แล้ว)
- Shopee PROCESSED ≠ shipping
- Stock inline upsert แทนที่จะใช้ service
- z-index ต่ำเกินไป (dropdown ถูกบัง)

### 4. Fix
- แก้ให้ตรงจุด — อย่า over-engineer
- ใช้ shared components/services ตาม rules
- ทดสอบว่า fix ไม่กระทบ flow อื่น

### 5. Verify
- เช็คว่า fix ไม่ทำให้ flow อื่นพัง (ดู `.claude/rules/order-flows.md`)
- เช็คว่า auto-issue documents ยังถูกต้อง
- เช็ค multi-tenant (company_id filter)
