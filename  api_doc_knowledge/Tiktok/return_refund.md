# TikTok Shop API — return_refund

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 14 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202405, 202512

---

## CancelOrder

Use this API to cancel an order on behalf of a seller. In the US and UK markets, when an item is out of stock, partial cancellation on the single item level is supported by this API.

**Path:** `/return_refund/202309/cancellations`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/cancel-order-202309

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
| cancel_reason | string |  | Reason to cancel the order Please see "Return API Overview" for a list of reasons a seller can select to cancel the order. |
| order_id | string |  | TikTok Shop order id |
| order_line_item_ids | array<string> |  | List of order line item ids to cancel. In the US and UK markets, when an item is out of stock, partial cancellation on the single item level is supported. To initiate a partial cancellation, specify the item's order line id. |
| skus | array<object> |  | List of SKU to cancel |
| ^quantity | integer |  | The quantity of SKU to cancel |
| ^sku_id | string |  | The SKU id to cancel |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^cancel_id | string |  | The identifier of a specific order cancellation. |
| ^cancel_status | string |  | The status of an order cancellation request. Available values: - CANCELLATION_REQUEST_PENDING - CANCELLATION_REQUEST_SUCCESS - CANCELLATION_REQUEST_CANCEL - CANCELLATION_REQUEST_COMPLETE |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCancellations

Use this API to search and retrieve one or more order cancellations.

