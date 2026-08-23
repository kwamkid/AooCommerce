# TikTok Shop API — customer_engagement

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 7 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202412, 202501, 202502

---

## CreateEngagementTask

Create an engagement task that acts as a container for grouping messages with similar content and rules, allowing sellers to track and compare task performance across different types of content.
Note that each task has a mandatory end time, and once expired, it cannot be used to send additional messages.

**Path:** `/customer_engagement/202412/engagement_tasks`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/create-engagement-task-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string | Y | A unique key to recognize a request and prevent duplicate processing of the same request, especially in cases of connection issues. Ensure this key is unique for each request to avoid accidental duplicates. **Note**: We recommend that you generate v4 UUIDs for use as keys. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| channel | string |  | The engagement channel. Only `TIKTOK_IM` is supported. |
| coupon_ids | array<string> |  | The coupon ID. Retrieve this value and other coupon-related information from the [Search Coupons API](https://partner.tiktokshop.com/docv2/page/6699dcdf115ebe02f841e4cd). **Note**: The coupon properties must comply with the rules defined in `coupon_card_rules.coupon_type` of the [Get Message Templates API](67777e44223fde02fdfdc157). |
| end_time | integer |  | The time at which the task ends, and messages will no longer be sent. Unix timestamp (seconds). |
| product_ids | array<string> |  | The product ID. Retrieve this value from the [Search Products API](https://partner.tiktokshop.com/docv2/page/65854ffb8f559302d8a6acda). |
| task_name | string |  | The name of the task. |
| template_id | string |  | The ID of engagement message templates predefined by TikTok Shop. Retrieve the value from [Get Message Templates](67777e44223fde02fdfdc157). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^task_id | string |  | The unique identifier for the customer engagement task. Pass this value in the [Send Engagement Message API](67777e448e882e030d29676e) to associate the task with the message sending operation. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetMessageTemplates

Get a library of customer engagement message templates predefined by TikTok Shop, which you can use directly in your customer engagement communications.

**Path:** `/customer_engagement/202412/message_templates`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-message-templates-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string | Y | Shop_cipher is required for cross-border shops, and optional for local shops. It's unique for each shop. Get the this property from the Get Authorized Shop API dynamically. Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |
| locale | string | Y | The BCP-47 locale codes for displaying the message content, delimited by commas. Default: en-US Refer to [Locale codes](678e3a47bae28f030a8c7523) for the list of supported locale codes. |

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
| ^message_templates | array<object> |  | Customer engagement message templates predefined by TikTok Shop. |
| ^^coupon_card_rules | object |  | Rules on the number and type of interactive coupon cards that can be included in a message. |
| ^^^coupon_type | array<string> |  | The types of coupon that can be included in the message. Possible values: - REGULAR_ALL: Regular coupons that target all buyers. Required coupon properties: `coupons.display_type=REGULAR` and `coupons.target_buyer_segment=ALL` in the [Search Coupons API](https://partner.tiktokshop.com/docv2/page/6699dcdf115ebe02f841e4cd). - REGULAR_REPEAT: Regular coupons that target only repeat buyers. Required coupon properties: `coupons.display_type=REGULAR` and `coupons.target_buyer_segment=REPEAT_CUSTOMERS` in the [Search Coupons API](https://partner.tiktokshop.com/docv2/page/6699dcdf115ebe02f841e4cd). |
| ^^^max_count | integer |  | The maximum number of coupon cards that can be included. |
| ^^^min_count | integer |  | The minimum number of coupon cards that must be included. |
| ^^id | string |  | The template ID. |
| ^^message_body | string |  | The message body. |
| ^^message_title | string |  | The message title. |
| ^^product_card_rules | object |  | Rules on the number and type of interactive product cards that can be included in a message. |
| ^^^max_count | integer |  | The maximum number of product cards that can be included. |
| ^^^min_count | integer |  | The minimum number of product cards that must be included. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SendEngagementMessage

Send messages to specific customers for a particular engagement task.

**Path:** `/customer_engagement/202412/messages`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/send-engagement-message-202412

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
| buyer_emails | array<string> |  | The anonymized email address of the buyer. Retrieve this value from the [Get Order Details API](650aa8ccc16ffe02b8f167a0). **Note**: You can only send messages to buyers who have placed at least one order with the shop in the past 365 days. |
| task_id | string |  | The ID of the associated customer engagement task. Use the value returned when you call the [Create Engagement Task API](67777e436b61b002f60f01da). **Note**: Ensure the task is still active. You cannot send messages to tasks that have ended. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^buyer_email | string |  | The list of buyer email addresses where message delivery failed. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTaskPerformances

Retrieve detailed performance metrics for a customer engagement task, including message reads, order conversions, and other key engagement statistics.

**Path:** `/customer_engagement/202412/performances`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-task-performances-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string | Y | Shop_cipher is required for cross-border shops, and optional for local shops. It's unique for each shop. Get the this property from the Get Authorized Shop API dynamically. Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| task_ids | array<string> |  | The list of tasks for which you want to retrieve performance data. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^task_performances | array<object> |  | The requested list of task performance. |
| ^^claimed_coupons_count | integer |  | The number of coupons claimed. |
| ^^gmv_amount | string |  | The revenue from the converted orders. |
| ^^id | string |  | Task ID |
| ^^order_count | integer |  | The number of orders resulting from the message. |
| ^^read_recipient_count | integer |  | The number of users that read the message. |
| ^^sent_recipient_count | integer |  | The number of users that received the message. |
| ^^status | string |  | The status of the task. Possible values: SENDING FAILED CANCELED SUCCESS |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCustomerTabVisibility

Checks whether the Customer tab is visible for the specified shop.

**Path:** `/customer_engagement/202501/customer_tab/visibility`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-customer-tab-visibility-202501

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string | Y | Shop_cipher is required for cross-border shops, and optional for local shops. It's unique for each shop. Get the this property from the Get Authorized Shop API dynamically. Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

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
| ^is_visible | boolean |  | A flag to indicate if the Customer tab is visible to the shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateCustomEngagementTask

Create an engagement task that uses a self-defined custom message instead of predefined message templates from TikTok Shop. The task acts as a container for grouping messages with similar content and rules, allowing sellers to track and compare task performance across different types of content.
Note that each task has a mandatory end time, and once expired, it cannot be used to send additional messages.

**Path:** `/customer_engagement/202502/engagement_tasks/custom`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/create-custom-engagement-task-202502

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string | Y | A unique key to recognize a request and prevent duplicate processing of the same request, especially in cases of connection issues. Ensure this key is unique for each request to avoid accidental duplicates. Note: We recommend that you generate v4 UUIDs for use as keys. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| channel | string |  | The engagement channel. Only `TIKTOK_IM` is supported. |
| coupon_ids | array<string> |  | The coupon IDs that you want to include as interactive cards in the message. Max count: 1 You can only add coupons that have one of these sets of property: - `coupons.display_type=REGULAR` and `coupons.target_buyer_segment=ALL` - `coupons.display_type=REGULAR` and `coupons.target_buyer_segment=REPEAT_CUSTOMERS`. Find out the coupon ID and properties from the [Search Coupons API](https://partner.tiktokshop.com/docv2/page/6699dcdf115ebe02f841e4cd). |
| custom_message | object |  | The custom message to send to customers. |
| ^body | string |  | The message body. - Valid format: plain text, unicode emoji (UTF-8) - Valid length:  [1, 500] |
| ^title | string |  | The message title. - Valid format: plain text, unicode emoji (UTF-8) - Valid length: [1, 70] |
| end_time | integer |  | The time at which the task ends, and messages will no longer be sent. Unix timestamp (seconds). |
| product_ids | array<string> |  | The product IDs that you want to include as interactive cards in the message. Retrieve this value from the [Search Products API](https://partner.tiktokshop.com/docv2/page/65854ffb8f559302d8a6acda). Max count: 4 |
| task_name | string |  | The name of the task. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^task_id | string |  | The unique identifier for the customer engagement task. Pass this value in the [Send Engagement Message API](67777e448e882e030d29676e) to associate the task with the message sending operation. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetFeaturePermissions

Retrieve information about customer engagement features that the shop has permission to use.

**Path:** `/customer_engagement/202502/permissions`
**Method:** `GET`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/get-feature-permissions-202502

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
| ^features | array<object> |  | The list of customer engagement features that has access control. |
| ^^is_authorized | boolean |  | A flag to indicate whether the shop has permission to use this feature. Possible values: - `true`: Authorized to use this feature. - `false`: Not authorized to use this feature. |
| ^^name | string |  | The feature name. Possible values: - `FUNDAMENTAL`: The ability to use any customer engagement APIs or features. This is the prerequisite for all other customer engagement features. - `CUSTOM_MSG`: The ability to define and send custom messages. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
