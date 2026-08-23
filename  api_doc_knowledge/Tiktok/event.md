# TikTok Shop API — event

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 3 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309

---

## GetShopWebhooks

Retrieves a shop's webhooks and the corresponding webhook URLs.

**Path:** `/event/202309/webhooks`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-webhooks-202309

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
| ^total_count | integer |  | The total number of webhooks returned. |
| ^webhooks | array<object> |  | The list of webhooks configured for the shop. |
| ^^address | string |  | The webhook URL used to receive the event data. |
| ^^create_time | integer |  | The time when the webhook was created. Unix timestamp. |
| ^^event_type | string |  | The topic of the webhook event. Possible values: - `ORDER_STATUS_CHANGE`: Triggers on each order status update, from new order placement through all subsequent status changes. See [Order Status change](650300b8a57708028b430b4a). - `RECIPIENT_ADDRESS_UPDATE`: Triggers when the recipient's address is updated. See [Receipient address update](650301af5a12ff0294ea3bf9). - `PACKAGE_UPDATE`: Triggers when a package is updated (e.g., combined, split, or address changed). See [Package update](650955cabace3e02b73cc886). - `PRODUCT_STATUS_CHANGE`: Triggers when product audit results are updated. See [Product status change](650956aff1fd3102b90b6261). - `SELLER_DEAUTHORIZATION`: Triggers when a seller is deauthorized to inform developers and avoid misunderstandings about platform authorization issues. See [Seller deauthorization](65095746defece02be4d749d). - `UPCOMING_AUTHORIZATION_EXPIRATION`: Triggers 30 days before authorization expiration, with daily notifications at 0:00 until re-authorization is completed. See [Upcoming authorization expiration](6509579c0fcef602bf11312c). - `CANCELLATION_STATUS_CHANGE`: Triggers when an order's cancellation status changes. See [Cancellation status change](65030150746462028285f657). - `RETURN_STATUS_CHANGE`: Triggers when an order's return status changes. See [Return status change](65030162bb2a4d028d50cc51). - `NEW_CONVERSATION`: Triggers when a customer service agent joins or leaves a conversation. See [New conversation](6614330bfe9fdc02e002abfd). - `NEW_MESSAGE`: Triggers when a new message is sent in a customer service conversation. See [New Message](66143486ef8a1202dc323258). - `PRODUCT_INFORMATION_CHANGE`: Triggers when changes to a product's title, description, main images, or attributes go live. See [Product information change](65d6f41411a60f02dc1cf8bf). - `PRODUCT_CREATION`: Triggers when a new product is created. See [Product creation](663c98b566828e02e4515580). - `PRODUCT_CATEGORY_CHANGE`: Triggers when the category of a product is changed. See [Product category change](668764a371f16d02eef1f393). - `NEW_MESSAGE_LISTENER`: Triggers when a creator sends a message to the seller. See [New message listener](6790b76eb59cf9030997b783). - `INVOICE_STATUS_CHANGE`: Triggers when the status of an invoice upload changes after using the [POST Upload Invoice](67b542559a140004b343984f) endpoint. See [Invoice Status Change](67b68ca185619104a6772e5d). - `PRODUCT_AUDIT_STATUS_CHANGE`: Triggers when the product audit status changes. See [Product audit status change](67b5c6cba42623049abe5062). - `REVERSE_STATUS_UPDATE`: Triggers when buyer raises cancellation, refund only, or return & refund requests that need the seller to accept or reject. See [Reverse Status Update](https://partner.tiktokshop.com/doc/page/63fd7459715d622a338c5437). |
| ^^update_time | integer |  | The time when the webhook was last updated. Unix timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateShopWebhook

Updates the shop's webhook URL for a specific event topic.

**Path:** `/event/202309/webhooks`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-shop-webhook-202309

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
| address | string |  | The webhook URL used to receive the event data. Max length: 255 characters |
| event_type | string |  | The topic of the webhook event. Possible values: - `ORDER_STATUS_CHANGE`: Triggers on each order status update, from new order placement through all subsequent status changes. See [Order Status change](650300b8a57708028b430b4a). - `RECIPIENT_ADDRESS_UPDATE`: Triggers when the recipient's address is updated. See [Receipient address update](650301af5a12ff0294ea3bf9). - `PACKAGE_UPDATE`: Triggers when a package is updated (e.g., combined, split, or address changed). See [Package update](650955cabace3e02b73cc886). - `PRODUCT_STATUS_CHANGE`: Triggers when product audit results are updated. See [Product status change](650956aff1fd3102b90b6261). - `SELLER_DEAUTHORIZATION`: Triggers when a seller is deauthorized to inform developers and avoid misunderstandings about platform authorization issues. See [Seller deauthorization](65095746defece02be4d749d). - `UPCOMING_AUTHORIZATION_EXPIRATION`: Triggers 30 days before authorization expiration, with daily notifications at 0:00 until re-authorization is completed. See [Upcoming authorization expiration](6509579c0fcef602bf11312c). - `CANCELLATION_STATUS_CHANGE`: Triggers when an order's cancellation status changes. See [Cancellation status change](65030150746462028285f657). - `RETURN_STATUS_CHANGE`: Triggers when an order's return status changes. See [Return status change](65030162bb2a4d028d50cc51). - `NEW_CONVERSATION`: Triggers when a customer service agent joins or leaves a conversation. See [New conversation](6614330bfe9fdc02e002abfd). - `NEW_MESSAGE`: Triggers when a new message is sent in a customer service conversation. See [New Message](66143486ef8a1202dc323258). - `PRODUCT_INFORMATION_CHANGE`: Triggers when changes to a product's title, description, main images, or attributes go live. See [Product information change](65d6f41411a60f02dc1cf8bf). - `PRODUCT_CREATION`: Triggers when a new product is created. See [Product creation](663c98b566828e02e4515580). - `PRODUCT_CATEGORY_CHANGE`: Triggers when the category of a product is changed. See [Product category change](668764a371f16d02eef1f393). - `NEW_MESSAGE_LISTENER`: Triggers when a creator sends a message to the seller. See [New message listener](6790b76eb59cf9030997b783). - `INVOICE_STATUS_CHANGE`: Triggers when the status of an invoice upload changes after using the [POST Upload Invoice](67b542559a140004b343984f) endpoint. See [Invoice Status Change](67b68ca185619104a6772e5d). - `PRODUCT_AUDIT_STATUS_CHANGE`: Triggers when the product audit status changes. See [Product audit status change](67b5c6cba42623049abe5062). - `REVERSE_STATUS_UPDATE`: Triggers when buyer raises cancellation, refund only, or return & refund requests that need the seller to accept or reject. See [Reverse Status Update](https://partner.tiktokshop.com/doc/page/63fd7459715d622a338c5437). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeleteShopWebhook

Deletes the shop's webhook URL for a specific event topic. 
Regardless of whether webhook is configured or not, the result will return success.

**Path:** `/event/202309/webhooks`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/delete-shop-webhook-202309

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
| event_type | string |  | The topic of the webhook event. Possible values: - `ORDER_STATUS_CHANGE`: Triggers on each order status update, from new order placement through all subsequent status changes. See [Order Status change](650300b8a57708028b430b4a). - `RECIPIENT_ADDRESS_UPDATE`: Triggers when the recipient's address is updated. See [Receipient address update](650301af5a12ff0294ea3bf9). - `PACKAGE_UPDATE`: Triggers when a package is updated (e.g., combined, split, or address changed). See [Package update](650955cabace3e02b73cc886). - `PRODUCT_STATUS_CHANGE`: Triggers when product audit results are updated. See [Product status change](650956aff1fd3102b90b6261). - `SELLER_DEAUTHORIZATION`: Triggers when a seller is deauthorized to inform developers and avoid misunderstandings about platform authorization issues. See [Seller deauthorization](65095746defece02be4d749d). - `UPCOMING_AUTHORIZATION_EXPIRATION`: Triggers 30 days before authorization expiration, with daily notifications at 0:00 until re-authorization is completed. See [Upcoming authorization expiration](6509579c0fcef602bf11312c). - `CANCELLATION_STATUS_CHANGE`: Triggers when an order's cancellation status changes. See [Cancellation status change](65030150746462028285f657). - `RETURN_STATUS_CHANGE`: Triggers when an order's return status changes. See [Return status change](65030162bb2a4d028d50cc51). - `NEW_CONVERSATION`: Triggers when a customer service agent joins or leaves a conversation. See [New conversation](6614330bfe9fdc02e002abfd). - `NEW_MESSAGE`: Triggers when a new message is sent in a customer service conversation. See [New Message](66143486ef8a1202dc323258). - `PRODUCT_INFORMATION_CHANGE`: Triggers when changes to a product's title, description, main images, or attributes go live. See [Product information change](65d6f41411a60f02dc1cf8bf). - `PRODUCT_CREATION`: Triggers when a new product is created. See [Product creation](663c98b566828e02e4515580). - `PRODUCT_CATEGORY_CHANGE`: Triggers when the category of a product is changed. See [Product category change](668764a371f16d02eef1f393). - `NEW_MESSAGE_LISTENER`: Triggers when a creator sends a message to the seller. See [New message listener](6790b76eb59cf9030997b783). - `INVOICE_STATUS_CHANGE`: Triggers when the status of an invoice upload changes after using the [POST Upload Invoice](67b542559a140004b343984f) endpoint. See [Invoice Status Change](67b68ca185619104a6772e5d). - `PRODUCT_AUDIT_STATUS_CHANGE`: Triggers when the product audit status changes. See [Product audit status change](67b5c6cba42623049abe5062). - `REVERSE_STATUS_UPDATE`: Triggers when buyer raises cancellation, refund only, or return & refund requests that need the seller to accept or reject. See [Reverse Status Update](https://partner.tiktokshop.com/doc/page/63fd7459715d622a338c5437). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