**Path:** `/return_refund/202309/cancellations/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-cancellations-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sort_field | string |  | The returned results will be sorted by the specified field. Default: create_time Possible values: - create_time - update_time Specify the order for sorting the returned results by using the sort_order parameter. |
| sort_order | string |  | The sort order for the sort_field parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| page_size | string |  | The number of results to be returned per page. Default: 10. Valid range: [1-50]. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the next_page_token from a previous response. It is not needed for the first page. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| buyer_user_ids | array<string> |  | List of TikTok Shop buyer user IDs. |
| cancel_ids | array<string> |  | List of order cancellations IDs. |
| cancel_status | array<string> |  | List of order cancellation statuses. Possible values: - CANCELLATION_REQUEST_PENDING - CANCELLATION_REQUEST_SUCCESS - CANCELLATION_REQUEST_CANCEL - CANCELLATION_REQUEST_COMPLETE Please see "API Overview" for more information about these statuses. |
| cancel_types | array<string> |  | List of order cancellation types. Possible values: - CANCEL: Cancel by seller or system. - BUYER_CANCEL: Cancel by buyer. Need to be approved by seller or system. |
| create_time_ge | integer |  | Filter cancellations to show only orders that have been created after a specified date and time. Unix timestamp. |
| create_time_lt | integer |  | Filter cancellations to show only orders that have been created before a specified date and time. Unix timestamp. |
| locale | string |  | The BCP-47 locale codes for displaying the order, delimited by commas. Default: en-US Refer to [Locale codes](678e3a47bae28f030a8c7523) for the list of supported locale codes. |
| order_ids | array<string> |  | List of TikTok Shop order IDs. |
| update_time_ge | integer |  | Filter cancellations to show only orders that have been updated after a specified date and time. Unix timestamp. |
| update_time_lt | integer |  | Filter cancellations to show only orders that have been updated before a specified date and time. Unix timestamp. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^cancellations | array<object> |  | List of order cancellations. |
| ^^cancel_id | string |  | The identifier of a specific order cancellation. |
| ^^cancel_line_items | array<object> |  | Cancellation line items. |
| ^^^cancel_line_item_id | string |  | Cancellation line item ID. |
| ^^^order_line_item_id | string |  | Order line item ID. |
| ^^^product_image | object |  | Product image object. Contains product image information. |
| ^^^^height | integer |  | Product image height. Unit: px |
| ^^^^url | string |  | Product image URL. |
| ^^^^width | integer |  | Product image width. Unit: px |
| ^^^product_name | string |  | Product name. |
| ^^^refund_amount | object |  | Refund amount information. |
| ^^^^buyer_service_fee | string |  | Only for the ID market. Platform will charge the buyer service fee depending on the scenario. |
| ^^^^currency | string |  | Refund currency. |
| ^^^^refund_shipping_fee | string |  | Shipping fee refund amount to the buyer. |
| ^^^^refund_subtotal | string |  | Subtotal refund amount to the buyer. |
| ^^^^refund_tax | string |  | Tax refund amount to the buyer. |
| ^^^^refund_total | string |  | Total refund amount to the buyer. |
| ^^^^retail_delivery_fee | string |  | Retail delivery fee takes effect once platform GMV exceeds 500,000 USD, according to Colorado (US) compliance rules. |
| ^^^seller_sku | string |  | SKU name defined by the seller. |
| ^^^sku_id | string |  | SKU ID. |
| ^^^sku_name | string |  | SKU name. |
| ^^cancel_reason | string |  | Order cancellation reason. |
| ^^cancel_reason_text | string |  | Order cancellation reason, localized to another language. You can change language using the locale field in the request parameter. |
| ^^cancel_status | string |  | Order cancellation status. Possible values: - CANCELLATION_REQUEST_PENDING - CANCELLATION_REQUEST_SUCCESS - CANCELLATION_REQUEST_CANCELLED - CANCELLATION_REQUEST_COMPLETE |
| ^^cancel_type | string |  | Order cancellation type. Possible values: - CANCEL: Cancel by seller or system. - BUYER_CANCEL: Cancel by buyer. Need to be approved by seller or system. |
| ^^create_time | integer |  | Order cancellation create time. Unix timestamp. |
| ^^order_id | string |  | TikTok Shop order ID. Contains multiple order line item IDs. |
| ^^refund_amount | object |  | Refund amount information. |
| ^^^buyer_service_fee | string |  | Only for the ID market. Platform will charge the buyer a service fee depending on the scenario. |
| ^^^currency | string |  | Refund currency. |
| ^^^refund_shipping_fee | string |  | Shipping fee refund amount to the buyer. |
| ^^^refund_subtotal | string |  | Subtotal refund amount to the buyer. |
| ^^^refund_tax | string |  | Tax refund amount to the buyer. |
| ^^^refund_total | string |  | Total refund amount to the buyer. |
| ^^^retail_delivery_fee | string |  | Retail delivery fee takes effect once platform GMV exceeds $500,000 USD, according to Colorado (US) compliance rules. |
| ^^role | string |  | Order cancellation initiator. Possible values: - BUYER - SELLER - SYSTEM |
| ^^seller_next_action_response | array<object> |  | Seller's next action and deadline. |
| ^^^action | string |  | Seller's next action. Possible values: - SELLER_RESPOND_CANCEL |
| ^^^deadline | integer |  | Unix timestamp indicating the deadline for when the seller must perform the next action. |
| ^^update_time | integer |  | Order cancellation update time. Unix timestamp. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the page_token parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of cancellations that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ApproveCancellation

Use this API to approve a buyer's order cancellation request.

**Path:** `/return_refund/202309/cancellations/{cancel_id}/approve`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/approve-cancellation-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| cancel_id | string | Y | The identifier of a specific cancellation request. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string |  | The idempotency key is a unique value generated by the client which the server uses to recognize a request. You may choose your own method of creating unique keys. We suggest using UUIDs, or another random string with enough entropy, to avoid collisions. Idempotency keys can be up to 255 characters long. |
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

## RejectCancellation

Use this API to reject a buyer's order cancellation request.

**Path:** `/return_refund/202309/cancellations/{cancel_id}/reject`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/reject-cancellation-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| cancel_id | string | Y | The identifier of a specific cancellation request. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string |  | The idempotency key is a unique value generated by the client which the server uses to recognize a request. You may choose your own method of creating unique keys. We suggest using UUIDs, or another random string with enough entropy, to avoid collisions. Idempotency keys can be up to 255 characters long. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| comment | string |  | Seller's comment on rejection decision. This is where a seller will provide more information about rejecting the request. |
| images | array<object> |  | List of images provided by the seller to support seller's decision to reject the order cancellation request. |
| ^height | integer |  | Image height. Unit: px |
| ^image_id | string |  | Image ID. |
| ^mime_type | string |  | MIME type. |
| ^width | integer |  | Image width. Unit: px |
| reject_reason | string |  | Seller's reason to reject buyer's order cancellation request. Please visit our [cancel reason appendix ](650b28280fcef602bf435096) to see a list of possible rejection reasons. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAftersaleEligibility

Use this API to check eligible aftersale solutions for an order, including whether the seller or buyer can initiate a refund, return, or cancel a specific order.

**Path:** `/return_refund/202309/orders/{order_id}/aftersale_eligibility`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-aftersale-eligibility-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The unique identifier for a TikTok Shop order. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| initiate_aftersale_user | string |  | The type of user you would like to check aftersale options for. Default: SELLER Possible values: - SELLER - BUYER |
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
| ^sku_eligibility | array<object> |  | The eligible aftersale options for a given SKU. |
| ^^line_item_eligibility | array<object> |  | The eligible aftersale options based on order line item. |
| ^^^eligible | boolean |  | Use this field to recognize whether an item is eligible for an aftersale request: - TRUE - FALSE |
| ^^^ineligible_code | integer |  | The reason code for an ineligible aftersale request. |
| ^^^ineligible_reason | string |  | The reason for an ineligible aftersale request. |
| ^^^order_line_items_ids | array<string> |  | IDs of order line items. |
| ^^^request_type | string |  | Aftersale request type. Possible values: - CANCEL - RETURN - RETURN_AND_REFUND |
| ^^sku_id | string |  | SKU ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CalculateRefund

Use this API to check order refundable amounts.

**Path:** `/return_refund/202309/refunds/calculate`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/calculate-refund-202309

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
| handover_method | string |  | Which handover method buyer chooses to use when returning goods to seller by platform - DROP_OFF: buyer drops off the parcel in logistics service collect point. - PICKUP: logistics service picks up the buyer package. |
| order_id | string |  | TikTok Shop order id. |
| order_line_item_ids | array<string> |  | TikTok Shop order line item ids. |
| reason_name | string |  | Seller's reason to create a return，all available reasons, please reference to API overview. |
| request_type | string |  | Request type - CANCEL - REFUND - RETURN_AND_REFUND Note: different request types are used for different aftersales scenarios. Also, different request types might have different refund amounts, because the refund amount calculation policy is different. |
| shipment_type | string |  | How buyer ships items to seller when in a return request, could be: - PLATFORM - BUYER_ARRANGE |
| skus | array<object> |  | skus |
| ^quantity | integer |  | Sku id seller wants to create a return request. |
| ^sku_id | string |  | Quantity seller wants to create a return request. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^order_refund_amount | object |  | Refund amount to buyer. |
| ^^currency | string |  | Currency for payment. |
| ^^refund_shipping_fee | string |  | Shipping fee refund to buyer. |
| ^^refund_subtotal | string |  | Total price of item be returned. |
| ^^refund_tax | string |  | Tax returned to buyer. |
| ^^refund_total | string |  | Total amount refund to buyer. |
| ^^retail_delivery_fee | string |  | Retail delivery fee takes effect once platform GMV exceeds 500,000 USD, according to US Colorado states' compliance rules. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetRejectReasons

Use this API to obtain order return or cancellation rejection reasons. The seller is required to provide a reason when they reject a cancel, refund, or return request.

**Path:** `/return_refund/202309/reject_reasons`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-reject-reasons-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying the rejection reason, delimited by commas. Default: en-US Refer to [Locale codes](678e3a47bae28f030a8c7523) for the list of supported locale codes. |
| return_or_cancel_id | string | Y | The unique identifier for an order return or cancellation. |
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
| ^reasons | array<object> |  | The list of rejection reasons the seller has provided. |
| ^^name | string |  | The reason name of a seller rejection. |
| ^^text | string |  | The corresponding text to the reason name, localized based on the locale input parameter. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateReturn

Use this API to initiate a return request on behalf of the buyer Sellers can reject the request, or accept and issue: -Return and Refund (buyer must send package back) -Returnless Refund (buyer can keep the item) -Partial Refund (Seller issues a partial refund, buyer can keep the item)

**Path:** `/return_refund/202309/returns`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-return-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string |  | Idempotency Key |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| currency | string |  | Currency for refund which should be same as currency in TikTok Ship Order. |
| handover_method | string |  | Which handover method buyer chooses to use when returning goods to seller by platform - DROP_OFF - PICKUP |
| order_id | string |  | Tiktok Shop order id |
| order_line_item_ids | array<string> |  | Order line ids seller wants to create return request, should use order line ids to create return request if had split parcel to multiple packages, default value is all order line ids in the order if not input order_line_ids and skus |
| refund_total | string |  | Total refund amount to the buyer. The total refund amount can not exceed the refundable amount |
| return_reason | string |  | Seller's reason to create a return |
| return_type | string |  | Which type to create: - REFUND - RETURN_AND_REFUND |
| shipment_type | string |  | How buyer ships items to seller when in a return request, could be: - PLATFORM - BUYER_ARRANGE |
| skus | array<object> |  | Skus |
| ^quantity | integer |  | Quantity seller wants to create a return request |
| ^sku_id | string |  | Sku id seller wants to create a return request |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^return_id | string |  | The identifier of a specific return request. |
| ^return_status | string |  | Return status, available values: - RETURN_OR_REFUND_REQUEST_PENDING: Request is pending, needs to be approved by seller or platform - REFUND_OR_RETURN_REQUEST_REJECT: Seller rejected the request - AWAITING_BUYER_SHIP: Waiting buyer to ship items to seller, if exceed the deadline, request will be closed by platform - BUYER_SHIPPED_ITEM: Buyer has shipped items to seller. - REJECT_RECEIVE_PACKAGE: Seller reject return package - RETURN_OR_REFUND_REQUEST_SUCCESS: The refund/return request is successful, buyer will be refunded. - RETURN_OR_REFUND_REQUEST_CANCEL: The request has been cancelled by buyer or system - RETURN_OR_REFUND_REQUEST_COMPLETE: The request is successful, and the amount has been refunded. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchReturns

Use this API to retrieve one or more returns. This API supports filtering returns using query parameters. You can filter returns by create time, update time, return status, or return types.

**Path:** `/return_refund/202309/returns/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-returns-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sort_field | string |  | The returned results will be sorted by the specified field. Default: `create_time` Possible values: - `create_time` - `update_time` Specify the order for sorting the returned results by using the `sort_order` parameter. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: ASC Possible values: - `ASC`: Ascending order - `DESC`: Descending order |
| page_size | string |  | The number of results to be returned per page. Default: 10. Valid range: [10-50]. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| arbitration_status | array<string> |  | List of arbitration statuses. Available values: - `IN_PROGRESS`: The TikTok Shop platform operator is processing arbitration. Platform may request additional information from the seller. - `SUPPORT_BUYER`: The platform operator supports buyer. - `SUPPORT_SELLER`: The platform operator supports seller. - `CLOSED`: Arbitration is closed. |
| buyer_user_ids | array<string> |  | List of TikTok Shop buyer user IDs. |
| create_time_ge | integer |  | Filter returns to show only those that are created on or after the specified date and time. Unix timestamp. Note: `create_time_ge` and `create_time_le` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_le` is empty, `create_time_le` will default to the current time. - If `create_time_lt` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_lt | integer |  | Filter returns to show only those that are created before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |
| locale | string |  | The BCP-47 locale codes for displaying the returns, delimited by commas. Default: `en` Refer to [Locale codes](678e3a47bae28f030a8c7523) for the list of supported locale codes. |
| order_ids | array<string> |  | List of TikTok Shop order IDs. |
| return_ids | array<string> |  | List of return IDs. |
| return_status | array<string> |  | List of return status. Available values: - `RETURN_OR_REFUND_REQUEST_PENDING`: Buyer has initiated a return or refund request. The request is pending review by seller or system. - `REFUND_OR_RETURN_REQUEST_REJECT`: The return or refund request was rejected. - `AWAITING_BUYER_SHIP`: The return request was approved. The seller is waiting for the buyer to ship the approved items to the seller. If the buyer doesn't ship the items to the seller before the deadline, the platform will close the request. - `BUYER_SHIPPED_ITEM`: Buyer has shipped the approved items to seller. - `REJECT_RECEIVE_PACKAGE`: Seller inspected the returned items and rejected the return request. - `RETURN_OR_REFUND_REQUEST_SUCCESS`: The return/refund request was successful. The buyer will be refunded. - `RETURN_OR_REFUND_REQUEST_CANCEL`: The request has been cancelled by the buyer or system. - `RETURN_OR_REFUND_REQUEST_COMPLETE`: The return/refund was processed successfully. The buyer has been refunded. - `AWAITING_BUYER_RESPONSE`: Seller offer another return type to the buyer, and waiting buyer response. Seller proposed return type can check the `seller_proposed_return_type`. |
| return_types | array<string> |  | List of return types. Available values: - `REFUND` - `RETURN_AND_REFUND` - `REPLACEMENT` |
| seller_proposed_return_type | array<string> |  | List of seller proposed return types. Available values: - `PARTIAL_REFUND` |
| update_time_ge | integer |  | Filter returns to show only those that are updated on or after the specified date and time. Unix timestamp. Note: `update_time_ge` and `update_time_le` together define the update time filter condition. - If `update_time_ge` is filled but `update_time_le` is empty, `update_time_le` will default to the current time. - If `update_time_lt` is filled but `update_time_ge` is empty, `update_time_ge` will default to the earliest shop time. |
| update_time_lt | integer |  | Filter returns to show only those that are created before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^return_orders | array<object> |  | List of returns. |
| ^^arbitration_status | string |  | List of arbitration statuses. Available values: - `IN_PROGRESS`: The TikTok Shop platform operator is processing arbitration. Platform may request additional information from the seller. - `SUPPORT_BUYER`: The platform operator supports buyer. - `SUPPORT_SELLER`: The platform operator supports seller. - `CLOSED`: Arbitration is closed |
| ^^buyer_rejected_partial_refund | boolean |  | Only return this field when seller initiated the partial refund. Available values: - `TRUE`: Buyer reject the seller partial refund offer. - `FALSE`: Buyer accept the seller partial refund offer or awaiting buyer response. |
| ^^can_buyer_keep_item | boolean |  | Whether buyer can keep the item(s) in a return or replacement process. |
| ^^combined_return_id | string |  | If `is_combined_return` is `true`, this field will return the `combined_return_id` associated with the combined return. |
| ^^create_time | integer |  | Return create time. Unix timestamp. |
| ^^discount_amount | array<object> |  | Discount refund details. |
| ^^^currency | string |  | The discount currency. |
| ^^^product_platform_discount | string |  | The refund amount of platform discount. |
| ^^^product_seller_discount | string |  | The refund amount of product seller discount. |
| ^^^shipping_fee_platform_discount | string |  | The refund amount of shipping fee platform discount. |
| ^^^shipping_fee_seller_discount | string |  | The refund amount of shipping fee seller discount. |
| ^^handover_method | string |  | The handover method buyer chooses to use when returning item(s) to seller using platform's shipping service. - `DROP_OFF`: buyer will drop off the item(s) at courier - `PICKUP`: buyer is scheduling a pick up service offered by the courier. |
| ^^is_combined_return | boolean |  | This field will return true if the buyer is asking to combine multiple returns into one return package. |
| ^^next_return_id | string |  | The next return ID the current return order is edited to. |
| ^^order_id | string |  | TikTok Shop order ID. Contains multiple order line item IDs. |
| ^^partial_refund | object |  | Partial refund details. |
| ^^^amount | string |  | The partial refund amount offered by seller. Note: only seller proposed partial refund will return this field. |
| ^^^currency | string |  | Partial refund currency |
| ^^pre_return_id | string |  | The previous return ID the current return order is edited from. |
| ^^refund_amount | object |  | Total refund amount to buyer. |
| ^^^buyer_service_fee | string |  | Buyer service fee. |
| ^^^currency | string |  | Refund currency. |
| ^^^refund_shipping_fee | string |  | Shipping fee refund. |
| ^^^refund_subtotal | string |  | Subtotal refund amount. This is the total price of all items returned. |
| ^^^refund_tax | string |  | Tax fee refund. |
| ^^^refund_total | string |  | Total refund amount. |
| ^^^retail_delivery_fee | string |  | Retail delivery fee takes effect once platform GMV exceeds 500,000 USD, according to US Colorado states' compliance rules. |
| ^^return_id | string |  | The identifier of a specific return. |
| ^^return_line_items | array<object> |  | Return order lines items. |
| ^^^order_line_item_id | string |  | Order line ID. |
| ^^^product_image | object |  | Product image information. |
| ^^^^height | integer |  | Product image height. Units: pixels (px). |
| ^^^^url | string |  | Product image URL. |
| ^^^^width | integer |  | Product image width. Units: pixels (px). |
| ^^^product_name | string |  | Product name. |
| ^^^refund_amount | object |  | Refund amount details. |
| ^^^^buyer_service_fee | string |  | Buyer service fee. |
| ^^^^currency | string |  | Payment currency. |
| ^^^^refund_shipping_fee | string |  | Shipping fee refund amount to buyer. |
| ^^^^refund_subtotal | string |  | Subtotal refund amount to buyer. |
| ^^^^refund_tax | string |  | Tax refund amount to buyer. |
| ^^^^refund_total | string |  | Total refund amount to buyer. |
| ^^^^retail_delivery_fee | string |  | Retail delivery fee takes effect once platform GMV exceeds 500,000 USD, according to US Colorado states' compliance rules. |
| ^^^return_line_item_id | string |  | Return order line ID. |
| ^^^seller_sku | string |  | SKU name defined by seller. |
| ^^^sku_id | string |  | SKU ID. |
| ^^^sku_name | string |  | SKU name. |
| ^^return_method | string |  | Return method: - `SELLER_SHIPPED`: Seller offers the return shipping service. - `BUYER_SHIPPED`: Buyer offers the return shipping service. - `PLATFORM_SHIPPED`: TikTok Shop offers the return shipping service. |
| ^^return_provider_id | string |  | The provider ID of parcel when buyer returns the items. |
| ^^return_provider_name | string |  | The provider name of parcel when buyer returns the item(s). |
| ^^return_reason | string |  | Reason for return. |
| ^^return_reason_text | string |  | Reason for return, in localized text. You can change language using the locale request parameter. |
| ^^return_shipping_document_type | string |  | The type of return shipping document selected by the buyer. Available values: - `SHIPPING_LABE`L - `QR_CODE` |
| ^^return_status | string |  | Return status. Available values: - `RETURN_OR_REFUND_REQUEST_PENDING`: Buyer has initiated a return or refund request. The request is pending review by seller or platform. - `REFUND_OR_RETURN_REQUEST_REJECT`: The return or refund request was rejected. - `AWAITING_BUYER_SHIP`: The return request was approved. The seller is waiting for the buyer to ship the approved items to the seller. If the buyer doesn't ship the items to the seller before the deadline, the platform will close the request. - `BUYER_SHIPPED_ITEM`: Buyer has shipped the approved items to seller. - `REJECT_RECEIVE_PACKAGE`: Seller inspected the returned items and rejected the return package. - `RETURN_OR_REFUND_REQUEST_SUCCESS`: The return/refund request was approved. The buyer will be refunded. - `RETURN_OR_REFUND_REQUEST_CANCEL`: The request has been cancelled by the buyer or system. - `RETURN_OR_REFUND_REQUEST_COMPLETE`: The return/refund was processed successfully. The buyer has been refunded. - `REPLACEMENT_REQUEST_PENDING`: Buyer has initiated a replacement request. The request is pending review by seller. - `REPLACEMENT_REQUEST_REJECT`: Seller reject the buyer replacement request. - `REPLACEMENT_REQUEST_REFUND_SUCCESS`: Buyer's replacement request was resolved by refund due to insufficient inventory. - `REPLACEMENT_REQUEST_CANCEL`: Buyer canceled the replacement request. - `REPLACEMENT_REQUEST_COMPLETE`: Seller has approved the buyer's replacement request, platform will generate a new order for seller to fulfill. - `AWAITING_BUYER_RESPONSE`: Seller offer another return type to the buyer, and waiting buyer response. Seller proposed return type can check the `seller_proposed_return_type`. |
| ^^return_tracking_number | string |  | The tracking number of parcels when buyer returns the item(s). |
| ^^return_type | string |  | Return type. Available values: - `REFUND`: Seller will issue a refund without return. The buyer is not required to send the item(s) back to the seller. - `RETURN_AND_REFUND`: Buyer is required to send the item(s) back to the seller. The seller will need to review the condition of the returned item(s) before a refund can be issued to the buyer. - `REPLACEMENT`: The buyer requires the seller to replace the item(s). |
| ^^return_warehouse_address | object |  | The return warehouse address details provided by the seller. |
| ^^^full_address | string |  | The full return warehouse address. |
| ^^role | string |  | Return initiation role. Available values: - `BUYER` - `SELLER` - `OPERATOR` : TikTok Shop platform operator. - `SYSTEM`:  TikTok Shop system. Please see "API overview" to learn more about roles. |
| ^^seller_next_action_response | array<object> |  | Seller's next action and deadline. |
| ^^^action | string |  | Seller's next action. Available values: - `SELLER_RESPOND_REFUND` - `SELLER_RESPOND_RETURN` - `SELLER_RESPOND_RECEIVE_PACKAGE` - `SELLER_RESPOND_REPLACEMENT` |
| ^^^deadline | integer |  | Indicates the deadline for when seller must perform the next action. |
| ^^seller_proposed_return_type | string |  | Seller proposed return type: - `PARTIAL_REFUND` |
| ^^shipment_type | string |  | The shipment method the buyer selected to send the item(s) back to seller Available values: - `PLATFORM`: Buyer will use TikTok Shop's shipping service to send the items back to seller. Use the `handover_method` field to see which handover method the buyer is using, `drop_off` or `pickup`. - `BUYER_ARRANGE`: Buyer will arrange shipment to send the item(s) back to seller. |
| ^^shipping_fee_amount | array<object> |  | The return shipping fee details. |
| ^^^buyer_paid_return_shipping_fee | string |  | The amount of return shipping fee buyer paid. |
| ^^^currency | string |  | Return shipping fee currency. |
| ^^^platform_paid_return_shipping_fee | string |  | The amount of return shipping fee platform paid. |
| ^^^seller_paid_return_shipping_fee | string |  | The amount of return shipping fee seller paid. |
| ^^update_time | integer |  | Return update time. Unix timestamp. |
| ^total_count | integer |  | The number of returns that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ApproveReturn

Use this API to approve a buyer's return request.

**Path:** `/return_refund/202309/returns/{return_id}/approve`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/approve-return-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_id | string | Y | The identifier of a specific return request. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string |  | The idempotency key is a unique value generated by the client which the server uses to recognize the same request. How you create unique keys is up to you, but we suggest using UUIDs, or another random string with enough entropy to avoid collisions. Idempotency keys can be up to 255 characters long. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| buyer_keep_item | boolean |  | If true, the seller will issue a returnless refund. In other words, the seller will refund without requiring the buyer to send the product back to the seller. Note: Seller's decision for the return request should be APPROVE_RETURN |
| decision | string |  | Seller's decision for the return request, available values: - APPROVE_REFUND: seller approve  refund request - APPROVE_RETURN: seller approve return request - APPROVE_RECEIVED_PACKAGE: seller approve received package - APPROVE_REPLACEMENT: seller approve replacement request - ISSUE_REPLACEMENT_REFUND: seller decline the replacement request and directly refund to buyer. - OFFER_PARTIAL_REFUND: seller offer partial refund. Partial refund no need buyer to return the product. If buyer accept partial refund, seller only refund the partial amount and buyer keep the item(s). |
| partial_refund | object |  | Partial refund amount to buyer |
| ^amount | string |  | If seller would like to offer partial refund to buyer, should enter the refund amount. Note: Seller's decision for the return request should be OFFER_PARTIAL_REFUND |
| ^currency | string |  | Refund currency |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetReturnRecords

Use this API to get a list of return records.

**Path:** `/return_refund/202309/returns/{return_id}/records`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-return-records-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_id | string | Y | A unique identifier for a TikTok Shop return request. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying the return reason, delimited by commas. Default: en-US Refer to [Locale codes](678e3a47bae28f030a8c7523) for the list of supported locale codes. |
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
| ^records | array<object> |  | A list of return records. |
| ^^create_time | integer |  | The creation time for the return. Unix timestamp. |
| ^^description | string |  | Description of the return record. |
| ^^event | string |  | The type of order event. In this case, it will always be ORDER_RETURN. |
| ^^images | array<object> |  | Images provided by the seller or buyer. You can use the role field to differentiate whether the images are from the seller or buyer. |
| ^^^height | integer |  | The height of image. Unit: px |
| ^^^url | string |  | URL of the image. |
| ^^^width | integer |  | The width of image. Unit: px |
| ^^note | string |  | A note provided by the seller or buyer. You can use the role field to differentiate whether the note is from the seller or buyer. |
| ^^reason_text | string |  | The corresponding text for a return reason, localized based on the locale input parameter. |
| ^^role | string |  | The role that initiated the order return request. Possible values: - BUYER - SELLER - OPERATOR: If the order is canceled by the customer service agent manually, then the cancel initiator will be 'OPERATOR'. - SYSTEM: If the order is automatically canceled due to a policy reason, then the cancel initiator will be 'SYSTEM'. |
| ^^videos | array<object> |  | Videos uploaded by the buyer. Only buyers are allowed to upload videos. |
| ^^^cover | string |  | Video thumbnail image. |
| ^^^duration_millis | integer |  | Video duration. Unit: milliseconds |
| ^^^height | integer |  | Video image height. Unit: px |
| ^^^url | string |  | Video URL. |
| ^^^width | integer |  | Video image width. Unit: px |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RejectReturn

Use this API to reject a buyer's return or refund request.

**Path:** `/return_refund/202309/returns/{return_id}/reject`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/reject-return-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_id | string | Y | The identifier of a specific return request. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotency_key | string |  | The idempotency key is a unique value generated by the client which the server uses to recognize the same request. How you create unique keys is up to you, but we suggest using UUIDs, or another random string with enough entropy to avoid collisions. Idempotency keys can be up to 255 characters long. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| comment | string |  | Seller's comment on the rejection decision. This is where a seller will provide more information about rejecting the request. |
| decision | string |  | Return decision, available values: - `REJECT_REFUND`: Seller rejects the refund request - `REJECT_RETURN`: Seller rejects the return request - `REJECT_RECEIVED_PACKAGE`: Seller rejects the received package - `REJECT_REPLACEMENT`: Seller rejects the replacement request |
| images | array<object> |  | List of images provided by the seller to support their decision to reject the return request. |
| ^height | integer |  | Image height Units: px |
| ^image_id | string |  | Image URI obtained from the [Upload Product Image](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) API. |
| ^mime_type | string |  | MIME type. |
| ^width | integer |  | Image width Units: px |
| reject_reason | string |  | Seller's reason to reject buyer's return request. Please use the [Get Reject Reasons](https://partner.tiktokshop.com/docv2/page/650ab658defece02be706f98) endpoint to obtain a list of rejection reasons. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadShippingDocumentAndTrackingInfo

Use this API to upload return shipping documents, tracking numbers, and carriers for buyers.

**Path:** `/return_refund/202405/returns/shipping_documents`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-shipping-document-and-tracking-info-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_ids | array<string> | Y | The identifier of a specific return. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_provider_id | string |  | The return shipping provider ID provided by the seller to the buyer. |
| return_qr_code | file |  | Return QR code. |
| return_shipping_label | file |  | Return shipping label. |
| tracking_number | string |  | The return shipping tracking number provided by the seller to the buyer. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAftersaleEligibility

Use this API to check eligible aftersale solutions for an order, including whether the seller or buyer can initiate a refund, return, or cancel a specific order.

**Path:** `/return_refund/202512/orders/{order_id}/aftersale_eligibility`
**Method:** `GET`
**Version:** 202512
**Docs:** https://partner.tiktokshop.com/docv2/page/get-aftersale-eligibility-202512

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The unique identifier for a TikTok Shop order. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| initiate_aftersale_user | string |  | The type of user you would like to check aftersale options for. Default: SELLER Possible values: - SELLER - BUYER |
| request_types | array<string> |  | Which request types you want to query. -CANCEL -REFUND -RETURN_AND_REFUND |
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
| ^sku_eligibility | array<object> |  | The eligible aftersale options for a given SKU. |
| ^^line_item_eligibility | array<object> |  | The eligible aftersale options based on order line item. |
| ^^^available_reason_names | array<string> |  | The reason used to initiate a reqeust. |
| ^^^eligible | boolean |  | Use this field to recognize whether an item is eligible for an aftersale request: - TRUE - FALSE |
| ^^^ineligible_code | integer |  | The reason code for an ineligible aftersale request. |
| ^^^ineligible_reason | string |  | The reason for an ineligible aftersale request. |
| ^^^order_line_items_ids | array<string> |  | IDs of order line items. |
| ^^^request_type | string |  | Aftersale request type. Possible values: - CANCEL - RETURN - RETURN_AND_REFUND |
| ^^sku_id | string |  | SKU ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
