# TikTok Shop API — affiliate_creator

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 29 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202405, 202407, 202409, 202410, 202412, 202501, 202504, 202505, 202508, 202509, 202511, 202512, 202601

---

## CreatorSearchOpenCollaborationProduct

This API is used to search the information of products with open collaboration by category, commission rate, and keywords. It will return all products on the TikTok Shop Affiliate Product Marketplace that are in an open collaboration.
Creators can only search for open collaboration within the regions they are registered in the affiliate.

**Path:** `/affiliate_creator/202405/open_collaborations/products/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-search-open-collaboration-product-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 20. |
| sort_field | string |  | The returned results are sorted by the specified field. Possible values: - commission_rate - product_sales_price - commission - units_sold Specify the sort order using the `sort_order` parameter. |
| sort_order | string |  | The sort order for the objects in the response. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category | object |  | Restricts the products in the search results to those that are associated with the expressed product category. |
| ^id | string |  | The category identifier. Note that only first-level categories are supported. |
| commission_rate_range | object |  | The commission rate of the searched product needs to be limited within this range. |
| ^rate_ge | integer |  | The commission rate must be greater than this value in order to be included in the search results. The commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| ^rate_lt | integer |  | The commission rate must be less than this value in order to be included in the search results. The commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| sales_price_range | object |  | Restricts the products in the search results to those with prices greater than or equal to the expressed minimum price and less than the expressed maximum price. |
| ^amount_ge | string |  | The product price must be greater than this value in order to be included in the search results. The value must be greater than `0`. |
| ^amount_lt | string |  | The product price must be greater than this value in order to be included in the search results. The value must be greater than `0`. No upper bound is set if this property is not included. |
| title_keywords | array<string> |  | A list of product keywords for searching. Product titles, or names, are loosely matched. Keywords in the list form a query and the resulting set of matching product names is based on the conjunctive operator `AND` between each keyword. For example, the keyword list `["Men", "Fashion"]` creates a query `"Men" AND "Fashion"` and the resulting set of matching product names contains the loosely matched conjuction of "Men" and "Fashion" such as "Male Fashionable". Maximum length of the list is 20 keywords. Maximum keyword string length is 255 characters. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^products | array<object> |  | A list of products. |
| ^^category_chains | array<object> |  | A list of categories associated with the product. Maximum length of the list is `3` categories. |
| ^^^id | string |  | The category identifier. |
| ^^^is_leaf | boolean |  | Set to `true` if this category is a leaf node. Set to `false` if not. |
| ^^^local_name | string |  | The name of the product in the category. |
| ^^^parent_id | string |  | The category identifier of the parent category. |
| ^^commission | object |  | Metadata and data associated with the commission rates for the product. |
| ^^^amount | string |  | The commission amount. |
| ^^^currency | string |  | The currency code. |
| ^^^rate | integer |  | The commission rate in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`.  The range of this value is [100, 8000]. |
| ^^detail_link | string |  | The URL for the product's detail page. |
| ^^has_inventory | boolean |  | Set to `true` if there are more than zero units of the product in inventory. Set to `false` if there are zero units in inventory. |
| ^^id | string |  | The product identifier. |
| ^^main_image_url | string |  | The product image URL. |
| ^^original_price | object |  | The original price of the product. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest original price of all SKUs of the product. |
| ^^^minimum_amount | string |  | The lowest original price of all SKUs of the product. |
| ^^sale_region | string |  | The region where the product is offered for sale. |
| ^^sales_price | object |  | Metadata and data associated with the sale price of the product |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest promotion price of all SKUs of this product. |
| ^^^minimum_amount | string |  | The lowest promotion price of all SKUs of this product. |
| ^^shop | object |  | Data and metadata associated with the Seller's TikTok Shop. |
| ^^^name | string |  | The TikTok Shop name. |
| ^^title | string |  | The product name. |
| ^^units_sold | integer |  | Total number of units sold. Units are indexed to SKU. Note that if the creator has not given permission for precise data sharing, this property will not be present. |
| ^total_count | integer |  | Total count of products meeting the search criteria expressed in the request body. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCreatorAffiliateOrders

Search Creator Affiliate Orders
This API allows the partner to retrieve a list of affiliate orders generated by a creator, returning the order ID and the product ID. Using this, the partner can track their affiliate-conversions on behalf of a creator, using the order ID.
For now, this API returns all historical affiliate orders by a creator. We do not provide any filtering mechanisms (based on timestamp) at this time. We will provide this functionality in a future iteration. Thus this API is technically a "Get Affiliate Orders List" at this stage, but it will be improved in the future to be a search based API (with robust filtering).

