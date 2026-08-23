# TikTok Shop API — supply_chain

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 1 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309

---

## ConfirmPackageShipment

This API enables a warehouse service provider to send package shipment information for an order. Only warehouse service providers who have been certified by the platform have permission to access this interface.

**Path:** `/supply_chain/202309/packages/sync`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/confirm-package-shipment-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| packages | array<object> |  | Package info list |
| ^create_time_millis | integer |  | Time when warehouse receives the order (Unix timestamp in milliseconds) |
| ^dimension | object |  | Package dimension information |
| ^^height | integer |  | Package height value |
| ^^length | integer |  | Package length value |
| ^^unit | string |  | Package dimension unit Possible values: - METER - CENTIMETER - MILLIMETER - MICRON - FOOT - INCH |
| ^^width | integer |  | Package width value |
| ^handover_time_millis | integer |  | Time when the order is handed over to the shipping provider (Unix timestamp in milliseconds) |
| ^id | string |  | Package ID |
| ^provider_warehouse_code | string |  | Warehouse code |
| ^provider_warehouse_name | string |  | Warehouse name |
| ^ship_time_millis | integer |  | Time when the order is shipped out of the warehouse (Unix timestamp in milliseconds) |
| ^shipping_origin_city | string |  | Origin city name for the shipment |
| ^shipping_provider_id | string |  | Shipping service provider ID |
| ^shipping_provider_name | string |  | Shipping service provider name |
| ^skus | array<object> |  | List of order SKUs |
| ^^id | string |  | TikTok Shop SKU ID |
| ^^quantity | integer |  | The quantity of each SKU |
| ^tcw_warehouse_type | string |  | TikTok warehouse type Possible values: - STANDARD: Standard warehouse that has not been specifically certified by TikTok - TIKTOK_CERTIFIED_WAREHOUSE_FULFILLMENT: TikTok certified warehouse usually offering better service levels. Certified warehouses are required to meet fulfillment timeline standards set by TikTok |
| ^time_zone | string |  | The warehouse time zone |
| ^tracking_number | string |  | Tracking number |
| ^weight | object |  | Package weight information |
| ^^unit | string |  | Package weight unit Possible values: - KILOGRAM - GRAM - MILLIGRAM - POUND - OUNCE |
| ^^value | integer |  | Package weight value |
| ^wms_order_id | string |  | Warehouse Management System order number |
| warehouse_provider_id | string |  | Warehouse provider ID, unique and provided by TikTok |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Error list |
| ^^code | string |  | Error code |
| ^^detail | object |  | Failed package details |
| ^^^package_id | string |  | Failed package ID |
| ^^message | string |  | Error message |
| ^success_packages | array<string> |  | List of packages that have been successfully confirmed |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
