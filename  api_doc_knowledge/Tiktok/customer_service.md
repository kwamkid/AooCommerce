# TikTok Shop API — customer_service

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 10 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202407, 202601

---

## GetAgentSettings

This API is used to get agent settings. This API allows the agent to see whether the agent can accept chats from buyers. This API is a read-only endpoint. There will be no side effects, and can be retried safely. Note:  1. The current API version can only get settings on behalf of the shop, or the owner account holder on Seller Center. The owner in this case is acting as the customer service agent. In the future, we plan to make this API available to subaccount holders (who has customer service role) in Seller Center.  2. This API is to allow the agent to get his/her own setting.  See more information in API overview

**Path:** `/customer_service/202309/agents/settings`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-agent-settings-202309

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
| ^can_accept_chat | boolean |  | Whether the current agent can accept chat. If true, the agent will receive auto-assigned chats. The agent can manually select chats to respond. If false, the agent will receive manually assigned chats only. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateAgentSettings

Use this API to update agent status on behalf of the agent. Agents can set whether they can accept auto assigned chats. Before using API, we recommend setting can_accept_chat to true, in order to accept chats.  Note:  1. The current API version can only update settings on behalf of the shop, or the owner account holder on Seller Center. The owner in this case is acting as the customer service agent. In the future, we plan to make this API available to subaccount holders (who has customer service role) in Seller Center.  2. This API is to allow the agent to update their own setting.  See more information in API overview

**Path:** `/customer_service/202309/agents/settings`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-agent-settings-202309

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
| can_accept_chat | boolean |  | If true, the agent will receive auto-assigned chats. The agent can manually select chats to respond. If false, the agent will receive manually assigned chats only. When using IM API, we recommend setting this field to true. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConversations

Use this API to retrieve a shop's conversations with buyers.