**Path:** `/affiliate_creator/202405/orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-creator-affiliate-orders-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| version | integer |  | The interface version you want to access |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 50. |

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
| ^next_page_token | string |  | Next page token |
| ^orders | array<object> |  | Order information |
| ^^id | string |  | Main order identifier ID |
| ^^line_items | array<object> |  | Line item info list |
| ^^^id | string |  | Line item ID |
| ^^^product_id | string |  | Product ID in the order. We return the product ID, because within an order, there could be multiple products (one, some, or all) which are affiliate commission earning products. |
| ^total_count | integer |  | Total count of main orders that meet the query criteria. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCreatorProfile

This API gets the creator profile information.

**Path:** `/affiliate_creator/202405/profiles`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-creator-profile-202405

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
| ^avatar | object |  | Data associated with the TikTok creator's profile avatar. |
| ^^height | integer |  | The avatar image height in pixels. |
| ^^url | string |  | The URL for the TikTok creator's avatar image file. |
| ^^width | integer |  | The avatar image width in pixels. |
| ^creator_user_id | string |  | The creator's TikTok user identifier. |
| ^permissions | array<string> |  | A list of product promotion permissions for the creator. The list can include zero or more of the following permissions: - LIVE_STREAM_PERMISSION - SELF_SALE_PERMISSION - ADD_AFFILIATE_PERMISSION |
| ^register_region | string |  | The region in which the creator's TikTok account is registered. |
| ^selection_region | string |  | The regions in which the creator is eligible to promote products in showcases, videos, and live streams. |
| ^seller_type | string |  | If the creator is also also has a TikTok Shop seller account, the seller type of the creator. This is an enumerated type with values: - CROSS_BORDER - LOCAL |
| ^user_type | string |  | The creator's user type. This is an enumerated type with values: - TIKTOK_SHOP_OFFICIAL_ACCOUNT - TIKTOK_MARKETING_ACCOUNT - TIKTOK_SHOP_CREATOR |
| ^username | string |  | The TikTok user name. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShowcaseProducts

This API lists the products in the creator's showcase, paginated by specified page size and iterated through pages by page token for up to 2000 products in the showcase. This API is generally used when a creator would like to view the products in the showcase.  The platform will return the product details in the showcase, as well as the products in the livebag if the creator is live streaming.

**Path:** `/affiliate_creator/202405/showcases/products`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-showcase-products-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-20]. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the next_page_token from a previous response. It is not needed for the first page. |
| origin | string | Y | Set to `LIVE` to indicate the request originates from a Live room. Set to `SHOWCASE` to indicate that the request originates from the Showcase. |

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
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^products | array<object> |  | A list of products. |
| ^^addition | object |  | An object including data about product images. |
| ^^^customized_main_images | array<object> |  | A list of product images. |
| ^^^^heigth | integer |  | The image height in pixels. |
| ^^^^url | string |  | The product's TikTok Shop image URL. |
| ^^^^width | integer |  | The image width in pixels. |
| ^^collaboration | object |  | An object including data about open or target collaboration for the product. |
| ^^^id | string |  | The open or target collaboration identifier. |
| ^^^partner | object |  | The partner information. |
| ^^^^id | string |  | The partner identifier. |
| ^^^^name | string |  | The partner name. |
| ^^^type | string |  | The collaboration type. This an enumerated type with values: 1 - Open Collaboration 2 - Target Collaboration 5 - Partner Campaign 11 - Flat Fee 12 - Collaboration Plus 13 - Affiliate Promotion |
| ^^commission | object |  | An object including data about commissions associated with the product. |
| ^^^rate | integer |  | The commission rate in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. The range of this value is [100, 8000]. |
| ^^^reward_rate | integer |  | The reward commission rate in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. |
| ^^detail_link | string |  | The product detail page URL. |
| ^^id | string |  | The product's product ID |
| ^^main_images | array<object> |  | A list of product images. |
| ^^^heigth | integer |  | The image height in pixels. |
| ^^^url | string |  | The product's TikTok Shop image URL. |
| ^^^width | integer |  | The image width in pixels. |
| ^^price | object |  | An object including data about the product price. |
| ^^^original_price | object |  | The original price of the product. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest original price for the product. |
| ^^^^minimum_amount | string |  | The lowest original price for the product. |
| ^^^platform_discount_price | object |  | An object including data about the product platform discount price. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest product platform discount price. |
| ^^^^minimum_amount | string |  | The lowest product platform discount price. |
| ^^^seller_discount_price | object |  | An object including data about the product discount price. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest discount price. |
| ^^^^minimum_amount | string |  | The lowest discount price. |
| ^^sale_regions | array<string> |  | A list of regions in which the product is offered for sale. |
| ^^shop | object |  | Data and metadata associated with the Seller's TikTok Shop. |
| ^^^name | string |  | The TikTok Shop name. |
| ^^source | string |  | The product source. This is an enumerated type with values: - THIRD_PARTY - AFFILIATE - TIKTOK_STORE |
| ^^status | object |  | An object including product status information. |
| ^^^added_status | string |  | The product showcase status. This is an enumerated type with values: - NOT_ADDED - ADDED - REJECTED |
| ^^^inventory_status | string |  | The product inventory status. This an enumerated type with values: - IN_STOCK - SOLD_OUT |
| ^^^is_hidden | boolean |  | Set to `false` if the product is visible in the showcase. Set to `true` if the product is hidden from the showcase. |
| ^^^review_status | string |  | The product review status. This is an enumerated type with values: - APPROVED - CHANGES_UNDER_REVIEW - UNAVAILABLE - ZERO_COMMISSION |
| ^^third_party_link | string |  | The off-TikTok Shop product detail page URL. |
| ^^title | string |  | The product's display title. |
| ^total_count | integer |  | Total count of products in the response. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## AddShowcaseProducts

This API adds the products to the creator's showcase. The platform will return the add status of the products, and error code and error message if the deletion fails.

**Path:** `/affiliate_creator/202405/showcases/products/add`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/add-showcase-products-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| add_type | string |  | Specifies how products are added to the showcase. This an enumerated type with values: - PRODUCT_ID - PRODUCT_LINK |
| product_ids | array<string> |  | A list of product identifiers included if `add_type` is set to `PRODUCT_ID`. The products associated with the identifiers are added to the showcase. Maximum length of the list is 20 product identifiers. |
| product_link | string |  | A list of product URLs included if `add_type` is set to `PRODUCT_LINK`. The products associated with the URLs are added to the showcase. Maximum length of the list is 20 product URLs. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | A list of product showcase addition errors. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | Additional detail about the product showcase addition error. |
| ^^^product_id | string |  | The product identifier. |
| ^^message | string |  | A human-readable error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCreatorTargetCollaborations

This API is used to search for creator's target collaborations and the products within these target collaborations.

**Path:** `/affiliate_creator/202405/target_collaborations/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-creator-target-collaborations-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the next_page_token from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [0-100]. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Target collaborations in the response are restricted to the expressed name. |
| keyword_type | string |  | Target collaborations in the response are restricted to the the expressed type. This is an enumerated wtype with values: - TARGET_COLLABORATIONS_ID - TARGET_COLLABORATIONS_NAME `TARGET_COLLABORATIONS_ID` returns target collaborations with state set to `LIVE`, `EXPIRED`, `DELETED`, and `ENDED`. `TARGET_COLLABORATIONS_NAME` returns target collaborations with state set to `LIVE` only. |
| shop_id | string |  | The TikTok Shop identifier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^target_collaborations | array<object> |  | A list of target collaboration objects. |
| ^^id | string |  | The target collaboration identifier. |
| ^^name | string |  | The target collaboration name. |
| ^^products | array<object> |  | A list of products associated with the target collaboration. |
| ^^^commission | object |  | Metadata and data associated with the target collaboration. |
| ^^^^amount | string |  | The total amount paid in commission paid for this this product. |
| ^^^^currency | string |  | The currency code. |
| ^^^^rate | integer |  | The commission rate for the target collaboration in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. |
| ^^^id | string |  | The product identifier. |
| ^^^main_image_url | string |  | The product image URL in the TikTok Shop. |
| ^^^title | string |  | The product name. |
| ^^status | string |  | The target collaboration state. This is an enumerated type with values: - LIVE - EXPIRED - DELETED - ENDED |
| ^total_count | integer |  | The total number of target collaboration groups in the response. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GenerateAffiliateSharingLink

Use externally input material id, distributor customized tags, promotion channel and other needed parameters to generate affiliate share link, which contains chain keys.

**Path:** `/affiliate_creator/202407/affiliate_sharing_links/generate_batch`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/generate-affiliate-sharing-link-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| channel | string |  | The customized promotion channel |
| material | object |  | The material used to generate links. |
| ^id | string |  | The ID of product/campiagn/showcase that our partner wants to promote. We use this material id to generate the sharing link |
| ^type | string |  | For the mvp version, we only use product type, but we have 3 types in total: PRODUCT CAMPAIGN SHOWCASE |
| tags | array<string> |  | The parameter provided for creator to record his own tracking info |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^affiliate_sharing_links | array<object> |  | Generated affiliate links for each Tag |
| ^^affiliate_sharing_link | string |  | Affiliate short link, use www.tiktok.com as domain |
| ^^tag | string |  | one of tags in request |
| ^errors | array<object> |  | Specific error(if have) for each tagString(if have) |
| ^^code | integer |  | Failed status code--only for partial fail |
| ^^detail | object |  | detail failed message for each failed tag |
| ^^^fail_reason | string |  | Detail fail reason for specific tag |
| ^^^tag | string |  | Same as description in request params |
| ^^message | string |  | Failed status msg--only for partial fail |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorSearchSampleApplicationFulfillments

You, the creator, can use this API to query the fulfillment status for the received sample applications.

