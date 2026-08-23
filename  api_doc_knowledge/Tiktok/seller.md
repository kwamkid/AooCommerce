# TikTok Shop API — seller

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 5 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202407, 202508

---

## GetSellerPermissions

Retrieves the cross-border operations that a cross-border seller is permitted to perform.
You can use this API prior to listing products to check whether a seller has the ability to list global products.
Target seller: Cross-border sellers

**Path:** `/seller/202309/permissions`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-seller-permissions-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^permissions | array<string> |  | The list of cross-border operations that the seller is permitted to perform. Possible values: - MANAGE_GLOBAL_PRODUCT: Indicates the seller is permitted to manage global products listed in TikTok Shops across multiple countries. If this is empty, it means the seller does not have permission to conduct cross-border operations. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetActiveShops

Retrieves all active shops that belong to a seller. 
You can use this API to check the activation status of shops.
Target seller: All

**Path:** `/seller/202309/shops`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-active-shops-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^shops | array<object> |  | The list of active shops that belong to the seller. Note: Local sellers only have 1 shop. |
| ^^id | string |  | The ID of the shop. |
| ^^region | string |  | The region of the shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopCreators

Retrieve creators that are bound to a shop.
Currently, you can only retrieve the binding status of the official creator.

**Path:** `/seller/202407/shop_creators`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-creators-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^shop_creators | array<object> |  | The list of creators that is bound to the shop. |
| ^^binding_status | string |  | The current binding status of the shop creator: - WAITING_TO_BE_VERIFIED: The creator has been invited to be a Marketing Creator for the shop but has not yet accepted the invitation. - STALLED: The status is "stalled" because the shop has not completed the onboarding process. Binding will be completed automatically once onboarding is successful. - PENDING: The creator's permissions are pending approval (e.g. the creator's TikTok Shop permission or TikTok LIVE permission). - FAILED: The creator's permissions were not granted. - ACTIVE: The creator is successfully bound to the shop. - ABNORMAL: The creator's TikTok Shop permission is suspended due to violations. |
| ^^type | string |  | The type of shop creator: - OFFICIAL: The shop's official TikTok creator account that represents the shop on TikTok. - MARKETING: TikTok creator accounts bound to your TikTok Shop, other than the official account. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SyncCollections

Description of [POST]/seller/:version/collections/sync

**Path:** `/seller/202508/collections/sync`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/sync-collections-202508

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
| collections | array<object> |  | the decorate theme content |
| ^id | string |  | the collection id |
| ^image_url | string |  | the collection cover image url |
| ^products | array<object> |  | products in this collections |
| ^^outer_product_id | string |  | the shopify product id |
| ^^tts_product_id | string |  | the tts product id |
| ^title | string |  | the collection title |
| logo_url | string |  | the shop logo url |
| source | integer |  | the data source of collections |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^failed_info | object |  | sync failed collection list |
| ^^ids | array<string> |  | failed collection ids |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetSellerStatus

Description of [POST]/seller/:version/status/query

**Path:** `/seller/202508/status`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-seller-status-202508

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^seller_status_data | object |  | seller status information |
| ^^partner_channel | string |  | 0: UNKNOWN 1: ORGANIC 2: WOO 3: SHOPIFY 4: SALESFORCE 6: SHOPIFY2 |
| ^^seller_status | string |  | 0 : NEW_CREATE 1 : PENDING 2 : ACTIVE 3 : DEACTIVATED 4: REJECTED 6: WITHDRAW |
| ^^shop_statuses | array<object> |  | the collection of shop statuses |
| ^^^shop_id | string |  | the unique id of shop |
| ^^^shop_status | string |  | 0 : NEW_CREATE 1 : PENDING 2 : ACTIVE 3 : DEACTIVATED 4: REJECTED 6: WITHDRAW |
| ^^tax_form_status | string |  | 0: UNKONW 1: UnderAudit 2: Approved 3: Rejected |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