**Path:** `/customer_service/202309/conversations`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-conversations-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Paging cursor, this means where this query should start. For the next page, use "next_page_token" in response. |
| page_size | integer | Y | Number of conversations on one page Max 20. |
| locale | string |  | System message's display language. The messages sent by System will be returned in the setting language; The messages sent by the buyer, the shop, the CS agent will not be affected. The default value is en (English). Possible enumerations: - de-DE (German, Germany) - en (English) - en-GB (English, United Kingdom) - es-ES (Spanish, Spain) - es-MX (Spanish, Latin America) - fr-FR (French, France) - id-ID (Indonesian, Indonesia) - it-IT (Italian, Italy) - ja-JP (Japanese) - ms-MY (Malay, Malaysia) - th-TH (Thai, Thailand) - vi-VN (Vietnamese, Vietnam) - pt-BR (Portuguese, Brazil) - zh-CN (Simplified Chinese, China) |
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
| ^conversations | array<object> |  | Conversation info. |
| ^^can_send_message | boolean |  | Whether customer service agent can send message in this conversation. Under any of the following circumstances, the CS agent can send messages: 1. There has been a prior conversation between the buyer and the shop within the last 30 days. 2. The buyer placed an order at the shop within the past 60 days. 3. The buyer has a history of returns or refunds at the shop. |
| ^^create_time | integer |  | Unix timestamp when the conversation was created. In seconds. |
| ^^id | string |  | Conversation ID |
| ^^latest_message | object |  | The latest message in conversation. |
| ^^^content | string |  | Message content, in JSON serialized string. Examples of content for each type of message are listed below: - TEXT: ``` { "content": "simple text" } ``` - IMAGE: ``` { "height": "290", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "304" } ``` - PRODUCT_CARD, BUYER_ENTER_FROM_PRODUCT: ``` { "product_id": "12345" } ``` - ORDER_CARD, BUYER_ENTER_FROM_ORDER : ``` { "order_id": "12345" } ``` - RETURN_REFUND_CARD: ``` { "order_id": "12345", "sku_id": "45678" } ``` - VIDEO: ``` { "url": "https://video-boei18n.byted.org/storage/v1/tos-boei18n-v-c72c01/e8240f35244646428df9c3244d1a7408?x-tos-algorithm=v2&x-tos-authkey=5bf25627da095a5cba28ace592de46cc&x-tos-expires=1681980481&x-tos-signature=r_bRxtrvGhXAuZgMmNhlZ_Upqzg", "cover": "https://p-boei18n.byted.org/tos-boei18n-v-c72c01/o8keEOhzTcNCcJyAbkWZwpLIyTfkJxcGbRBvLP~tplv-jvtte31kaf-origin-jpeg.jpeg?", "width": 640, "height": 360, "duration": "20.504", "vid": "v0e30cg700f7cgcmu8jc77u9e2bdp95g", "expire_time": "1681980481", "format": "mp4", "size": 400000, "bit_rate": 156067, "quality": "original", "codec_type": "h264" } ``` - ALLOCATED_SERVICE, NOTIFICATION, BUYER_ENTER_FROM_TRANSFER, OTHER: ``` { "content": "simple text" } ``` - COUPON_CARD: ``` { "coupon_id": "7262992004278206762" } ``` Note: Use [Get Coupon](6699dce0de15e502ed219e37) for the details of the coupon. |
| ^^^create_time | integer |  | Unix timestamp for creating the message in seconds. |
| ^^^id | string |  | Message ID. |
| ^^^index | string |  | Message index. This field can be used to sort messages. "index" means the order of the message in the conversation. This value is unique for every message in a conversation. This value is time-related, meaning a newer message will get a larger "index". But it is not strictly increasing. |
| ^^^is_visible | boolean |  | Whether this message should be displayed to customer service. For example, the buyer will receive a rating request message at the end of the conversation from the system. You should not present this type of message to the seller or the customer support agents. |
| ^^^sender | object |  | Sender of the message. |
| ^^^^avatar | string |  | Sender's avatar URL. |
| ^^^^im_user_id | string |  | Sender's IM ID. Sender's unique identifier in TikTok Shop's IM system. |
| ^^^^nickname | string |  | Sender's nickname. - For shops, the nickname is the shop's name. - For customer service, the nickname is the customer service's name. - For buyers, the nickname is the buyer's nickname on TikTok. You can set the nicknames for shops and customer service agents on Seller Center. |
| ^^^^role | string |  | Sender's role. Possible enumerations: - `BUYER` - `SHOP` - `CUSTOMER_SERVICE` - `SYSTEM` - `ROBOT` For `SYSTEM` and `ROBOT` role, the value of `im_user_id`, `nickname`, and `avatar` are the same as those of the `SHOP` role. |
| ^^^type | string |  | Message type. Possible enumerations: - TEXT - IMAGE - ALLOCATED_SERVICE - A customer service agent joins the conversation. - NOTIFICATION - Notification from the system. - BUYER_ENTER_FROM_TRANSFER : The conversation is transferred to another customer service agent. - BUYER_ENTER_FROM_PRODUCT : The buyer is viewing a product before sending this message. - BUYER_ENTER_FROM_ORDER : The buyer is viewing an order before sending this message. - PRODUCT_CARD - EMOTICONS - ORDER_CARD - VIDEO - RETURN_REFUND_CARD: Return/refund card. - COUPON_CARD - OTHER: Messages of types not supported in this API. |
| ^^participant_count | integer |  | Number of participants in the conversation. - If there has been no customer service agent in the conversation, the value is `2`: the shop and the buyer; - Otherwise, the value is `3`: the shop, the buyer, and the customer service agent. |
| ^^participants | array<object> |  | Conversation participants. |
| ^^^avatar | string |  | Participant's avatar URL. |
| ^^^buyer_platform | string |  | Which platform is the buyer from. This field will only be returned when the role is `BUYER` and the region is Indonesia. Possible enumerations: - TIKTOK_SHOP - TOKOPEDIA You cannot send platform-specific content to the buyer from a different platform. For example, when you send a product card to the Tokopedia buyer, you must ensure the product is listed on Tokopedia. |
| ^^^im_user_id | string |  | Participant's ID, in IM system. This ID is used in IM system and can not be used to query orders. To query orders, use `user_id` instead. |
| ^^^nickname | string |  | Participant's nickname. |
| ^^^role | string |  | Participant's role. Possible enumerations: - `BUYER` - `SHOP` - `CUSTOMER_SERVICE` |
| ^^^user_id | string |  | Participant's ID. |
| ^^unread_count | integer |  | Number of messages unread by the customer service agent. |
| ^next_page_token | string |  | The index indicates where we should start on the next page. If there is no more record, this field will be ""(empty string). Put this value to request param "page_token" for the next page query. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateConversation

Use this API to create a conversation with the specified buyer, on behalf of a shop. When there's no prior conversation, calling this API creates a new conversation; when there's a prior conversation, no matter whether it's active, finished, or closed, calling this API reopens the conversation and returns the same conversation ID as the prior one.