**Path:** `/affiliate_creator/202409/sample_applications/fulfillments/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-search-sample-application-fulfillments-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sort_order | string |  | The sort order for the field specified in the sort_field parameter. Default: ASC Possible values: ASC: Ascending order DESC: Descending order |
| sort_field | string |  | Some sorting fields are as follows: - expired_time: sort by left time to fulfill. - create_time: sort by fulfillment content create time. Default value  is expired_time. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| fulfillment_statuses | array<string> |  | A list of fulfillment statuses. The response is filtered to include sample fulfillments with the fulfillment_status field set to one of the specified values.  The possible values are: - PENDING: The creator has not yet fulfilled the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator is exempt from the fulfillment obligation. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^fulfillments | array<object> |  | Creator fulfillment contents. |
| ^^application_id | string |  | The sample application identifier. |
| ^^bound_product_status | string |  | The marketing status of the product associated with the fulfillment order. This is an enumerated type with values: - UNKNOWN: The marketing status of the product is unknown. - LIVE: The product is available for fulfillment. - OUT_OF_STOCK: The product is out of stock and cannot be fulfilled. - SELLER_DEACTIVATE: The product has been deactivated by the seller. - PLATFORM_DEACTIVATE: The product has been deactivated by the platform. - NO_PLAN: There is no valid plan available for the creator to market the product. - PERMANENT_DELETED: The product has been permanently deleted and is no longer available. |
| ^^expiration_time | integer |  | Fulfillment deadline timestamp. Usually the value is  `{you_receiving_sample_time} + 14Days`. But if you apply for fulfillment suspension, the value is `{you_receiving_sample_time} + 14Days + total_suspend_duration`. |
| ^^id | string |  | The fulfillment identifier. |
| ^^product_id | string |  | The product identifier. |
| ^^sample_application_type | string |  | The type of the sample application. This is an enumerated type with values: - FREE_SAMPLE - SAMPLE_COUPON - SAMPLE_CAMPAIGN - PLATFORM_FREE_SAMPLE |
| ^^shop_id | string |  | The TikTok Shop identifier. |
| ^^status | string |  | The fulfillment status.This is an enumerated type with values: - PENDING: The creator has not yet fulfilled the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline.SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator is exempt from the fulfillment obligation. |
| ^^total_suspend_duration | integer |  | The duration you applied for fulfillment suspension in seconds. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveShowcaseProducts

This API removes the products in the creator's showcase.
The platform will return error code and error message if the deletion fails.

**Path:** `/affiliate_creator/202409/showcases/products`
**Method:** `DELETE`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-showcase-products-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to remove from the creator's showcase. The maximum number of products to delete at once is 200. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^code | integer |  | The success or failure status code returned in API response. |
| ^message | string |  | The success or failure messages are returned in API response. Reasons of failure will be described in the message. |
| ^request_id | string |  | Every request generates a unique request_id for logging purposes. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## TopShowcaseProducts

Use this API to move products to the top in a creator's showcase.
The platform will return the error code and error message if the pinning operation fails.

**Path:** `/affiliate_creator/202409/showcases/products/top`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/top-showcase-products-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to move to the top in a creator's showcase. If multiple products are provided, they will display according to the order passed in this parameter. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^code | integer |  | The success or failure status code returned in API response. |
| ^message | string |  | The success or failure messages are returned in API response. Reasons of failure will be described in the message. |
| ^request_id | string |  | Every request generates a unique request_id for logging purposes. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCreatorAffiliateOrders

Search Creator Affiliate Orders
This API allows the partner to retrieve a list of affiliate orders generated by a creator, returning the order ID and the product ID. Using this, the partner can track their affiliate-conversions on behalf of a creator, using the order ID.

**Path:** `/affiliate_creator/202410/orders/search`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/search-creator-affiliate-orders-202410

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Default: 20 Valid Range: [1-100] |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | Filter orders to show only those that are created on or after the specified date and time. Unix timestamp. Note: `create_time_ge` and `create_time_lt` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_lt` is empty, `create_time_lt` will default to the current time. - If `create_time_lt` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_lt | integer |  | Filter orders to show only those that are created before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^orders | array<object> |  | The order resource. |
| ^^create_time | integer |  | Time and date of order created, UTC+0 timing |
| ^^delivery_time | integer |  | Time and date order delivered, UTC+0 timing |
| ^^id | string |  | The order identifier. |
| ^^skus | array<object> |  | A list of SKUs associated with the order. |
| ^^^actual_bonus_commission | object |  | An object representing the actual bonus commission, calculated by multiplying the actual commission base by the commission bonus rate. |
| ^^^^amount | string |  | The actual bonus commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_commission | object |  | Represents the final earnings of this sku, calculated by multiplying the actual commission base by the total commission rate, and then deducting the taxes or revenue sharing with the agency amount. |
| ^^^^amount | string |  | The actual commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_commission_base | object |  | An object representing the actual commission base, calculated by multiplying the product sale price by the number of products sold, subtracting returned and refunded orders. |
| ^^^^amount | string |  | The value of the actual commission base. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_creator_commission_reward_fee | object |  | Actual creator commission reward fee. |
| ^^^^amount | string |  | The actual fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_shop_ads_commission | object |  | An object representing the actual shop ads commission, calculated by multiplying the commission base by the shop_ads_commission_rate. |
| ^^^^amount | string |  | The actual shop ads commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^campaign_id | string |  | The campaign identifier associated with the order. |
| ^^^commission_bonus_rate | integer |  | The commission bonus rate associated with the collaboration. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^commission_model | string |  | Determine order commission be calculated based on fixed commission model or tiering model |
| ^^^commission_rate | integer |  | The total commission rate of this SKU, equal to the sum of standard commission rate + shop ads commission rate + bonus rate + reward rate. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^commission_tier_setting | string |  | Between Seller & Creator percentagecommission. When tiering commission model applied, will return each tier's commission rate seller set. |
| ^^^content_id | string |  | The content identifier for the creator content through which the order was created. |
| ^^^content_type | string |  | The content format of the creator content through which the order was created. Possible values: - SHOP - VIDEO - LIVE - PRE_LIVE - PROMOTION_PAGE - LINKSHARE |
| ^^^creator_commission_reward_rate | integer |  | The commission reward rate affiliate partners allocate to creators |
| ^^^estimated_bonus_commission | object |  | An object representing the estimated bonus commission, calculated by multiplying the estimated commission base by the commission bonus rate. |
| ^^^^amount | string |  | The estimated bonus commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_commission | object |  | The estimated creator commission, calculated by multiplying the product sales price by the total number of products at the time of order creation. |
| ^^^^amount | string |  | The estimated commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_commission_base | object |  | An object representing the estimated base commission at the time of order creation. |
| ^^^^amount | string |  | The estimated commission base amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_creator_commission_reward_fee | object |  | Estimated creator commission reward fee. |
| ^^^^amount | string |  | The estimated fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_shop_ads_commission | object |  | An object representing the estimated shop ads commission, calculated by multiplying the estimated commission base by the shop_ads_commission_rate |
| ^^^^amount | string |  | The estimated shop ads commission rate. |
| ^^^^currency | string |  | The currency code. |
| ^^^id | string |  | The SKU identifier. |
| ^^^open_collaboration_id | string |  | The open collaboration identifier associated with the order. |
| ^^^price | object |  | An object representing the localized price of the product. |
| ^^^^amount | string |  | The value of the price associated with the product. |
| ^^^^currency | string |  | The currency code of the price associated with the product. |
| ^^^product_id | string |  | The product identifier. |
| ^^^product_name | string |  | The product name in the TikTok Shop. |
| ^^^quantity | integer |  | The total number of SKUs per order, calculated by aggregating the number of ordered product SKUs associated with the order. |
| ^^^refunded_quantity | integer |  | The total number of refunded SKUs associated with the order. |
| ^^^returned_quantity | integer |  | The total number of returned SKUs associated with the order. |
| ^^^shop_ads_commission_rate | integer |  | The commission rate received by a creator for a sale associated with a specific piece of content. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^shop_name | string |  | The name of the TIkTok Shop in which the product is offered for sale. |
| ^^^tag | string |  | A field for storing user-defined metadata for tracking purposes. |
| ^^^target_collaboration_id | string |  | The target collaboration identifier associated with the order. |
| ^^status | string |  | The current status of the order. Possible options are: - UNSPECIFIED: The status of the order is undefined. It might be updated later. - AWAITING PAYMENT：The order hasn't been paid yet, only estimated commission is available - To-SETTLE：The order is waiting for settlement, only estimated commission is available - SETTLED: The commission of the order is already settled. - REFUNDED: The order has been returned/refunded/canceled by the buyer, and no commission will be settled. - FROZEN: Possible fraud has been detected regarding the order. The commission will be unfrozen after the fraud is resolved. |
| ^total_count | integer |  | Total count of orders in the response. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCreatorSampleApplications

Get sample application list of creator.

**Path:** `/affiliate_creator/202412/sample_applications/search`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/search-creator-sample-applications-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer |  | The value of "page_size" must be greater than 0 and less than or equal to 50. Default 20 |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| application_statuses | array<string> |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: Open collaboration has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_ COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. This field allows for tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Page token to query next page orders, last page is empty string. |
| ^sample_applications | array<object> |  | The sample application information. |
| ^^activity_id | string |  | The sample activity identifier id(only for sample activity). |
| ^^creator_fulfillment | object |  | Fulfillment info for this sample application. |
| ^^^bound_product_status | string |  | Represents the marketing status of a product associated with a fulfillment order. It indicates whether the product is available for marketing and fulfillment. The possible values are: - UNKNOWN: The marketing status of the product is unknown. - LIVE: The product is available and can be used for fulfillment. - OUT_OF_STOCK: The product is out of stock and cannot be fulfilled. - SELLER_DEACTIVATE: The product has been deactivated by the seller. - PLATFORM_DEACTIVATE: The product has been deactivated by the platform. - NO_PLAN: There is no valid plan available for the creator to market the product. - PERMANENT_DELETED: The product has been permanently deleted and is no longer available. This field helps sellers and creators understand the current status of products associated with fulfillment orders, ensuring that all parties are aware of the availability and marketing status of the products involved in sample applications and collaborations. |
| ^^^expiration_time | integer |  | Fulfillment deadline timestamp, in seconds. |
| ^^^id | string |  | Fulfillment ID. |
| ^^^status | string |  | Fulfillment status, It indicates the current status of the fulfillment process. The possible values are: - PENDING: The creator is yet to fulfill the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator has been exempted from the fulfillment obligation. |
| ^^^total_suspend_duration | integer |  | Total suspension duration for fulfillment, in seconds. |
| ^^id | string |  | The unique id of sample application. |
| ^^main_order_id | string |  | The sample order is generated after the sample application is approved by seller. |
| ^^sample_product | object |  | The sample product information. |
| ^^^id | string |  | The product identifier. |
| ^^^sku_id | string |  | The SKU identifier. |
| ^^^sku_sale_property_value_names | array<string> |  | The SKU property value name. |
| ^^status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - FULFILLMENT_SUSPEND: the application fulfillment was paused due to the product status being unpromotable. - DEL_OPEN_COLLAB: Open collaboration has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_ COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. - TO_BE_POST: the creator has not posted videos/lives for this sample - POST_IN_REVIEW: the creator has posted videos/lives which have not satisfied fulfillment rules. - POST_FAILED: the creator has posted videos/lives and deleted them before completing sample fulfillment. - CANCELED: this application(order) has been canceled. This field allows tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCreatorSampleApplicationDetail

Get the sample detail of specified sample application.

**Path:** `/affiliate_creator/202412/sample_applications/single_query`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-creator-sample-application-detail-202412

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| application_id | string |  | Free sample application ID, required when application type is "FREE_SAMPLE". |
| application_type | string |  | The type of creator sample application. - FREE_SAMPLE : free sample supplied by seller which creator can apply for by themselves from product detail page. - SAMPLE_COUPON: creator claimed sample coupon (a type of coupon) and used it to place orders at a discount price. - SAMPLE_CAMPAIGN: activity organized by the platform. Creators can participate in this activity to obtain sample products provided by the platform for free. |
| main_order_id | string |  | The real main order identifier, required when application  is "SAMPLE_COUPON"  or "SAMPLE_CAMPAIGN" or "REFUNDABLE_SAMPLE". |
| product_id | string |  | The product identifier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^sample_application | object |  | The sample application information. |
| ^^activity_id | string |  | The sample activity identifier id( only for sample campaign). |
| ^^create_time | integer |  | Sample application create time in seconds. |
| ^^creator_fulfillment | object |  | Fulfillment info for this sample application. |
| ^^^expiration_time | integer |  | Fulfillment deadline timestamp, in seconds. |
| ^^^id | string |  | Fulfillment identifier. |
| ^^^status | string |  | Fulfillment status, It indicates the current status of the fulfillment process. The possible values are: - PENDING: The creator is yet to fulfill the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator has been exempted from the fulfillment obligation. |
| ^^^total_suspend_duration | integer |  | Total suspension duration for fulfillment, in seconds. |
| ^^id | string |  | Sample application identifier. |
| ^^main_order_id | string |  | The sample order is generated after the sample application is approved by seller. |
| ^^sample_product | object |  | The sample product information. |
| ^^^id | string |  | The product identifier. |
| ^^^sku_id | string |  | The SKU identifier. |
| ^^^sku_sale_property_value_names | array<string> |  | Sku property name list for this sku id. |
| ^^status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_ COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. This field allows for tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |
| ^^type | string |  | The type of creator sample application. - FREE_SAMPLE : free sample supplied by seller which creator can apply by themselves from pdp page. - SAMPLE_COUPON: creator claimed sample coupon (a type of coupon) and used it to purchase orders at a discount price. - SAMPLE_CAMPAIGN: activity organized by the platform. Creators can participate in this activity to obtain sample products provided by the platform for free. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCreatorApplicableSampleLabel

Check if a creator can apply for a sample of a specific product.

**Path:** `/affiliate_creator/202412/samples/labels`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-creator-applicable-sample-label-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The TikTok Shop product identifier. |

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
| ^label | object |  | Creator applicable sample label information. |
| ^^application_id | string |  | Sample Application ID. only appear when the creator has already applied this product. |
| ^^can_apply | boolean |  | Creator can apply this application or not. |
| ^^reach_limit | boolean |  | If the creator has reached the sample application upper limit. |
| ^^sample_product | object |  | The sample product information. |
| ^^^sample_sku_list | array<object> |  | The sample product SKU information. |
| ^^^^id | string |  | The SKU identifier. |
| ^^^^is_available | boolean |  | If this SKU is available. |
| ^^^^price | object |  | SKU price information. |
| ^^^^sale_properties | array<object> |  | The SKU property information. |
| ^^^^sale_property_value_ids | string |  | The combination of SKU properties for this SKU. |
| ^^^^unavailable_reason | string |  | The reason why the SKU is unavailable: - IS_PREORDER : this product is a preorder product which does not support free sample - IS_GIFT: this product is a gift product which does not support free sample - OUT_OF_STOCK: product sold out - EXCEED_CB_PRICE_THRESHOLD: - ALREADY_APPLYED: creator has already applied this SKU. |
| ^^status | string |  | Status to describe if the creator has already applied this product as a free sample. - TO_APPLY: creator has not applied this product as a free sample. - ONGOING: creator applied this product as a free sample while he/she has not finished sample fulfillment. - COMPLETE: creator applied this product as a free sample and finished sample fulfillment. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GenerateAffiliateSharingLink

Use externally input material id, distributor customized tags, promotion channel and other needed parameters to generate affiliate share link, which contains chain keys.

