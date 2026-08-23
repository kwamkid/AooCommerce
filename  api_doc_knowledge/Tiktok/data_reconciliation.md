# TikTok Shop API — data_reconciliation

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 3 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202310, 202401

---

## OrderStatusDataExchange

TikTok Shop-Connector exchange order data from DTC(Direct To Consumer) platform to Tiktok Shop-QE system to compare the order data of DTC platform and Tiktok Shop. Which systems of users are involved with the API? For example, DTC platform Connector App, Shipping App, WMS, PIM, Multi Channel App, etc.

**Path:** `/data_reconciliation/202309/orders/sync`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/order-status-data-exchange-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_id | integer |  | Tiktok shop seller shop id. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| orders | array<object> |  | The exchange order list |
| ^channel_financial_status | string |  | If 'channel_type' is SHOPIFY,the financial status enumeration, data not in the following enumeration will return an error. shopify financial status: PENDING AUTHORIZED OVERDUE EXPIRING EXPIRED PAID REFUNDED PARTIALLY_REFUNDED PARTIALLY_PAID VOIDED UNPAID |
| ^channel_fulfillment_status | string |  | If 'channel_type' is SHOPIFY,the fulfillment status enumeration, data not in the following enumeration will return an error. Shopify fulfillment status: FULFILLED ON_HOLD PARTIALLY_FULFILLED UNFULFILLED SCHEDULED |
| ^channel_order_id | string |  | Direct To Consumer System order id |
| ^channel_order_status | string |  | The order status enumeration under the corresponding 'channel_type', and an error will be returned for data outside the enumeration under the 'channel_type'. The correspondence between 'channel_type' and order status is as follows. 1. channel_type is 'SHOPIFY' correspondence order status: OPEN ARCHIVED CANCELED 2. channel_type is 'WOOCOMMERCE' correspondence order status: PENDING ON_HOLD PROCESSING COMPLETED REFUNDED 3. channel_type is 'BIGCOMMERCE' correspondence order status: AWAITING_PAYMENT AWAITING_FULFILLMENT AWATING_SHIPMENT PARTIALLY_SHIPPED INCOMPLETE MANUAL_VERIFICATION_REQUIRED SHIPPED CANCELLED REFUND PENDING 4. channel_type is 'MAGENTO' correspondence order status: NEW PROCESSING PENDING COMPLETE CLOSED PENDING_PAYMENT ON_HOLD |
| ^channel_order_update_time | string |  | The update timestamp of the order on the DTC, not the current api call time. Unit: second, the length must be 10. The value must less than current timestamp. |
| ^channel_type | string |  | DTC channel type enumeration, data not in the following enumeration will return an error: SHOPIFY WOOCOMMERCE BIGCOMMERCE MAGENTO |
| ^not_exist_reason | string |  | The reason of that there is no matched order in channel platform |
| ^order_id | string |  | Tiktok shop's order id, must be a pure numeric string. |
| ^packages | array<object> |  | the package information list of order |
| ^^logistics_provider_name | string |  | The provider name of tracking info |
| ^^package_id | string |  | The tracking corresponding Tiktok shop package id |
| ^^tracking_number | string |  | Tracking number of tracking info |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred from executing the mutation, one failed order one element |
| ^^code | string |  | Integartion err code |
| ^^detail | object |  | List of orders that failed to update |
| ^^^channel_order_id | string |  | Failed channel order id |
| ^^^channel_type | string |  | Failed channel type |
| ^^^extra_errors | array<object> |  | Failed order reasons |
| ^^^^code | string |  | Business err code |
| ^^^^message | string |  | Business err message |
| ^^^order_id | string |  | Failed Tiktok Shop order id |
| ^^message | string |  | Integartion err message |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QualityFactoryOrderDataImportAPI

TikTok Shop-Connector exchange order data from DTC(Direct To Consumer) platform to Tiktok Shop-QE system to compare the order data of DTC platform and Tiktok Shop. Which systems of users are involved with the API? For example, DTC platform Connector App, Shipping App, WMS, PIM, Multi Channel App, etc.