**Path:** `/customer_service/202309/conversations`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-conversation-202309

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
| buyer_user_id | string |  | Buyer's user ID The value is the same as `data.orders.user_id` in the response data of [Get Order Detail](650aa8ccc16ffe02b8f167a0). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^conversation_id | string |  | Converstaion ID. The unique identifier for a conversation between the buyer and a shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConversationMessages

Use this API to get all messages in a conversation between a buyer and a shop. 
Calling this API does not mark the messages as read. You are suggested to call [Read Message](650a59f7c16ffe02b8e8db3f) to mark the messages read.

**Path:** `/customer_service/202309/conversations/{conversation_id}/messages`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-conversation-messages-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y | Conversation ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Paging cursor, this means where this query should start. For the next page, use "next_page_token" in response. |
| page_size | integer | Y | Number of conversations in one page Max 10. |
| locale | string |  | System message's display language. The messages sent by System will be returned in the setting language; The messages sent by the buyer, the shop, the CS agent will not be affected. The default value is en (English). Possible enumerations: - de-DE (German, Germany) - en (English) - en-GB (English, United Kingdom) - es-ES (Spanish, Spain) - es-MX (Spanish, Latin America) - fr-FR (French, France) - id-ID (Indonesian, Indonesia) - it-IT (Italian, Italy) - ja-JP (Japanese) - ms-MY (Malay, Malaysia) - th-TH (Thai, Thailand) - vi-VN (Vietnamese, Vietnam) - pt-BR (Portuguese, Brazil) - zh-CN (Simplified Chinese, China) |
| sort_order | string |  | Sort order. Possible enumerations: - DESC(default) - ASC |
| sort_field | string |  | Sort messages by one of the following properties: - `create_time` (default) - `index` |
| need_data | boolean |  | Need message.data |
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
| ^messages | array<object> |  | Messages in conversation. |
| ^^content | string |  | Message content, in JSON serialized string. Examples of content for each type of message are listed below: - TEXT: ``` { "content": "simple text" } ``` - IMAGE: ``` { "height": "290", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "304" } ``` - PRODUCT_CARD, BUYER_ENTER_FROM_PRODUCT: ``` { "product_id": "12345" } ``` - ORDER_CARD, BUYER_ENTER_FROM_ORDER : ``` { "order_id": "12345" } ``` - LOGISTICS_CARD: ``` { "order_id": "12345", "package_id": "321" } ``` - RETURN_REFUND_CARD: ``` { "order_id": "12345", "sku_id": "45678" } ``` - VIDEO: ``` { "url": "https://video-boei18n.byted.org/storage/v1/tos-boei18n-v-c72c01/e8240f35244646428df9c3244d1a7408?x-tos-algorithm=v2&x-tos-authkey=5bf25627da095a5cba28ace592de46cc&x-tos-expires=1681980481&x-tos-signature=r_bRxtrvGhXAuZgMmNhlZ_Upqzg", "cover": "https://p-boei18n.byted.org/tos-boei18n-v-c72c01/o8keEOhzTcNCcJyAbkWZwpLIyTfkJxcGbRBvLP~tplv-jvtte31kaf-origin-jpeg.jpeg?", "width": 640, "height": 360, "duration": "20.504", "vid": "v0e30cg700f7cgcmu8jc77u9e2bdp95g", "expire_time": "1681980481", "format": "mp4", "size": 400000, "bit_rate": 156067, "quality": "original", "codec_type": "h264" } ``` - ALLOCATED_SERVICE, NOTIFICATION, BUYER_ENTER_FROM_TRANSFER, OTHER: ``` { "content": "simple text" } ``` - COUPON_CARD: ``` { "coupon_id": "7262992004278206762" } ``` Note: Use [Get Coupon](6699dce0de15e502ed219e37) for the details of the coupon. |
| ^^create_time | integer |  | Unix timestamp for creating the message in seconds. |
| ^^data | string |  | { "packages": [ { "package_id": "456", "product_name": "Nutrition", "product_image": "https://cdn-us.com/us/123jpeg:1000:1000.jpeg?dr=123&t=555", "paid_price": "$0.01", "quantity": 1, "predict_delivery_time_min": 1763198750000, "predict_delivery_time_max": 1763457950000, "delivery_option": "Standard shipping", "tracking_number": "1Z789", "shipping_provider_name": "UPS", "tracking": [ { "description": "Package has been delivered!", "update_time_millis": 1763954669267 }, { "description": "Arrived at the carrier's facility.", "update_time_millis": 1763954598311 }, { "description": "Package picked up.", "update_time_millis": 1763954598024 }, { "description": "Order packed and ready for dropoff at carrier's facility.", "update_time_millis": 1763451813897 }, { "description": "Order placed.", "update_time_millis": 1763112346906 } ] } ] } |
| ^^id | string |  | Message ID. |
| ^^index | string |  | Message index. This field can be used to sort messages. "index" means the order of the message in the conversation. This value is unique for every message in a conversation. This value is time-related, meaning a newer message will get a larger "index". But it is not strictly increasing. |
| ^^is_visible | boolean |  | Whether this message should be displayed to customer service. For example, the buyer will receive a rating request message at the end of the conversation from the system. You should not present this type of message to the seller or the customer support agents. |
| ^^sender | object |  | The message sender. For system and robot roles, shop is the sender. |
| ^^^avatar | string |  | Sender's avatar URL. |
| ^^^im_user_id | string |  | Sender's ID. These are IM IDs, and can not be used to query orders. |
| ^^^nickname | string |  | Sender's nickname. - For shops, the nickname is the shop's name. - For customer service, the nickname is the customer service's name. - For buyers, the nickname is the buyer's nickname on TikTok. You can set the nicknames for shops and customer service agents on Seller Center. |
| ^^^role | string |  | Sender's role. Possible enumerations: - `BUYER` - `SHOP` - `CUSTOMER_SERVICE` - `SYSTEM` - `ROBOT` For `SYSTEM` and `ROBOT` role, the value of `im_user_id`, `nickname`, and `avatar` are the same as those of the `SHOP` role. |
| ^^type | string |  | Message type. Possible enumerations: - TEXT - IMAGE - ALLOCATED_SERVICE - A customer service agent joins the conversation. - NOTIFICATION - Notification from the system. - BUYER_ENTER_FROM_TRANSFER : The conversation is transferred to another customer service agent. - BUYER_ENTER_FROM_PRODUCT : The buyer is viewing a product before sending this message. - BUYER_ENTER_FROM_ORDER : The buyer is viewing an order before sending this message. - PRODUCT_CARD - EMOTICONS - ORDER_CARD - VIDEO - RETURN_REFUND_CARD: Return/refund card. - COUPON_CARD - LOGISTICS_CARD - OTHER: Messages of types not supported in this API. |
| ^next_page_token | string |  | The index indicates where we should start on the next page. If there is no more record, this field will be ""(empty string). Put this value to request param "page_token" for the next page query. |
| ^unsupported_msg_tips | string |  | If your app encounters a message type it doesn't support, you can display the text to guide the user to check the message in TikTok Shop. The content of the message depends on the specific `locale`. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SendMessage

