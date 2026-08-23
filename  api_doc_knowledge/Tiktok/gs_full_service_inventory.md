# TikTok Shop API — gs_full_service_inventory

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 4 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202404, 202405

---

## QueryGlobalSellingVirtualInventory

Use this Api to query JIT virtual inventory

**Path:** `/gs_full_service_inventory/202404/preview/virtual_inventory/query`
**Method:** `POST`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/query-global-selling-virtual-inventory-202404

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| skus | array<string> |  | sku code list |
| supplier_id | string |  | supplier id |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^inventory | array<object> |  | inventory list |
| ^^occupied_quantity | integer |  | occupied quantity |
| ^^quantity | integer |  | total quantity |
| ^^sku_code | string |  | sku code |
| ^^warehouse_code | string |  | warehouse code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SetGlobalSellingVirtualInventory

This API is used to set the JIT available inventory, for example, the total inventory is 80. If 20 are occupied, the available inventory is 80. If you modify the available inventory to 100, the total inventory is 120.

**Path:** `/gs_full_service_inventory/202404/preview/virtual_inventory/update`
**Method:** `POST`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/set-global-selling-virtual-inventory-202404

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| skus | array<object> |  | update sku list, sku size<=10 |
| ^code | string |  | sku code |
| ^quantity | integer |  | available quantity,0-99999 |
| ^warehouse_code | string |  | warehouse code,must be V_FC-CNHN-CY01 |
| supplier_id | string |  | supplier_id |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | fail sku list |
| ^^code | string |  | detail error code |
| ^^message | string |  | detail error message |
| ^^sku_code | string |  | sku code |
| ^^warehouse_code | string |  | warehouse code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceQueryVirtualInventory

Description of [POST]/gs_full_service_inventory/:version/GS_FullService_Query_Virtual_Inventory

**Path:** `/gs_full_service_inventory/202405/beta/virtual_inventory/query`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-query-virtual-inventory-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| skus | array<string> |  | sku code list |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^inventory | array<object> |  | inventory list |
| ^^occupied_quantity | integer |  | occupied quantity |
| ^^quantity | integer |  | total quantity |
| ^^sku_code | string |  | sku code |
| ^^warehouse_code | string |  | warehouse code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceUpdateVirtualInventory

Description of [POST]/gs_full_service_inventory/:version/GS_FullService_Update_Virtual_Inventory

**Path:** `/gs_full_service_inventory/202405/beta/virtual_inventory/update`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-update-virtual-inventory-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| skus | array<object> |  | update sku list, sku size<=10 |
| ^code | string |  | sku code |
| ^quantity | integer |  | available quantity,0-99999 |
| ^warehouse_code | string |  | warehouse code,must be V_FC-CNHN-CY01 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | fail sku list |
| ^^code | string |  | detail error code |
| ^^message | string |  | detail error message |
| ^^sku_code | string |  | sku code |
| ^^warehouse_code | string |  | warehouse code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