**Path:** `/affiliate_creator/202501/affiliate_sharing_links/generate_batch`
**Method:** `POST`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/generate-affiliate-sharing-link-202501

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| channel | string |  | The customized promotion channel |
| material | object |  | The material used to generate links. |
| ^campaign_url | string |  | The original url of the campaign page, which will be returned after verified and concatenated with chainkey and other event tracking parameters. |
| ^id | string |  | The ID of product/campiagn/showcase that our partner wants to promote. We use this material id to generate the sharing link |
| ^type | string |  | You can use the following enumerations: - PRODUCT - CAMPAIGN - SHOWCASE When `type==PRODUCT`, use pid as `id`; when `type==CAMPAIGN`, use campaign ID as `id`, and pass in `campaign_url`; when `type==SHOWCASE`, no need to pass in `id` and `campaign_url`. |
| tags | array<string> |  | The parameter provided for creator to record his own tracking info |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^affiliate_sharing_links | array<object> |  | Generated affiliate links for each Tag |
| ^^affiliate_sharing_link | string |  | Affiliate short link, use www.tiktok.com as domain |
| ^^tag | string |  | one of tags in request |
| ^errors | array<object> |  | Specific error(if have) for each tagString(if have) |
| ^^code | integer |  | Failed status code--only for partial fail |
| ^^detail | object |  | detail failed message for each failed tag |
| ^^^fail_reason | string |  | Detail fail reason for specific tag |
| ^^^tag | string |  | Same as description in request params |
| ^^message | string |  | Failed status msg--only for partial fail |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorSelectAffiliateProduct

As a creator, you can use this API to filter products using various conditions.
When no filter parameter is given, the API will return affiliate products recommended by algorithm with no specific limits.

**Path:** `/affiliate_creator/202501/selection/products/search`
**Method:** `POST`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-select-affiliate-product-202501

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer |  | The value of "page_size" must be greater than 0 and less than or equal to 50. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| filter_params | object |  | The parameters for filtering the products searched |
| ^category_ids | array<string> |  | The categories' unique IDs of the searched product needed to be limited in this param Prerequisites: - The length of category_ids is less than 1000 |
| ^commission_rate_range | object |  | The commission rate range of the searched product needed to be limited |
| ^^rate_ge | integer |  | The minimum value of commission rate in the search scope Prerequisites: - The value of must be greater than 100 or equal to 100, and less than 8000 or equal to 8000. - This value equals the actual commission rate multiplied by 100. For example: 1200 means the actual commission rate is 12% - Currently, the value will be automatically truncated to its floor hundred. For instance, 1239 will be truncated to 1200 |
| ^^rate_le | integer |  | The maximum value of commission rate in the search range Prerequisites: - The value of must be greater than 100 or equal to 100, and less than 8000 or equal to 8000. - This value equals the actual commission rate multiplied by 100. For example: 1200 means the actual commission rate is 12% - Currently, the value will be automatically truncated to its floor hundred. For instance, 1239 will be truncated to 1200 |
| ^pool_ids | array<string> |  | The list of product pool IDs. A product pool is edited by the operations, corresponding to a bunch of product IDs. The product pool IDs will be provided by the operations offline. Notice: Currently, if no title_keyword is given, only 1 pool_id is supported. So in this situation, the length of this field should be 1, otherwise we will only use the first pool. |
| ^price_range | object |  | The sale price range of the searched product needed to be limited |
| ^^price_ge | string |  | The minimum price of the searched product needed to be limited The unit is the local currency of the creator's marketing country. Prerequisites: - The value must be greater than or equal to zero - If no value is given, it means 0 - Currently, the value needs to be an integer, otherwise we will automatically truncate it to its floor integer. For instance, 12.54 will be truncated to 12 |
| ^^price_le | string |  | The maximum price of the searched product needed to be limited The unit is the local currency of the creator's marketing country. Prerequisites: - The value must be greater than or equal to zero - If no value is given, it means 0 - Currently, the value needs to be an integer, otherwise we will automatically truncate it to its floor integer. For instance, 12.54 will be truncated to 12 |
| ^product_ids | array<string> |  | The exact product IDs the search needs. If this field is not empty, we will ignore other fields Prereqsites: The length of product_ids should be less or equal than 50 |
| ^shop_rating_range | object |  | The shop rating range of the searched product needed to be limited |
| ^^rating_ge | integer |  | The minimum value of shop rating for the search. Prerequisites: - The value of must be greater than or equal to 0, and less than 50 or equal to 50. - This value equals the actual shop rating multiplied by 10. For example, 35 means the actual shop rating is 3.5 |
| ^^rating_le | integer |  | The maximum value of shop rating for the search. Prerequisites: - The value of must be greater than or equal to 0, and less than 50 or equal to 50. - This value equals the actual shop rating multiplied by 10. For example, 35 means the actual shop rating is 3.5 |
| ^sold_quantity_range | object |  | The sales volume range of the searched product needed to be limited |
| ^^quantity_ge | integer |  | The minimum value of product sold quantity. Prerequisites: - The value must be greater than or equal to 0 - If no value is given, it means 0 |
| ^^quantity_le | integer |  | The maximum value of product sold quantity. Prerequisites: - The value must be greater than or equal to 0 - If no value or 0 is given, it means infinity |
| ^title_keyword | string |  | The keyword of product name, which will be used for fuzzy search on products. There is no limit to the language of product name Prerequisites: - A keyword must have at least 1 character and no more than 255 characters. |
| sort_params | object |  | The params for sorting the products searched |
| ^sort_type | string |  | The type of sort we applied to the result. Currently, there are 6 types: 1. "RECOMMENDED" Follow the algorithm recommended order 2. "BEST_SELLERS" Sort by historical sold numbers from high to low 3. "LOW_PRICE" Sort by price from low to high 4. "HIGH_PRICE" Sort by price from high to low 5. "NEWLY_RELEASED" Sort by the product edition time from late to early 6. "HIGH_COMMISSION_RATE" Sort by commission rate from high to low If no value is given, we will follow algorithm recommended order, namely the same as "RECOMMENDED" |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Next page token |
| ^products | array<object> |  | The searched products |
| ^^brand_name | string |  | The product's brand name |
| ^^commission | object |  | The commission info, including the amount and rate of the product |
| ^^^amount | string |  | The commission amount of the product multiplied by 1000, which is equal to floor_price * commission_rate * 1000 |
| ^^^rate | integer |  | The commission rate of the product multiplied by 10000, eg. 1500 means 15% |
| ^^id | string |  | The product's unique id |
| ^^main_image_url | string |  | The product's cover image url |
| ^^market_performance | object |  | The market performance summary of the product |
| ^^^historical_sold_quantity | integer |  | The total number of products sold in history |
| ^^price | object |  | The price info of the product |
| ^^^ceiling_price | string |  | The maximum price of the product over all skus |
| ^^^currency | string |  | The three-letter code of the price currency, obeying the rules in ISO 4217 |
| ^^^floor_price | string |  | The minimum price of the product over all skus |
| ^^review | object |  | The review of the product |
| ^^^count | integer |  | The count of reviews |
| ^^^overall_score | string |  | The average score of the product, the range is (0,5] |
| ^^shop | object |  | The profile of shop to which the product belongs |
| ^^^logo_url | string |  | The logo URL of the shop |
| ^^^name | string |  | The name of the shop |
| ^^^rating | string |  | The rating of the shop, the range is (0,5] |
| ^^stock | object |  | The stock info of the product |
| ^^^quantity | integer |  | The detailed stock quantity of the product |
| ^^title | string |  | The product's name |
| ^total_count | integer |  | The total count of products that meet input filtering conditions. In the situation that no title_keyword is given, this field will be 0 |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorGeneratePublisherLink

You can use this API to generate material sharing links for a specific publisher. After that, you can share the link with the publisher. Right now, the material type must be `PRODUCT`.
Please ensure that the material is included in the campaign by using [Generate Multi Affiliate Partner Campaign Product Links](generate-multi-affiliate-partner-campaign-product-links).