Use this API to send a message to the buyer in a conversation.

**Path:** `/customer_service/202309/conversations/{conversation_id}/messages`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/send-message-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y | Conversation ID |

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
| content | string |  | Message content, in JSON serialized string. Examples of content for each type of message are listed below: ​ - TEXT: { "content": "hi, I want to get refunded." } (Note: Max 2000 characters. Do not use sensitive words that violate TikTok Shop terms & policies.) - VIDEO { "vid": "v10394g5000cd499vc7og65mqn3r3dg0" } - LOGISTICS_CARD { "order_id": "580874485811283206", "package_id": "123456"  // Optional  (recommended for one order with multiple packages; not required for one order with one package) } ​ - PRODUCT_CARD { "product_id": "7494560109732334265" } ​ - ORDER_CARD: { "order_id": "7494560109732334267" } - RETURN_REFUND_CARD: { "order_id": "7494560109732334267", "sku_id": "7494560109732363423" } Note: The order of the RETURN_REFUND_CARD to send must meet after-sale conditions. To check the eligibility, use [Get Aftersale Eligibility](650ab645c16ffe02b8f2e1c1). ​ - IMAGE: { "url":"https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/2ca53c34ad8443e6b39f4e0153d3aed4~tplv-o3syd03w52-origin-image.image?from=1320446476", "width": 1280, "height": 720 } Note: You can get the value of `url` by calling [Upload Buyer Messages Image](650a599d0fcef602bf2a1dc8). - COUPON_CARD: { "coupon_id": "7262992004278206762" } Note: Coupons that can be sent in  a message must meet all the following conditions: 1. `display_type==CHAT` or `display_type==REGULAR` 2. `status==ONGOING` 3. `creation_source==SELLER_CENTER` 4. `target_buyer_segment!=REPEAT_CUSTOMERS` |
| type | string |  | Message type. Possible enumerations: - `TEXT` - `IMAGE` - `VIDEO` - `PRODUCT_CARD` - `ORDER_CARD` - `RETURN_REFUND_CARD` - `COUPON_CARD` - `LOGISTICS_CARD` |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^message_id | string |  | Message ID |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ReadMessage

Use this API to mark all messages sent by the buyer as read. You are suggested to call this API before replying to their messages.

**Path:** `/customer_service/202309/conversations/{conversation_id}/messages/read`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/read-message-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y |  |

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
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadBuyerMessagesImage

You must use this API to upload the image first, before sending an image as a message using [Send Message](650a58bbbace3e02b7556286).

**Path:** `/customer_service/202309/images/upload`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-buyer-messages-image-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | The format of the image must be jpg, gif, webp, or png. The size of the image must not exceed 10MB. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^height | integer |  | Image height |
| ^url | string |  | Image URL |
| ^width | integer |  | Image width |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCustomerServicePerformance

Get the average customer service performance of a shop for a selected time period

**Path:** `/customer_service/202407/performance`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/get-customer-service-performance-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| support_date_ge | string | Y | The start date (YYYY-MM-DD) of the period for selecting chat support sessions to be included in the performance evaluation. |
| support_date_lt | string | Y | The end date (YYYY-MM-DD) of the period for selecting chat support sessions to be included in the performance evaluation. |
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
| ^performance | object |  | The customer service performance metrics for the shop based on chat support sessions within the selected evaluation period. |
| ^^response_percentage | string |  | The percentage of chat support sessions of which the first response happens within 24 hours. The sessions which started in the specified time slot are included in calculation. - Automated responses such as FAQ cards are regarded as responses within 24 hours. - Sessions initiated during vacation mode are excluded from this calculation. |
| ^^response_time_mins | string |  | The average first response time in minutes for chat support sessions. The sessions which started in the specified time slot are included in calculation. |
| ^^satisfaction_percentage | string |  | The percentage of chat support sessions rated 'Satisfied' (4 or 5 stars). The sessions of which the rating occurred in the specified time slot are included in the calculation; the sessions without rate are not included in the calculation. |
| ^^support_session_count | integer |  | The total number of chat support sessions initiated by customers. A session starts when a customer first clicks an FAQ card or sends a message (text, image, video, emoji, product card, order card, etc.) in chat. The sessions which started in the specified time slot are included in calculation. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConversation

Use this API to retrieve information about a conversation by ID.

**Path:** `/customer_service/202601/conversations/{conversation_id}`
**Method:** `GET`
**Version:** 202601
**Docs:** https://partner.tiktokshop.com/docv2/page/get-conversation-202601

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y | Conversation ID |

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
| ^conversation | object |  | Conversation info. |
| ^^create_time | integer |  | Unix timestamp when the conversation was created. In seconds. |
| ^^id | string |  | Conversation ID |
| ^^participant_count | integer |  | Number of participants in the conversation. - If there has been no customer service agent in the conversation, the value is `2`: the shop and the buyer; - Otherwise, the value is `3`: the shop, the buyer, and the customer service agent. |
| ^^participants | array<object> |  | Conversation participants. |
| ^^^avatar | string |  | Participant's avatar URL. |
| ^^^im_user_id | string |  | Participant's ID, in IM system. This ID is used in IM system and can not be used to query orders. To query orders, use `user_id` instead. |
| ^^^nickname | string |  | Participant's nickname. |
| ^^^platform | string |  | Which platform is the buyer from. This field will only be returned when the role is `BUYER` and the region is Indonesia. Possible enumerations: - TIKTOK_SHOP - TOKOPEDIA You cannot send platform-specific content to the buyer from a different platform. For example, when you send a product card to the Tokopedia buyer, you must ensure the product is listed on Tokopedia. |
| ^^^role | string |  | Participant's role. Possible enumerations: - `BUYER` - `SHOP` - `CUSTOMER_SERVICE` |
| ^^^user_id | string |  | Participant's ID. |
| ^^unread_count | integer |  | Number of messages unread by the customer service agent. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
