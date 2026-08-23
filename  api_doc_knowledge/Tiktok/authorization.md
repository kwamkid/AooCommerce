# TikTok Shop API — authorization

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 5 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202312, 202401, 202403, 202405

---

## GetAuthorizedShops

Retrieves the list of shops that a seller has authorized for an app.
Seller authorization is required before an app can access the data of a shop. Use this API to check which shops are currently authorized for an app and obtain the corresponding shop cipher for use as an input parameter in shop related APIs. 
For more information about seller authorization, refer to [Seller authorization guide](https://partner.tiktokshop.com/docv2/page/678e3a344ddec3030b238fa0).
Target seller: All

**Path:** `/authorization/202309/shops`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-authorized-shops-202309

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
| ^shops | array<object> |  | The list of shops that a seller has authorized for the app. |
| ^^cipher | string |  | An encrypted token used to securely identify a shop in API requests. There is no need for decryption on the receiving end. |
| ^^code | string |  | The TikTok Shop code, which is also displayed on Seller Center. |
| ^^id | string |  | An internal identifier for the TikTok Shop. |
| ^^name | string |  | The TikTok Shop name. |
| ^^region | string |  | The region of the shop. |
| ^^seller_type | string |  | The type of seller. Possible values: - CROSS_BORDER: Cross border sellers with multiple shops in different countries. - LOCAL: Local sellers with only 1 shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetWidgetToken

this open api is used to generate a widget token

**Path:** `/authorization/202312/widget_token`
**Method:** `GET`
**Version:** 202312
**Docs:** https://partner.tiktokshop.com/docv2/page/get-widget-token-202312

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_id | integer |  | shopID is not needed |

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
| ^widget_token | object |  | widget token related info |
| ^^expire_at | integer |  | widget token expire timestamp, usually 5 minutes |
| ^^token | string |  | token used to pass widget api |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetWidgetToken

this open api is used to generate a widget token

**Path:** `/authorization/202401/widget_token`
**Method:** `GET`
**Version:** 202401
**Docs:** https://partner.tiktokshop.com/docv2/page/get-widget-token-202401

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_id | integer |  | shopID is not needed |

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
| ^widget_token | object |  | widget token related info |
| ^^expire_at | integer |  | widget token expire timestamp, usually 5 minutes |
| ^^token | string |  | token used to pass widget api |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeauthorizeShop

This API is used  for developers to deauthorize a shop and notify the seller about this action by email

**Path:** `/authorization/202403/shops`
**Method:** `DELETE`
**Version:** 202403
**Docs:** https://partner.tiktokshop.com/docv2/page/deauthorize-shop-202403

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string | Y | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

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
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAuthorizedCategoryAssets

Retrieves the list of business category assets authorized by a partner for an app.
Partner authorization is required before an app can access the data of a partner, and this access is granted based on business categories. Use this API to check which business category assets are currently authorized for an app and obtain the corresponding category asset cipher for use as an input parameter in affiliate partner related APIs. 
For more information about partner authorization, refer to [Partner authorization guide](678e3a3978f4c20311b8b555).
Target partner: All

**Path:** `/authorization/202405/category_assets`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-authorized-category-assets-202405

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
| ^category_assets | array<object> |  | The list of business category assets that a partner has authorized for the app. |
| ^^category | object |  | The business category information. |
| ^^^id | integer |  | The ID of the business category. Use this field to verify if the partner has authorized the correct category. Otherwise, request re-authorization from the partner by referring to the [Partner authorization guide](https://partner.tiktokshop.com/docv2/page/669a301bd92cd602fd403ff9). |
| ^^^name | string |  | The name of the business category. This name may change. |
| ^^cipher | string |  | An encrypted token used to securely identify a partner in API requests. There is no need for decryption on the receiving end. |
| ^^target_market | string |  | The target market of the business category. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