**Path:** `/affiliate_creator/202504/affiliate_sharing_links/publisher/{publisher_id}/generate_batch`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-generate-publisher-link-202504

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| publisher_id | string | Y | The publisher id in partner's system |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string |  | If a creator adds products from a campaign, please include the campaign ID. The campaign ID can be found in the Affiliate Center or retrieved using the Get Affiliate Partner Campaign List API. |
| link_type | string |  | Default value is empty. - For Tokopedia agencies, you may pass `TOKO` to return the Tokopedia product URL. Otherwise, the TikTok Shop product URL will be returned. |
| material | object |  | The entities for which the sharing links are generated. |
| ^ids | array<string> |  | The list of material IDs. The max length is 50. |
| ^type | string |  | Right now, the only possible value is `PRODUCT`. When `material_ids==PRODUCT`, use pids for material IDs. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^failed_materials | array<object> |  | The list of materials which failed to generate sharing links for. |
| ^^fail_reason | string |  | Fail reason. |
| ^^material_id | string |  | Material ID. |
| ^sharing_links | array<object> |  | Generated affiliate links for each publisher |
| ^^deep_link | string |  | A product promotion deep link that opens the corresponding TikTok Shop product detail page. Agencies can share this link with collaborated creators, and creators can copy/paste it into a web browser (or share it to users). If a user places an order via this link, the resulting e-commerce order will carry these parameter values for tracking. |
| ^^material_id | integer |  | Material ID. |
| ^^one_link | string |  | A product promotion one-link that opens the corresponding TikTok Shop product detail page. Agencies can share this link with collaborated creators, and creators can copy/paste it into a web browser (or share it to users). If a user places an order via this link, the resulting e-commerce order will carry these parameter values for tracking. If the user does not have TikTok installed on their phone, they will be redirected to the app store to install TikTok. |
| ^^sharing_link | string |  | This is the product promotion link that agencies can share with collaborated publishers. The publishers can post this link at their will. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorGenerateGeneralLink

You can use this API to generate material sharing links for your publishers. After that, you can encapsulate the sharing link with additional information like publisher ID. Right now, the material type must be `PRODUCT`.
Please ensure that the material is included in the campaign by using [Generate Multi Affiliate Partner Campaign Product Links].

**Path:** `/affiliate_creator/202505/affiliate_sharing_links/general_publishers/generate_batch`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-generate-general-link-202505

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string |  | If a creator adds products from a campaign, please include the campaign ID. The campaign ID can be found in the Affiliate Center or retrieved using the Get Affiliate Partner Campaign List API. |
| link_type | string |  | Default value is empty. - For Tokopedia agencies, you may pass `TOKO` to return the Tokopedia product URL. Otherwise, the TikTok Shop product URL will be returned. |
| material | object |  | The entities for which the sharing links are generated. |
| ^ids | array<string> |  | The list of material IDs. The max length is 50. |
| ^type | string |  | Right now, the only possible value is `PRODUCT`. When `material_ids==PRODUCT`, use pids for material IDs. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^failed_materials | array<object> |  | The list of materials which failed to generate sharing links for. |
| ^^fail_reason | string |  | Fail reason. |
| ^^material_id | string |  | Material ID. |
| ^sharing_links | array<object> |  | The successfully generated sharing links. |
| ^^deep_link | string |  | A product promotion deep link that opens the corresponding TikTok Shop product detail page. Agencies can share this link with collaborated creators, and creators can copy/paste it into a web browser (or share it to users). To enable attribution, append the following query parameteReplace the `o_event_id` value in the `deeplink` URL with a developer-generated unique ID (one per click). Do not perform any URL encoding or decoding on the link. If a user places an order via this link, the resulting e-commerce order will carry these parameter values for tracking. |
| ^^material_id | string |  | Material ID. |
| ^^one_link | string |  | A product promotion one-link that opens the corresponding TikTok Shop product detail page. Agencies can share this link with collaborated creators, and creators can copy/paste it into a web browser (or share it to users). To enable attribution, append the following query parameteReplace the `o_event_id` value in the `deeplink` URL with a developer-generated unique ID (one per click). Do not perform any URL encoding or decoding on the link. If a user places an order via this link, the resulting e-commerce order will carry these parameter values for tracking. If the user does not have TikTok installed on their phone, they will be redirected to the app store to install TikTok. |
| ^^sharing_link | string |  | This is the product promotion link that agencies can share with collaborated creators. Creators can copy/paste this link into the web browser. After you have the links, add the following request parameters and their corresponding values to the end of the link URL. When a user places an order using this link, the resulting e-commerce order will carry these parameters as part of its information: - event_id: Unique event id for each click - publisher_id: The unique publish_id assigned by CJ Nice to have - publisher_name: From CJ publisher profile. - device_type: 1-mobile, 2-desktop. - device_id: The clicks from the same device id can be aggregated as UV. - referrer_src: The URL of the webpage that a user came from before landing on the current share link. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorSearchAffiliateTraceOrders

This API allows the partner to retrieve a list of affiliate orders generated by a creator, returning the order ID and the product ID. Using this, the partner can track their affiliate-conversions on behalf of a creator, using the order ID.

