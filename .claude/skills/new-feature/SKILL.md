# New Feature

Guided workflow for adding a new feature — ensures all project conventions are followed.

## Trigger
When the user asks to add a new feature, page, or functionality.

## Steps

### 1. Plan
Before writing code, identify:
- **Pages needed**: list page? detail/edit page? both?
- **API routes needed**: CRUD? special actions?
- **DB tables**: existing or new?
- **Documents**: ต้อง auto-issue เอกสารอะไรมั้ย?
- **Shared components**: อะไรใช้ได้เลย? (ดู `.claude/rules/code-simplicity.md`)

### 2. Check Existing Resources
Before creating anything new, verify:
- [ ] มี shared component ที่ใช้ได้มั้ย?
- [ ] มี hook ที่ทำเรื่องนี้แล้วมั้ย?
- [ ] มี service ที่ handle logic นี้แล้วมั้ย?
- [ ] มี API route ที่ให้ข้อมูลนี้แล้วมั้ย?
- [ ] มีหน้าที่คล้ายกันที่ copy pattern ได้มั้ย?

### 3. Build (in order)
1. **DB** — migration ถ้าต้อง table/column ใหม่
2. **API route** — auth + company_id + error handling (ดู `/new-api`)
3. **List page** — ใช้ `DataTable` (ดู `/new-list-page`)
4. **Detail/Edit page** — ใช้ shared form components
5. **PDF** — ถ้าต้องพิมพ์เอกสาร (ดู `/new-pdf`)
6. **Status actions** — focus action + menu ตาม flow

### 4. Conventions Checklist
- [ ] ใช้ `DataTable` สำหรับหน้า list
- [ ] ใช้ `FormSelect` (ไม่ใช่ native select)
- [ ] ใช้ `ActionMenu` สำหรับ row menu
- [ ] Mobile responsive (DataTable จัดการให้ / หรือ custom mobileCardRender)
- [ ] Multi-tenant: ทุก query filter `company_id`
- [ ] Stock operations ผ่าน `stock-service.ts`
- [ ] Auto-issue documents ผ่าน `invoice-service.ts`
- [ ] External API calls มี `logIntegration()`
- [ ] Tab/badge สีใช้ `status-tab-colors.ts`
- [ ] z-index dropdown/popover ≥ 999