**Path:** `/data_reconciliation/202310/orders/import`
**Method:** `POST`
**Version:** 202310
**Docs:** https://partner.tiktokshop.com/docv2/page/quality-factory-order-data-import-api-202310

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| orders | array<object> |  | The exchange order list |
| ^channel_financial_status | string |  | If 'channel_type' is SHOPIFY,the financial status enumeration, data not in the following enumeration will return an error. shopify financial status: PENDING AUTHORIZED OVERDUE EXPIRING EXPIRED PAID REFUNDED PARTIALLY_REFUNDED PARTIALLY_PAID VOIDED UNPAID |
| ^channel_fulfillment_status | string |  | If 'channel_type' is SHOPIFY,the fulfillment status enumeration, data not in the following enumeration will return an error. Shopify fulfillment status: FULFILLED ON_HOLD PARTIALLY_FULFILLED UNFULFILLED SCHEDULED |
| ^channel_order_id | string |  | Direct To Consumer System order id |
| ^channel_order_status | string |  | The order status enumeration under the corresponding 'channel_type', and an error will be returned for data outside the enumeration under the 'channel_type'. The correspondence between 'channel_type' and order status is as follows. 1. channel_type is 'SHOPIFY' correspondence order status: OPEN ARCHIVED CANCELED 2. channel_type is 'WOOCOMMERCE' correspondence order status: PENDING ON_HOLD PROCESSING COMPLETED REFUNDED 3. channel_type is 'BIGCOMMERCE' correspondence order status: AWAITING_PAYMENT AWAITING_FULFILLMENT AWATING_SHIPMENT PARTIALLY_SHIPPED INCOMPLETE MANUAL_VERIFICATION_REQUIRED SHIPPED CANCELLED REFUND PENDING 4. channel_type is 'MAGENTO' correspondence order status: NEW PROCESSING PENDING COMPLETE CLOSED PENDING_PAYMENT ON_HOLD |
| ^channel_order_update_time | string |  | The update timestamp of the order on the DTC, not the current api call time. Unit: second, the length must be 10. The value must less than current timestamp. |
| ^channel_type | string |  | DTC channel type enumeration, data not in the following enumeration will return an error: SHOPIFY WOOCOMMERCE BIGCOMMERCE MAGENTO |
| ^not_exist_reason | string |  | The reason of that there is no matched order in channel platform |
| ^order_id | string |  | Tiktok shop's order id, must be a pure numeric string. |
| ^packages | array<object> |  | the package information list of order |
| ^^package_id | string |  | The tracking corresponding Tiktok shop package id |
| ^^shipping_provider_name | string |  | The provider name of tracking info |
| ^^tracking_number | string |  | Tracking number of tracking info |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred from executing the mutation, one failed order one element |
| ^^code | string |  | Integartion err code |
| ^^detail | object |  | List of orders that failed to update |
| ^^^channel_order_id | string |  | Failed channel order id |
| ^^^channel_type | string |  | Failed channel type |
| ^^^extra_errors | array<object> |  | Failed order reasons |
| ^^^^code | string |  | Business err code |
| ^^^^message | string |  | Business err message |
| ^^^order_id | string |  | Failed Tiktok Shop order id |
| ^^message | string |  | Integartion err message |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QualityFactoryOrderDataImportAPI

TikTok Shop-Connector exchange order data from DTC(Direct To Consumer) platform to Tiktok Shop-QE system to compare the order data of DTC platform and Tiktok Shop. Which systems of users are involved with the API? For example, DTC platform Connector App, Shipping App, WMS, PIM, Multi Channel App, etc.

**Path:** `/data_reconciliation/202401/orders/import`
**Method:** `POST`
**Version:** 202401
**Docs:** https://partner.tiktokshop.com/docv2/page/quality-factory-order-data-import-api-202401

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| orders | array<object> |  | The exchange order list |
| ^channel_financial_status | string |  | If 'channel_type' is SHOPIFY,the financial status enumeration, data not in the following enumeration will return an error. shopify financial status: PENDING AUTHORIZED OVERDUE EXPIRING EXPIRED PAID REFUNDED PARTIALLY_REFUNDED PARTIALLY_PAID VOIDED UNPAID |
| ^channel_fulfillment_status | string |  | If 'channel_type' is SHOPIFY,the fulfillment status enumeration, data not in the following enumeration will return an error. Shopify fulfillment status: FULFILLED ON_HOLD PARTIALLY_FULFILLED UNFULFILLED SCHEDULED |
| ^channel_order_id | string |  | Direct To Consumer System order id |
| ^channel_order_status | string |  | The order status enumeration under the corresponding 'channel_type', and an error will be returned for data outside the enumeration under the 'channel_type'. The correspondence between 'channel_type' and order status is as follows. 1. channel_type is 'SHOPIFY' correspondence order status: OPEN ARCHIVED CANCELED 2. channel_type is 'WOOCOMMERCE' correspondence order status: PENDING ON_HOLD PROCESSING COMPLETED REFUNDED 3. channel_type is 'BIGCOMMERCE' correspondence order status: AWAITING_PAYMENT AWAITING_FULFILLMENT AWATING_SHIPMENT PARTIALLY_SHIPPED INCOMPLETE MANUAL_VERIFICATION_REQUIRED SHIPPED CANCELLED REFUND PENDING 4. channel_type is 'MAGENTO' correspondence order status: NEW PROCESSING PENDING COMPLETE CLOSED PENDING_PAYMENT ON_HOLD |
| ^channel_order_update_time | string |  | The update timestamp of the order on the DTC, not the current api call time. Unit: second, the length must be 10. The value must less than current timestamp. |
| ^channel_type | string |  | DTC channel type enumeration, data not in the following enumeration will return an error: SHOPIFY WOOCOMMERCE BIGCOMMERCE MAGENTO |
| ^issue_reason | string |  | Developers must use one of the Reason Codes listed within your API request parameters. If you don't use one of the ENUMs, the API will return an error. Refer to this doc for a list of possible reason codes:  https://partner.tiktokshop.com/docv2/page/660bf931cf5cc502e03007ca#Back%20To%20Top |
| ^order_id | string |  | Tiktok shop's order id, must be a pure numeric string. |
| ^packages | array<object> |  | the package information list of order |
| ^^package_id | string |  | The tracking corresponding Tiktok shop package id |
| ^^shipping_provider_name | string |  | The provider name of tracking info |
| ^^tracking_number | string |  | Tracking number of tracking info |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred from executing the mutation, one failed order one element |
| ^^code | string |  | Integartion err code |
| ^^detail | object |  | List of orders that failed to update |
| ^^^channel_order_id | string |  | Failed channel order id |
| ^^^channel_type | string |  | Failed channel type |
| ^^^extra_errors | array<object> |  | Failed order reasons |
| ^^^^code | string |  | Business err code |
| ^^^^message | string |  | Business err message |
| ^^^order_id | string |  | Failed Tiktok Shop order id |
| ^^message | string |  | Integartion err message |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