**Path:** `/affiliate_creator/202505/orders/trace/search`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-search-affiliate-trace-orders-202505

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the next_page_token from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Default: 20 Valid Range: [1-100] |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| time_ge | integer |  | Filter orders to include only those with the specified `time_type` timestamp greater than or equal to time_ge and less than time_lt. Unix timestamp. Note: `time_ge` and `time_lt` together constitute the creation time filter condition. |
| time_lt | integer |  | Filter orders to include only those with the specified `time_type` timestamp greater than or equal to time_ge and less than time_lt.Unix timestamp. |
| time_type | string |  | Specifies the type of timestamp to filter the orders by. The query time range (time_ge and time_lt) will be applied to the selected time type. Possible values: - PAY_TIME: Filter based on the order payment time. - DELIVERY_TIME: Filter based on the order delivery/shipment time. - SETTLE_TIME: Filter based on the order settlement time. - CREATE_TIME (default): Filter based on the order creation time. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^orders | array<object> |  | The order resource. |
| ^^create_time | integer |  | Time and date of order created, UTC+0 timing |
| ^^delivery_time | integer |  | Time and date order delivered, UTC+0 timing |
| ^^id | integer |  | The order identifier. |
| ^^skus | array<object> |  | A list of SKUs associated with the order. |
| ^^^actual_bonus_commission | object |  | An object representing the actual bonus commission, calculated by multiplying the actual commission base by the commission bonus rate. |
| ^^^^amount | string |  | The actual bonus commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_commission | object |  | An object representing the actual base commission, calculated by multiplying the actual commission base by the commission rate. |
| ^^^^amount | string |  | The actual commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_commission_base | object |  | An object representing the actual commission base, calculated by multiplying the product sale price by the number of products sold, subtracting returned and refunded orders. |
| ^^^^amount | string |  | The value of the actual commission base. |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_creator_commission_reward_fee | object |  | Actual creator commission reward fee. |
| ^^^^amount | string |  | The actual fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | The currency code. |
| ^^^actual_shop_ads_commission | object |  | An object representing the actual shop ads commission, calculated by multiplying the commission base by the shop_ads_commission_rate. |
| ^^^^amount | string |  | The actual shop ads commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^campaign_id | string |  | The campaign identifier associated with the order. |
| ^^^commission_bonus_rate | integer |  | The commission bonus rate associated with the collaboration. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^commission_rate | integer |  | The commission rate associated with the collaboration. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^content_id | string |  | The content identifier for the creator content through which the order was created. |
| ^^^content_type | string |  | The content format of the creator content through which the order was created. Possible values: - SHOP - VIDEO - LIVE - PRE_LIVE - PROMOTION_PAGE - LINKSHARE |
| ^^^creator_commission_reward_rate | integer |  | The commission reward rate affiliate partners allocate to creators |
| ^^^delivery_time | integer |  | Time and date order delivered, UTC+0 timing |
| ^^^estimated_bonus_commission | object |  | An object representing the estimated bonus commission, calculated by multiplying the estimated commission base by the commission bonus rate. |
| ^^^^amount | string |  | The estimated bonus commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_commission | object |  | The estimated creator commission, calculated by multiplying the product sales price by the total number of products at the time of order creation. |
| ^^^^amount | string |  | The estimated commission amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_commission_base | object |  | An object representing the estimated base commission at the time of order creation. |
| ^^^^amount | string |  | The estimated commission base amount. |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_creator_commission_reward_fee | object |  | Estimated creator commission reward fee. |
| ^^^^amount | string |  | The estimated fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | The currency code. |
| ^^^estimated_shop_ads_commission | object |  | An object representing the estimated shop ads commission, calculated by multiplying the estimated commission base by the shop_ads_commission_rate |
| ^^^^amount | string |  | The estimated shop ads commission rate. |
| ^^^^currency | string |  | The currency code. |
| ^^^id | string |  | The SKU identifier. |
| ^^^price | object |  | An object representing the localized price of the product. |
| ^^^^amount | string |  | The value of the price associated with the product. |
| ^^^^currency | string |  | The currency code of the price associated with the product. |
| ^^^product_id | string |  | The product identifier. |
| ^^^product_name | string |  | The product name in the TikTok Shop. |
| ^^^quantity | integer |  | The total number of SKUs per order, calculated by aggregating the number of ordered product SKUs associated with the order. |
| ^^^refunded_quantity | integer |  | The total number of refunded SKUs associated with the order. |
| ^^^returned_quantity | integer |  | The total number of returned SKUs associated with the order. |
| ^^^shop_ads_commission_rate | integer |  | The commission rate received by a creator for a sale associated with a specific piece of content. Expressed in units of hundredths of a percent formatted as a string. The percent sign % is not included in the string. For example, 3000 represents a 30% commission. |
| ^^^shop_name | string |  | The name of the TIkTok Shop in which the product is offered for sale. |
| ^^^trace | object |  | Extra information for tracing purposes. |
| ^^^^id | string |  | When `trace.type==GENERAL`, the value is {eid} you provided in `sharing_link`; when `trace.type==SPECIFIC`, the value is the same as `publisher_id`. |
| ^^^^type | string |  | For the orders coming from the sharing links for specific publishers, the value is `SPECIFIC`; for the orders coming from the general sharing links, the value is `GENERAL`. |
| ^^status | string |  | The current status of the order. Possible options are: - UNSPECIFIED: The status of the order is undefined. It might be updated later. - ORDERED: The order has been placed, but the commission has not been settled. But an estimated commission is available. - SETTLED: The commission of the order is already settled. - REFUNDED: The order has been returned/refunded/canceled by the buyer, and no commission will be settled. - FROZEN: Possible fraud has been detected regarding the order. The commission will be unfrozen after the fraud is resolved. - DEDUCTED: Additional deduction from your balance account. |
| ^total_count | integer |  | Total count of orders in the response. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PostShoppableVideo

Use this API to post the shoppable video.

**Path:** `/affiliate_creator/202505/videos`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/post-shoppable-video-202505

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_link_info | object |  | Product link information |
| ^product_id | string |  | Use product_id to bind the product with the video. The product_id from [Get Shop Products] or [Get Showcase Products] |
| ^title | string |  | The title to be shown on the product anchor. Anchor title should be shorter than 30 characters. |
| video_info | object |  | Video information |
| ^file_id | string |  | Video file_id from [Upload Shoppable Video File] |
| ^title | string |  | The video caption. The maximum length is 2200 in UTF-16 runes. If not specified, the ticket post will not have any captions. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^video | object |  | Published video information |
| ^^id | string |  | The video id, use this id to query video publish status. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadShoppableVideoFile

Use this API to upload the video before posting to TikTok

**Path:** `/affiliate_creator/202505/videos/video_files`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-shoppable-video-file-202505

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | The local file to be uploaded. Note： - Supported formats: MP4, MOV, MKV, WMV, WEBM, AVI, 3GP, FLV, MPEG - Max video size: 100 MB - Video aspect ratio: 9:16 to 16:9 Recommendations for product videos: - Resolution: 720p or higher - Duration: > 30 seconds |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^video_file | object |  | Video file information. |
| ^^id | string |  | The id from of the uploaded video file. |
| ^^md5 | string |  | Upload file md5 checksum |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCreatorProfile

This API gets the creator profile information.

**Path:** `/affiliate_creator/202508/profiles`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-creator-profile-202508

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
| ^avatar | object |  | Data associated with the TikTok creator's profile avatar. |
| ^^height | integer |  | The avatar image height in pixels. |
| ^^url | string |  | The URL for the TikTok creator's avatar image file. |
| ^^width | integer |  | The avatar image width in pixels. |
| ^creator_user_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^permissions | array<string> |  | A list of product promotion permissions for the creator. The list can include zero or more of the following permissions: - LIVE_STREAM_PERMISSION - SELF_SALE_PERMISSION - ADD_AFFILIATE_PERMISSION |
| ^register_region | string |  | The region in which the creator's TikTok account is registered. |
| ^selection_region | string |  | The regions in which the creator is eligible to promote products in showcases, videos, and live streams. |
| ^seller_type | string |  | If the creator is also also has a TikTok Shop seller account, the seller type of the creator. This is an enumerated type with values: - CROSS_BORDER - LOCAL |
| ^user_type | string |  | The creator's user type. This is an enumerated type with values: - TIKTOK_SHOP_OFFICIAL_ACCOUNT - TIKTOK_MARKETING_ACCOUNT - TIKTOK_SHOP_CREATOR |
| ^username | string |  | The TikTok user name. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOpenCollaborationProductListByProductIds

Get Product OpenCollaboration Product List By Product Ids

**Path:** `/affiliate_creator/202509/open_collaborations/products`
**Method:** `POST`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-open-collaboration-product-list-by-product-ids-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | product id list |

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
| ^products | array<object> |  | These are the searched products. |
| ^^category_chains | array<object> |  | The categories of this product. Return to the top three categories at most |
| ^^^id | string |  | The current category id of this product. |
| ^^^is_leaf | boolean |  | Indicate whether current node is leaf node |
| ^^^local_name | string |  | The current level category name of this product. |
| ^^^parent_id | string |  | The category id of its parent category |
| ^^commission | object |  | The commission of this product. |
| ^^^amount | string |  | The commission for this product is calculated by multiplying the promotional price with the commission rate for each promotional order. The currency symbol is same as the currency symbol in price |
| ^^^currency | string |  | Currency symbol |
| ^^^rate | integer |  | - The commission rate for this product is set by merchants for creators public promotion. - The range of this value is [100, 8000]. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^detail_link | string |  | Product's detail link which is used to get product details on mobile clients. |
| ^^has_inventory | boolean |  | Whether this product has inventory. |
| ^^id | string |  | Product's unique id. |
| ^^main_image_url | string |  | The product image url. |
| ^^original_price | object |  | The product's original price |
| ^^^currency | string |  | The currency in the sale region. |
| ^^^maximum_amount | string |  | The maximum original price of all skus of this product. |
| ^^^minimum_amount | string |  | The minimum original price of all skus of this product. |
| ^^sale_region | string |  | The region represents the areas where the product can be sold. |
| ^^sales_price | object |  | Sales price information of the product |
| ^^^currency | string |  | Currency symbol for sales area |
| ^^^maximum_amount | string |  | The maximum promotion price of all skus of this product. |
| ^^^minimum_amount | string |  | The  minimum promotion price of all skus of this product. |
| ^^shop | object |  | The product's shop information. |
| ^^^name | string |  | The name of the shop to which the product belongs. |
| ^^shop_ads_commission | object |  | The ads commission rate applies only to orders generated from ads. If a creator’s video is used as an ad without this rate being set, the resulting orders will instead earn either: - The Shop Ads commission you configured in open collaboration, or - The standard commission defined in this invitation. |
| ^^^rate | integer |  | - The commission rate for this product is set by merchants for creators public promotion. - The range of this value is [100, 8000]. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^title | string |  | Product's name. |
| ^^units_sold | integer |  | The total sales of this product. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProducts

