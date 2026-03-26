# Order Flows — Customer Type × Sale Type × Status

## Customer Types → Flow Types

| DB `customer_type` | `sale_type` | `flow_type` | Flow Name | ใช้ Form |
|---|---|---|---|---|
| `retail` | — | `r_retail` | ลูกค้าปลีก | OrderForm |
| `wholesale_dealer` | `wholesale_cash` | `w_cash` | ตัวแทนขายขาดเงินสด | DealerOrderForm |
| `wholesale_dealer` | `wholesale_credit` | `w_credit` | ตัวแทนขายขาดเครดิต | DealerOrderForm |
| `wholesale_department` | `wholesale_cash` | `w_cash` | ห้างขายขาดเงินสด | DealerOrderForm |
| `wholesale_department` | `wholesale_credit` | `w_credit` | ห้างขายขาดเครดิต | DealerOrderForm |
| `corporate` | `wholesale_cash` | `w_cash` | องค์กรเงินสด | DealerOrderForm |
| `corporate` | `wholesale_credit` | `w_credit` | องค์กรเครดิต | DealerOrderForm |
| `consignment_dealer` | `consignment` | `c_consign` | ตัวแทนฝากขาย | Replenishment + CSR Report |
| `department_store` | `consignment` | `d_consign` | ห้างฝากขาย | Dept Order + DSR Report |

---

## Status Flows per Flow Type

### r_retail (ลูกค้าปลีก)
```
new → ready_to_ship → processing → shipping → completed
       ↑ payment          ↑ รับออเดอร์    ↑ จัดส่ง     ↑ สำเร็จ
```
- **Payment**: ชำระก่อน (new/ready_to_ship) → payment_status = paid
- **Accept**: กดรับออเดอร์ (ready_to_ship → processing)
- **Ship**: จัดส่งแล้ว (processing → shipping)
- **Complete**: สำเร็จ (shipping → completed)
- **Auto docs**: ABB/REC เมื่อ processing + paid

### w_cash (ขายขาดเงินสด)
```
new → ready_to_ship → processing → completed
       ↑ payment          ↑ คอนเฟิร์ม     ↑ จัดส่ง
```
- **Payment**: ชำระก่อน (new → ready_to_ship)
- **Confirm**: คอนเฟิร์มออเดอร์ (ready_to_ship → processing)
- **Ship/Complete**: จัดส่ง = completed ทันที
- **Auto docs**:
  - คอนเฟิร์ม + paid → **TAX** (`tax_receipt`)
  - จัดส่ง → **DN**

### w_credit (ขายขาดเครดิต)
```
ready_to_ship → processing → completed → (บันทึกชำระ)
                   ↑ คอนเฟิร์ม     ↑ จัดส่ง         ↑ payment
```
- **No upfront payment**: เริ่มที่ ready_to_ship เลย (เครดิต)
- **Confirm**: คอนเฟิร์มออเดอร์ (ready_to_ship → processing)
- **Ship/Complete**: จัดส่ง = completed ทันที
- **Payment**: บันทึกชำระหลังจัดส่งแล้ว
- **Auto docs**:
  - คอนเฟิร์ม → **TAX** (`tax_invoice`)
  - จัดส่ง → **DN + ST**
  - บันทึกชำระ → **REC**

### c_consign (ตัวแทนฝากขาย)
```
[Replenishment] pending → shipped → received/partial_received
[CSR Report]    draft → received → invoiced → billed → paid
```
**Replenishment (เติมของ):**
- สร้าง replenishment → status: pending
- จัดส่ง → shipped + auto **DN** (ไม่มีราคา)
- ตัวแทนรับของ → received / partial_received

**Consignment Sales Report (แจ้งยอด):**
- สร้าง CSR → status: draft
- ตัวแทนแจ้งยอด → received
- ยืนยัน (พร้อมวางบิล) → invoiced + auto **TAX** (`tax_invoice`) + **ST**
- วางบิลแล้ว → billed
- ชำระแล้ว → paid + auto **REC**

### d_consign (ห้างฝากขาย)
```
[Dept Order]    draft → confirmed → shipped → invoiced → paid
[DSR Report]    invoiced → billed → paid
```
**Department Order (ส่งของห้าง):**
- สร้าง → draft
- ยืนยัน → confirmed
- จัดส่ง → shipped + auto **TAX** (`tax_only`) + **DN** (มีราคา)
- ออก invoice → invoiced
- ชำระ → paid

**Department Store Report (ห้างแจ้งยอด):**
- สร้าง → invoiced + auto **INV** + **ST**
- วางบิลแล้ว → billed
- ชำระแล้ว → paid + auto **REC**

---

## Auto Issue Documents Summary

| Flow | จุด Trigger | เอกสาร | Subtype |
|------|-------------|--------|---------|
| r_retail | กดรับ + paid | ABB + REC | — |
| w_cash | คอนเฟิร์ม + paid | TAX | `tax_receipt` |
| w_cash | จัดส่ง | DN | — |
| w_credit | คอนเฟิร์ม | TAX | `tax_invoice` |
| w_credit | จัดส่ง | DN + ST | — |
| w_credit | บันทึกชำระ | REC | — |
| c_consign | เติมของ (ship) | DN (ไม่มีราคา) | — |
| c_consign | พร้อมวางบิล | TAX + ST | `tax_invoice` |
| c_consign | ชำระ | REC | — |
| d_consign | ส่งของห้าง (ship) | TAX + DN (มีราคา) | `tax_only` |
| d_consign | สร้าง DSR | INV + ST | — |
| d_consign | ชำระ | REC | — |

---

## Document Prefixes

| Prefix | ชื่อ | Table |
|--------|------|-------|
| `ABB-` | ใบกำกับอย่างย่อ/ใบเสร็จ | `abbreviated_invoices` |
| `TAX-` | ใบกำกับภาษี | `tax_invoices` |
| `INV-` | ใบแจ้งหนี้ | `invoices` |
| `REC-` | ใบเสร็จรับเงิน | `receipts` |
| `DN-` | ใบส่งสินค้า | `delivery_notes` |
| `ST-` | ใบวางบิล | `statements` |
| `CN-` | ใบลดหนี้ | `credit_notes` |

## TAX Subtypes → หัวเอกสาร

| `document_subtype` | หัวเอกสาร | ใช้กับ Flow |
|---|---|---|
| `tax_only` | ใบกำกับภาษี | d_consign (ส่งของห้าง) |
| `tax_receipt` | ใบกำกับภาษี/ใบเสร็จรับเงิน | w_cash |
| `tax_invoice` | ใบกำกับภาษี/ใบแจ้งหนี้ | w_credit, c_consign |

---

## Flow Type Helpers (`lib/flow-types.ts`)

```typescript
isCreditFlow(flow)       // w_credit
isCashFlow(flow)         // w_cash
isWholesaleFlow(flow)    // w_cash | w_credit
isConsignmentFlow(flow)  // c_consign
isDepartmentFlow(flow)   // d_consign
getFlowLabel(flow)       // Thai label
```

## Pages per Flow

| หน้า | Flow | URL |
|------|------|-----|
| คำสั่งซื้อ (ปลีก) | r_retail | `/orders` |
| คำสั่งซื้อตัวแทน | w_cash, w_credit | `/dealer-orders` |
| ออเดอร์ห้าง | d_consign | `/department-orders` |
| เติมของตัวแทน | c_consign, d_consign | `/replenishments` |
| รายงานฝากขาย | c_consign | `/consignment/reports` |
| รายงานห้าง | d_consign | `/department-store/reports` |