Developer can utilize this API to search and retrieve products information of shop which is bound by a specific creator with specific keywords.

**Path:** `/affiliate_creator/202509/shop_products`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-products-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| title_keyword | string |  | The title keyword of the product you wish to search by. |
| sort_field | string |  | Sort fields include PRODUCT_ID, PRICE and SALE. If sort_field is empty or invalid, PRODUCT_ID will be set as default. |
| sort_order | string |  | Sort orders include DESC and ASC. If sort order is empty or invalid, DESC will be set as default. |
| page_size | integer | Y | Pagination count determines how many products you'll get after sending the request. 20 is a recommended number. Valid Range: [1-100] |
| page_token | string |  | The pagination offset that determines where you begin your search. If you are making your first request, this will be empty. |

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
| ^next_page_token | string |  | The pagination token is a cursor used for pagination. The token is returned in the previous pagination query to determine the current position. It will be empty when there aren't any products to search for. |
| ^products | array<object> |  | The searched product list. It will be empty when there are no search results. |
| ^^added_status | string |  | Showcase add status with possible values: - ADDABLE - ADDED - REJECTED |
| ^^brand_name | string |  | The brand name a seller has set for a product. |
| ^^id | string |  | TikTok product ID. |
| ^^images | array<object> |  | Images of a product. |
| ^^^height | integer |  | The height of the product image. |
| ^^^url | string |  | The URL of the product image. |
| ^^^width | integer |  | The width of the product image. |
| ^^price | object |  | Product price shown with two decimal places and currency. |
| ^^^amount | string |  | Product price with two decimal places. |
| ^^^currency | string |  | Product price currency, based on region where creators can sell. |
| ^^sales_count | integer |  | The number of products that have been sold. |
| ^^title | string |  | Product name. |
| ^total_count | integer |  | The total number of products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShoppableVideoStatus

Use this API to get shoppable video posting results.

**Path:** `/affiliate_creator/202509/videos/{video_id}/status`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shoppable-video-status-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_id | string | Y | The video id from [Publish Shoppable Video] |

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
| ^video | object |  | returned video info |
| ^^id | string |  | Video id |
| ^^post_status | string |  | Video posting status, possible values: - SUCCESS - FAIL - PROCESSING |
| ^^post_time | integer |  | Returned if the video has been successfully posted, i.e. `posting_status = SUCCESS`. Represented in seconds. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PrecheckVideoContent

Use this API to pre-check if there's any violation in the video and the shoppable content anchor

**Path:** `/affiliate_creator/202511/videos/precheck_task`
**Method:** `POST`
**Version:** 202511
**Docs:** https://partner.tiktokshop.com/docv2/page/precheck-video-content-202511

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_link_info | object |  | Product link information |
| ^product_id | string |  | Use product_id to bind the product with the video. The product_id from [Get Shop Products](https://api/affiliate_creator/202509/shop_products) or [Get Showcase Products](https://api/affiliate_creator/202405/showcases/products) |
| ^title | string |  | The title to be shown on the product anchor. Anchor title should be shorter than 30 characters. |
| video_info | object |  | Video information |
| ^file_id | string |  | Video file_id from [Upload Shoppable Video File](https://api/affiliate_creator/202505/videos/video_files) |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^precheck | object |  | Video content pre-check task result |
| ^^task_id | string |  | pre-check task id |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShoppableVideoPrecheckResult

Use this API to get video pre-check result

**Path:** `/affiliate_creator/202511/videos/precheck_tasks/{task_id}`
**Method:** `GET`
**Version:** 202511
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shoppable-video-precheck-result-202511

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| task_id | string | Y | task id from [Precheck Video Content](https://api/affiliate_creator/202511/videos/precheck_task) |

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
| ^precheck_task | object |  | Video pre-check task |
| ^^id | string |  | The id of the video pre-check task. |
| ^^issues | array<object> |  | A list of policy violation details returned when the task fails |
| ^^^risk | string |  | Policy violation |
| ^^^suggestions | string |  | Detailed guidance to resolve the detected violation. |
| ^^result | string |  | SUCCESS: The precheck task passed checks FAIL: The precheck task has failed due to violations. Check the 'issues' field for details. PROCESSING: The precheck task is still in progress |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatorGetSampleRequestDeeplink

Use this API to get a one-time TikTok deeplink, use this deeplink to launch TikTok app and land the user on the sample request page.
If the redirect_schema is valid, TikTok will redirect the user back to the 3rd party app after the sample request is submitted.
The deeplink generated can only be used by the creator who authorizes this API call.

**Path:** `/affiliate_creator/202512/samples/deeplink`
**Method:** `GET`
**Version:** 202512
**Docs:** https://partner.tiktokshop.com/docv2/page/creator-get-sample-request-deeplink-202512

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | Product id |
| sku_id | string | Y | Sku id |
| redirect_schema | string |  | An URL schema for App redirection after sample request |
| campaign_id | string |  | If the product belongs to a TAP campaign, a campaign_id is required. |
| collaboration_id | string |  | If the product belongs to a seller collaboration, a collaboration_id is required. |

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
| ^deeplink | string |  | Use this deeplink to invoke TikTok: aweme://sample_request?product_id=123456&sku_id=123456&token=iei938d93sd02 This deeplink can only be used by the creator who authorizes this API call. This deeplink expires in 30 minutes. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShoppableVideoPrecheckResult

Use this API to get video pre-check result

**Path:** `/affiliate_creator/202601/videos/precheck_tasks/{task_id}`
**Method:** `GET`
**Version:** 202601
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shoppable-video-precheck-result-202601

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| task_id | string | Y | task id from [Precheck Video Content](https://partner.tiktokshop.com/docv2/page/precheck-video-content-202511) |

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
| ^precheck_task | object |  | Video pre-check task |
| ^^good_quality_check_result | object |  | good qualtiy check details |
| ^^^issues | array<object> |  | A list of quality issues and improvement suggestions when the good quality check fails. |
| ^^^^code | string |  | Quality finding |
| ^^^^suggestions | string |  | Recommended improvements based on the quality finding. |
| ^^^status | string |  | SUCCESS: The precheck task passed all good quality checks FAIL: The precheck task failed good quality checks. Check the 'issues' field for details. PROCESSING: The good qualtify check is still in progress |
| ^^id | string |  | The id of the video pre-check task. |
| ^^violation_check_result | object |  | violation check details |
| ^^^issues | array<object> |  | A list of policy violation details returned when violation check fails |
| ^^^^risk | string |  | Policy violation |
| ^^^^suggestions | string |  | Detailed guidance to resolve the detected violation. |
| ^^^status | string |  | SUCCESS: The precheck task passed violation checks FAIL: The precheck task has failed due to violations. Check the 'issues' field for details. PROCESSING: The precheck violation task is still in progress |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
