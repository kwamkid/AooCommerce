# TikTok Shop API — affiliate_seller

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 51 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202405, 202406, 202409, 202410, 202412, 202505, 202507, 202508, 202509, 202511, 202512, 202601

---

## EditOpenCollaborationSettings

This API is used to edit a Seller's open collaboration settings. It allows you to enroll your existing product catalog and all future products into an open collaboration plan. It also allows you to turn this setting off at any point. By default, this option is turned off for all Sellers.

**Path:** `/affiliate_seller/202405/open_collaboration_settings`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-open-collaboration-settings-202405

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
| auto_add_product | object |  | An object with properties to automatically add products to affiliate open collaboration plans. |
| ^commission_rate | integer |  | The commission rate in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `100` and a maximum of `8000`. Not that setting the `enable` property to `false` overrides this property. |
| ^enable | boolean |  | Set to `true` if products are automatically added to affiliate open collaboration plans. The seller can add existing non-affiliate products to open collaboration at one time, and future products are added automatically. Set to `false` if otherwise. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateOpenCollaboration

This API allows the seller to create an open collaboration. You create an open collaboration by selecting products and setting a commission rate.

**Path:** `/affiliate_seller/202405/open_collaborations`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/create-open-collaboration-202405

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
| commission_rate | integer |  | The desired commission rate for the open collaboration. The desired commission rate is expressed in hundredths of a pecent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `100`. |
| product_id | string |  | The product ID for adding to the affiliate open collaboration. |
| require_seller_approve_creator | boolean |  | Set to `true` if the open collaboration plan requires approval for additional creator product applications. Set to `false` if the open collaboration plan does not require additional creator product applications. Default: `false`. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^open_collaboration | object |  | The open collaboration. |
| ^^effective_time | integer |  | The effective time of the open collaboration in Unix epoch time format. |
| ^^id | string |  | The open collaboration identifier. |
| ^^product_id | string |  | The product identifier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchAffiliateOpenCollaborationProduct

This API is used to search the information of products with open collaboration by category, commission rate, and keywords. It will return all products on the TikTok Shop Affiliate Product Marketplace that are in an open collaboration.
Sellers can only search for open collaboration within the regions they are registered to sell in.

**Path:** `/affiliate_seller/202405/open_collaborations/products/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-affiliate-open-collaboration-product-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sort_order | string |  | The sort order for the sort_field parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| sort_field | string |  | The returned results will be sorted by the specified field. See the description of the field values in the request body for more information about each field. Default: commission_rate Possible values: - commission_rate - product_sales_price - commission - units_sold |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the next_page_token from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-20]. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

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
| commission_rate_range | object |  | Restricts products in the search results to those with a commision rate greater than the expressed minimum commission rate and less than the expressed maximum commission rate. |
| ^rate_ge | integer |  | The commission rate must be greater than this value in order to be included in the search results. The commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| ^rate_lt | integer |  | The commission rate must be less than this value in order to be included in the search results. The commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| sales_price_range | object |  | Restricts the products in the search results to those with prices greater than or equal to the expressed minimum price and less than the expressed maximum price |
| ^amount_ge | string |  | The product price must be greater than this value in order to be included in the search results. The value must be greater than `0`. |
| ^amount_lt | string |  | The product price must be greater than this value in order to be included in the search results. The value must be greater than `0`. No upper bound is set if this property is not included. |
| title_keywords | array<string> |  | A list of product keywords. Product titles, or names, are loosely matched. Keywords in the list form a query and the resulting set of matching product names is based on the conjunctive operator `AND` between each keyword. For example, the keyword list `["Men", "Fashion"]` creates a query `"Men" AND "Fashion"` and the resulting set of matching product names contains the loosely matched conjuction of "Men" and "Fashion" such as "Male Fashionable". Maximum length of the list is 20 keywords. Maximum keyword string length is 255 characters. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^products | array<object> |  | The list of products meeting the search criteria expressed in the request body. |
| ^^category_chains | array<object> |  | A list of categories associated with the product. |
| ^^^id | string |  | The category identifier. |
| ^^^is_leaf | boolean |  | Set to `true` if this category is a leaf node. Set to `false` if not. |
| ^^^local_name | string |  | The name of the product in the category. |
| ^^^parent_id | string |  | The category identifier of the parent category for the category. |
| ^^commission | object |  | Metadata and data associated with the commission rates for the product. |
| ^^^amount | string |  | The commission amount. |
| ^^^currency | string |  | The currency code. |
| ^^^rate | integer |  | The commission rate in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| ^^detail_link | string |  | The URL for the product's detail page. |
| ^^has_inventory | boolean |  | Set to `true` if there are more than zero units of the product in inventory. Set to `false` if there are zero units in inventory. |
| ^^id | string |  | The product identifier. |
| ^^main_image_url | string |  | The product image URL. |
| ^^original_price | object |  | The original price of the product. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest original price of all SKUs of the product. |
| ^^^minimum_amount | string |  | The lowest original price of all SKUs of the product. |
| ^^sale_region | string |  | The region where the product is offered for sale. |
| ^^sales_price | object |  | Metadata and data associated with the price at which this product was sold for at this commission rate. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest promotion price of all SKUs of this product. |
| ^^^minimum_amount | string |  | The lowest promotion price of all SKUs of this product. |
| ^^shop | object |  | Metadata and data associated with the TikTok Shop that sells the product. |
| ^^^name | string |  | The name of the TikTok shop. |
| ^^title | string |  | The product name. |
| ^^units_sold | integer |  | The total number of units sold of this product. |
| ^total_count | integer |  | Total count of products meeting the search criteria expressed in the request body. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveCreatorFromOpenCollaboration

This API is used to remove creators from open collaboration. Please note, due to current platform design, creators can still rejoin an open collaboration after removal. Partners/Sellers can call this API again to remove the creator again.

**Path:** `/affiliate_seller/202405/open_collaborations/{open_collaboration_id}/remove_creator`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-creator-from-open-collaboration-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| open_collaboration_id | string | Y | Open collaboration ID. This API is only applicable to the seller removing creators from open collaboration. |

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
| creator_user_id | string |  | The creator TikTok user identifier. |
| product_id | string |  | The product identifier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchSellerAffiliateOrders

This API allows the partner to retrieve a list of affiliate orders (orders which are affiliate-commission eligible) generated by a seller, returning the order ID and the product ID. Using this, the partner can track their affiliate-conversions on behalf of a seller, using the order ID.
For now, this API returns all historical Affiliate Orders. We do not provide any filtering mechanisms (based on timestamp) at this time. We will provide this functionality in a future iteration. Thus this API is technically a "Get Affiliate Orders List" at this stage, but it will be improved in the future to be a search based API (with robust filtering).

**Path:** `/affiliate_seller/202405/orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-seller-affiliate-orders-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| version | integer |  | The interface version you want to access |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer | Y | The size of one page, which must be greater than 0 and less than or equal to 50. |
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

## GenerateAffiliateProductPromotionLink

The user of this API is a partner developer, on behalf of Sellers.
This API is used to generate affiliate exclusive product link based on all open collaboration products available within the TikTok Shop Affiliate Product Marketplace.
This API generates a link, at the product ID level (which belongs to a Seller). This link, can be distributed to creators, by the partner developer(the user of this API). The creator adds this product to the creators' showcase through this url.
This link, represents an affiliate partner's ability to bring higher matchmaking effectiveness on behalf of a seller. If a creator does indeed add the product to showcase through this link, then the downstream consumer purchases will be able to be attributed to this partner due to the link generation capabilities.

**Path:** `/affiliate_seller/202405/products/{product_id}/promotion_link/generate`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/generate-affiliate-product-promotion-link-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product identifier. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

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
| ^product_promotion_link | string |  | The URL for a web page with information about the product promotion. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateTargetCollaboration

This API is used to create a target collaboration.
A target collaboration is a collaboration between a seller selected set of products (including a commission payout) and a set of creators the seller has added (invited) to the collaboration. Target collaborations are private and not visible in the Creator Marketplace to all creators; they are only visible to those that have been added to the collaboration.

**Path:** `/affiliate_seller/202405/target_collaborations`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/create-target-collaboration-202405

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
| creator_user_ids | array<string> |  | A list of TikTok user identifiers to invite to the target collaboration. Maximum length of the list is `50` user identifiers. |
| end_time | string |  | The date at which the target collaboration ends, in Unix epoch time. |
| free_sample_rule | object |  | A set of properties that control the free sample behavior for the product. |
| ^has_free_sample | boolean |  | If set to `true`, free samples are provided to creators invited to the target collaboration group. If set to `false`, free samples are not provided. |
| ^is_sample_approval_exempt | boolean |  | If set to `true`, creators invited to the target collaboration are exempt from seller review and are automatically approved for a free  product sample. Note that the `has_free_sample` property overrides the free sample behavior. |
| message | string |  | The message sent to creators associated with the target collaboration. |
| name | string |  | The name of the target collaboration. |
| products | array<object> |  | A list of metadata and data for the products provided by the seller for target collaboration. Maximum length of the list is `100` products. |
| ^id | string |  | The product identifier. |
| ^target_commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| seller_contact_info | object |  | Metadata and data associated with the seller contact information. |
| ^email | string |  | The seller's email address. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^target_collaboration | object |  | The target collaboration. |
| ^^id | string |  | The target collaboration identifier. |
| ^target_collaboration_conflicts | array<object> |  | A list of user and product identifiers with target collaboration conflicts that caused target collaboration failure. |
| ^^creator_user_id | string |  | The TikTok user identifier. |
| ^^product_id | string |  | The product identifier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchCreatoronMarketplace

This API is used by Sellers to search for Creators in the Creator Marketplace. Sellers can search based on filters such as GMV, keywords, and Creator follower demographics. All the data returned is for the last 30 days.

**Path:** `/affiliate_seller/202406/marketplace_creators/search`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-creatoron-marketplace-202406

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request |
| page_size | integer | Y | The value of "page_size" must be 12 or 20 |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| follower_demographics | object |  | Filtering creators by follower demographics |
| ^age_ranges | array<string> |  | Follower age filtering options, which are range intervals, include: AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^count_range | object |  | Follower count filtering |
| ^^count_ge | integer |  | The minimum value of follower count. The value passed in must be greater than or equal to 0 |
| ^^count_le | integer |  | The maximum value of follower count. - Generally, a value greater than or equal to 0 needs to be passed. If a value less than 0 is passed, it means that the field will not be filtered. |
| ^gender_distribution | object |  | Filtering creators by follower gender which includes: "male", "female" |
| ^^gender | string |  | A particular gender, "MALE" or "FEMALE" |
| ^^percentage_ge | integer |  | Greater than or equal to a certain percentage, scaled up by 10,000 times. For example, 6000 stands for 0.6 or 60% |
| gmv_ranges | array<string> |  | Filtering by GMV range intervals which include: GMV_RANGE_0_100: "0-100", GMV_RANGE_100_1000: "100-1000", GMV_RANGE_1000_10000: "1000-10000", GMV_RANGE_10000_AND_ABOVE: "10000+" For example: - If GMV_RANGE_0_100 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 100. - If GMV_RANGE_0_100 and GMV_RANGE_100_1000 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 1000. |
| keyword | string |  | Searching creators by keyword, matching based on TikTok Username and Nickname. |
| search_key | string |  | Caching search results improves api performance and ensures stable request results. You don't need to pass a value on the first call. For the second call, please pass the value returned in the response of the first call. |
| units_sold_ranges | array<string> |  | Filtering by sales volume range intervals which include: UNITS_SOLD_RANGE_0_10: "0-10", UNITS_SOLD_RANGE_10_100: "10-100", UNITS_SOLD_RANGE_100_1000: "100-1000", UNITS_SOLD_RANGE_1000_AND_ABOVE: "1000+" For example: - If UNITS_SOLD_RANGE_0_10 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 10. - If UNITS_SOLD_RANGE_0_10 and UNITS_SOLD_RANGE_10_100 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 100. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^creators | array<object> |  | Creator's basic information |
| ^^avatar | object |  | Creator's profile picture |
| ^^^url | string |  | URL of creator's avatar picture |
| ^^avg_ec_live_uv | integer |  | Average UV for creator's e-commerce live streams |
| ^^avg_ec_video_view_count | integer |  | Average views for creator's e-commerce videos |
| ^^category_ids | array<string> |  | It indicates the main product categories when the creator posts products. |
| ^^follower_count | integer |  | Follower count |
| ^^gmv | object |  | Creator GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^gmv_range | object |  | GMV range. Applicable if the target market is the US and the creator does not authorize sharing precise data. |
| ^^^currency | string |  | Currency symbol |
| ^^^maximum_amount | string |  | The maximum value of GMV range |
| ^^^minimum_amount | string |  | The minimum value of GMV range |
| ^^live_gmv | object |  | Live stream GMV If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Live stream GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^nickname | string |  | Creator's TikTok Nickname |
| ^^selection_region | string |  | Regions where the creator operates and promotes products |
| ^^top_follower_demographics | object |  | Top follower information of the creator |
| ^^^age_ranges | array<string> |  | Return the top 3 age ranges of the followers. Ranges are : AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^^^major_gender | object |  | Major gender of the followers |
| ^^^^gender | string |  | Top follower gender category of the creator, "MALE" or "FEMALE" |
| ^^^^percentage | integer |  | Percentage of top follower gender, scaled up by 10,000 times. For example, 6524 stands for 0.6524 or 65.24%. You can then infer that the opposite gender would be 0.3476 or 34.76%. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is US only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^maximum_amount | integer |  | The maximum value of sales volume range |
| ^^^minimum_amount | integer |  | The minimum value of sales volume range |
| ^^username | string |  | Creator's TikTok Username |
| ^^video_gmv | object |  | Video GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Video GMV value |
| ^^^currency | string |  | Currency symbol |
| ^next_page_token | string |  | Next page token |
| ^search_key | string |  | Caching search results improves api performance and ensures stable request results |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetMarketplaceCreatorPerformance

Get the Creator Affiliate's Marketplace information and performance metrics in the last 30 days.

**Path:** `/affiliate_seller/202406/marketplace_creators/{creator_user_id}`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/get-marketplace-creator-performance-202406

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_id | string | Y | Creators' TikTok User ID |

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
| ^creator | object |  | Data associated with the creator's TikTok profile. |
| ^^avatar | object |  | Metadata and data associated with the creator's TikTok profile avatar. |
| ^^^url | string |  | The URL for the creator's TikTok profile avatar. |
| ^^avg_commission_rate | integer |  | The average commission rate in hundredths of a percent. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^avg_commission_rate_range | object |  | The range of average commission rates associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^maximum_amount | integer |  | The largest average commission rate in hundredths of a percent. |
| ^^^minimum_amount | integer |  | The smallest average commission rate in hundredths of a percent. |
| ^^avg_ec_live_comment_count | integer |  | Average e-commerce live stream comments. |
| ^^avg_ec_live_like_count | integer |  | Average e-commerce live stream likes. |
| ^^avg_ec_live_share_count | integer |  | Average e-commerce live stream shares. |
| ^^avg_ec_live_view_count | integer |  | Average live stream views with promoted products. |
| ^^avg_ec_video_comment_count | integer |  | Average e-commerce video comments. |
| ^^avg_ec_video_like_count | integer |  | Average e-commerce video likes. |
| ^^avg_ec_video_play_count | integer |  | The average number of number of e-commerce video plays. |
| ^^avg_ec_video_share_count | integer |  | Average e-commerce video shares. |
| ^^avg_gmv_per_buyer | object |  | Average GMV per buyer metadata and data associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The average GMV per buyer amount. |
| ^^^currency | string |  | The currency code. |
| ^^avg_gmv_per_buyer_range | object |  | The range of average GMV per buyer associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The largest average GMV per buyer. |
| ^^^minimum_amount | string |  | The smallest average GMV per buyer. |
| ^^bio_description | string |  | The biography description associated with the creator. |
| ^^brand_collaboration_count | integer |  | The total number of brands with which the creator has previously collaborated. |
| ^^category_gmv_distribution | array<object> |  | GMV distribution by category. |
| ^^^category_id | string |  | The top-level category identifier. |
| ^^^value | string |  | GMV associated with the category in hundredths of a percent. |
| ^^category_ids | array<string> |  | A list of category identifiers associated with the products for which the creator has created posts. |
| ^^content_gmv_distribution | array<object> |  | GMV associated with creator content by content type. |
| ^^^content_type | string |  | The content type. This an enumerated type with values: - VIDEO - LIVE - SHOWCASE |
| ^^^value | string |  | Content GMV distribution value in hundredths of a percent. |
| ^^ec_live_count | integer |  | The number of e-commerce livestreams associated with the creator. |
| ^^ec_live_engagement_rate | string |  | E-commerce live stream engagement rate in hundredths of a percent. For example, `6000` is 60%. |
| ^^ec_video_count | integer |  | The number of e-commerce video posts associated with the creator. |
| ^^follower_count | integer |  | The creator's follower count. |
| ^^gmv | object |  | Gross merchandise value (GMV) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^gmv_range | object |  | The range of GMV values associated with this creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest GMV value. |
| ^^^minimum_amount | string |  | The lowest GMV value. |
| ^^gpm | object |  | GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^gpm_range | object |  | The range of GPM values associated with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest GPM value. |
| ^^^minimum_amount | string |  | The lowest GPM value. |
| ^^live_gmv | object |  | Livestream GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | Total livestream GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm | object |  | Livestream GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The livestream GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm_range | object |  | The range of livestream GPM values associted with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest livestream GPM value. |
| ^^^minimum_amount | string |  | The lowest livestream GPM value. |
| ^^nickname | string |  | TikTok nickname. |
| ^^product_original_price_range | object |  | Original promoted product price metadata and data associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The higest original promoted product price. |
| ^^^minimum_amount | string |  | The lowest original promoted product price. |
| ^^profile_tt_uri | string |  | The URL for the creator's TikTok profile page. |
| ^^promoted_product_num | integer |  | The number of promoted products associated with the creator. |
| ^^selection_region | string |  | The region associated with the creator. |
| ^^top_collaborated_brand_ids | array<string> |  | A list of the top 10 brands with which the creator has previously collaborated. |
| ^^units_sold | integer |  | The total number of units sold. Units are indexed to SKU. Note that if the creator has not given permission for precise data sharing, this property will not be present. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^maximum_amount | integer |  | The highest number of units sold. |
| ^^^minimum_amount | integer |  | The lowest number of units sold. |
| ^^username | string |  | TikTok user name. |
| ^^video_gmv | object |  | The video GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total video GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm | object |  | Video GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The video GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm_range | object |  | The range of video GPM values associted with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The highest video GPM value. |
| ^^^minimum_amount | string |  | The lowest video GPM value. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOpenCollaborationSettings

Get the open collaboration settings, including auto add settings.

**Path:** `/affiliate_seller/202409/open_collaboration_settings`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/get-open-collaboration-settings-202409

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
| ^open_collaboration_settings | object |  | Settings detail |
| ^^auto_add_product | object |  | Setting for auto add products to affiliate |
| ^^^commission_rate | integer |  | The default commission rate of open collaboration created for the auto-added products. The unit is 0.01%. For example, to set the default commission rate to 10%, set the value to `1000`. If so, if the price of a product is $50 USD, the creator would receive $5 USD for every piece of product sold. The range is `[100, 8000]`. When enable=false, this field will not be returned. |
| ^^^enable | boolean |  | - true: The seller can add existing non-affiliate products to open collaboration at one time, and future products will also be added automatically. - false: Future products will not be added to open collaboration automatically, but existing products' open collaboration will not be reverted. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveOpenCollaboration

Remove open collaboration for product. 
You can only remove open collaboration when `status==NORMAL`. When you call this API, the open collaborations will be terminated at `terminated_effective_time`, not immediately, to protect the interests of the creators. After `terminated_effective_time`, the open collaboration is officially terminated and can not be found in the response in [Search Open Collaboration].

**Path:** `/affiliate_seller/202409/open_collaborations/products/{product_id}`
**Method:** `DELETE`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-open-collaboration-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product id of the open collaboration to be terminated |

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
| ^terminated_effective_time | integer |  | The effective time of open collaboration termination. Usually it's 00:00 tomorrow. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchOpenCollaboration

Retrieve all open collaboration information from merchants, including commission rate, add to showcase and post content creator count.

**Path:** `/affiliate_seller/202409/open_collaborations/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-open-collaboration-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when you raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 100. |
| sort_order | string |  | Default value of "sort_order" is DESC. Enum: - ASC：means to sort data in ascending order - DESC：means to sort data in descending order |
| sort_field | string |  | Some sorting fields are as follows: - product_original_price: sort by products' original price. By default, the open collaborations are sorted in descending order by creation time. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Search based on the product name or product ID. Pass in the appropriate value based on the keyword_type above. |
| keyword_type | string |  | Pass in the parameter type which you use to query open collaborations. You can query based on: - PRODUCT_ID：If you use PRODUCT_ID  to search, you can search for open collaboration information for a specified product ID. - PRODUCT_NAME: If you use PRODUCT_NAME to search, you can fuzzy search for open collaboration information involving related product names. |
| top_level_category_id | string |  | The category of the searched product needs to be limited in this param. Prerequisites: - The value of field category_id must be greater than 0. - Currently, it only supports first-level categories |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Next page token |
| ^open_collaborations | array<object> |  | The open collaborations |
| ^^content_creator_count | integer |  | This field indicates the number of creators who posted the LIve or Video from open collaboration. |
| ^^current_commission | object |  | The commission information is currently in effect for this open collaboration. |
| ^^^end_time | integer |  | The effective end time of the commission rate. |
| ^^^rate | integer |  | The commission rate for this product is set by merchants for creators' public promotion. The range of this value is [100, 8000]. This value is expressed in 1/10000 increments. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^^start_time | integer |  | The time when the commission rate becomes effective. |
| ^^id | string |  | The open collaboration id |
| ^^product | object |  | The open collaboration bound product information. |
| ^^^id | string |  | Product's unique id. |
| ^^^inventory | integer |  | The inventory of this product. |
| ^^^main_image_url | string |  | The product image url. |
| ^^^original_price | object |  | The product's original price |
| ^^^^currency | string |  | Currency Symbol |
| ^^^^maximum_amount | string |  | The maximum original price of all skus of this product. |
| ^^^^minimum_amount | string |  | The minimum original price of all skus of this product. |
| ^^^status | string |  | Product's status. Field values: - LIVE: When the product is normal for sale, return to the LIVE status - OUT_OF_STOCK: When the product is out of stock for the consumer, the OUT_OF_STOCK state is returned - SELLER_DEACTIVATE:  When the product is deactivated by the merchant, the SELLER_DEACTIVATE status is returned - PLATFORM_DEACTIVATE: When the product is deactivated by the platform or is not available for sale, the PLATFORM_DEACTIVATE status is returned - GNE_REJECT: When the product is governed or the open collaboration is dismissed, the GNE_REJECT state is returned - DELETE: When the product is deleted, the DELETE status is returned - OTHER: When the product is in an unsaleable state, such as draft, frozen, review, etc, the OTHER status is returned |
| ^^^title | string |  | Product's name. |
| ^^require_seller_approve_creator | boolean |  | It indicates whether open collaboration requires approval for additional product applications by creators, the false indicating no need for approval. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from open collaboration. |
| ^^status | string |  | Status of open collaboration. Field values: - NORMAL：NORMAL means the current open collaboration status is normal and in effect. - TERMINATING: TERMINATING means that the merchant has removed open collaboration and the open collaboration will expire soon. The expiration time can be found at the end_time of current_commission. The open collaborations which were removed and expired will not be returned in the response. |
| ^total_count | integer |  | Total count of products that satisfy all the input search conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchSampleApplications

This API is provided for sellers to query sample applications based on various criteria such as products, creators, or application statuses. By using this API, sellers can retrieve detailed information about sample application records, including the creator's information and the specifics of each application.

**Path:** `/affiliate_seller/202409/sample_applications/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer |  | The value of "page_size" must be greater than 0 and less than or equal to 50. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_id | string |  | TikTok User ID of a creator |
| order_id | string |  | Main order ID associated with a sample order when the sample application is approved by seller. |
| product_id | string |  | The unique identifier of a product. It is used to specify which product's sample application details are being queried. |
| status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: Open collaboration has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. This field allows for tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |
| target_collabration_id | string |  | The unique ID generated after creating a target collaboration. |
| title | string |  | Product name, supports fuzzy search queries. It allows sellers to search for products by name when managing sample applications. |
| username | string |  | TikTok User Name of a creator, supports fuzzy search |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Page token to query next page orders, last page is empty string |
| ^sample_applications | array<object> |  | The sample applications from creators |
| ^^approve_expiration_time | integer |  | The expire time for a seller to approve a sample application. |
| ^^available_quantity | integer |  | The remaining stock quota of a sample product. |
| ^^commission_rate | string |  | The commission rate for this product is set by merchants for creators. - The range of this value is [0.01, 0.8]. |
| ^^creator | object |  | Creator detailed information. It includes various details such as the creator's TikTok user name, TikTok user id, and performance metrics related to creator e-commerce activities, such as sales, fulfillment rates, and other relevant statistics. |
| ^^^avatar_url | string |  | The URL of the creator's avatar image |
| ^^^content_count | integer |  | The number of contents a creator has posted in the last 30 days. It is formatted as an integer. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^ec_video_view | integer |  | The median number of creators' shoppable video views over the past 30 days. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^follower_count | integer |  | The number of creator's followers |
| ^^^fulfillment_percentage | string |  | Sample fulfillment rate of a creator received sample from seller over the past 90 days, formatted as a floating-point percentage with two decimal places (e.g., "60.85%"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^gmv | object |  | GMV generated by a creators' shoppable content over the past 30 days. It is formatted as a floating-point number with a currency symbol (e.g., "$1234.56"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^^amount | string |  | GMV amount |
| ^^^^currency | string |  | currency |
| ^^^nickname | string |  | TikTok Nick Name of a creator |
| ^^^user_id | string |  | TikTok User ID of a creator |
| ^^^username | string |  | TikTok User Name of a creator |
| ^^disapprovable_reasons | array<string> |  | The reasons why can not approve the sample application |
| ^^fulfillment_status | string |  | It indicates the current status of the fulfillment process. The possible values are: - PENDING: The creator is yet to fulfill the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator has been exempted from the fulfillment obligation. |
| ^^id | string |  | The unique id of sample request application ID |
| ^^is_approvable | boolean |  | The sample application can be approved or not. |
| ^^order_id | string |  | The sample order is generated after the sample application is approved by seller |
| ^^partner_name | string |  | The name of the partner if the sample application is submitted on behalf of a creator by an agency. It is only populated when an agency handles the application process instead of the creator directly. |
| ^^product | object |  | product information |
| ^^^id | string |  | The product identifier. |
| ^^^sku_id | string |  | The unique id of product sku which creator apply for as sample. |
| ^^^sku_image_url | string |  | The URL of SKU image. |
| ^^^sku_name | string |  | The description of sku |
| ^^^title | string |  | The product name of the product. |
| ^^shipment_expiration_time | integer |  | The deadline for a seller to ship a sample for a sample application. |
| ^^status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: The open collaboration plan has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has finished creating the content. |
| ^^tracking_number | string |  | The logistics tracking number for the sample application order |
| ^total_count | integer |  | total count |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchSampleApplicationsFulfillments

You, the seller, can use this API to get the fulfillment status of the specific sample application and whether the fulfillment resulted in orders. This allows Sellers to track the current progress or analyze the results of their sample distribution program.

**Path:** `/affiliate_seller/202409/sample_applications/{application_id}/fulfillments/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-fulfillments-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| application_id | string | Y | The application identifier. |

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
| content_format | string |  | The content type generated by the creator after receiving the samples. Possible enumerations: - LIVE - VIDEO |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^fulfillments | array<object> |  | Fulfillments |
| ^^content | object |  | Fulfillment content information. |
| ^^^comment_count | integer |  | The cumulative total number of content commented. |
| ^^^create_time | integer |  | - When `format==VIDEO`, it refers to the time when the video is first set to public and linked to the product. - When `format==LIVE`, it refers to the time when the product link is first added to the live stream. |
| ^^^description | string |  | The title of video or the description of the live room. |
| ^^^format | string |  | The format of the generated content: - LIVE - `VIDEO` |
| ^^^id | string |  | The video or live room identifier. |
| ^^^like_count | integer |  | The cumulative total number of content liked. |
| ^^^live_end_time | integer |  | Only when `format==LIVE`. It refers to the time when the product link is removed from the live room. If the product link remains active and is not removed, then it is the end of the live stream. |
| ^^^page_link | string |  | Content page url of TikTok. |
| ^^^paid_order_count | integer |  | The cumulative total number of orders paid for content. |
| ^^^url | string |  | The content source link. |
| ^^^view_count | integer |  | The cumulative total number of content viewed. |
| ^^product | object |  | Product information |
| ^^^id | string |  | The product identifier. |
| ^^^main_image_url | string |  | The cover image url of product. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerReviewSampleApplications

This API allows the seller to approve or reject the creator's sample application in an open collaboration. When rejecting an application, the seller must provide a specific reason. This API facilitates the management of sample applications by giving sellers the ability to review and update applications according to their criteria and requirements.

**Path:** `/affiliate_seller/202409/sample_applications/{application_id}/review`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-review-sample-applications-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| application_id | string | Y |  |

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
| reject_reason | string |  | The reason why a seller rejected a creator's sample application. The possible enumerated values are: - NOT_MATCH: The creator does not meet the seller's collaboration requirements. - OFFLINE: The product has been taken offline. - OUT_OF_STOCK: The product is temporarily out of stock. - OTHER: Any other reason not covered by the above categories. Required if the review_result is set to REJECT This field allows the seller to specify the reason for rejecting a sample application, providing clarity to the creator regarding the rejection. |
| review_result | string |  | The audit action to be taken on a sample application record by the seller. The field accepts one of four enumerated values: - APPROVE: Approves the sample application. - REJECT: Rejects the sample application. This field allows the seller to specify the desired operation to manage the sample application record effectively. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchTargetCollaborations

This API is used by Seller to search for all existing target collaborations. Sellers can search based on filters such as Invitation name, Invitation ID, Product name, Product ID and Creator name.

**Path:** `/affiliate_seller/202409/target_collaborations/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-target-collaborations-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The value of "page_size" must be 20, 50 or 100. |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| collaboration_status | string |  | Filtering by target collaborations' status. You can query based on: - ONGOING: If you use ONGOING to search, the remaining validity period of the returned target collaborations will be greater than 7 days. - EXPIRING: If you use EXPIRING to search, the remaining validity period of the returned target collaborations will be less than 7 days. - VALID: If you use VALID to search, all returned target collaborations will be valid. - CANCELING: If you use CANCELING to search, all returned target collaborations will be in the process of canceling. - COMPLETED: If you use COMPLETED to search, all returned target collaborations will be in the state of completed, including expired and canceled. |
| creator_accept_status | string |  | Filtering by acceptance status of creators who are invited to target collaborations. You can query based on: - "ACCEPT", it means creators have already added the products to the showcase - "ALL""", it means regardless of whether the creator adds the product to the Showcase. By default, the target collaborations will be searched by "ALL" status. |
| creator_user_id | string |  | Creators' TikTok User ID. - CREATOR_ID: If you use CREATOR_ID  to search, you can search for target collaboration information for a specified creator ID. |
| free_sample_setting | string |  | Filtering by target collaborations' free sample setting. You can query based on: - "WITH_FREE_SAMPLE" - "ALL" By default, the target collaborations will be searched by "ALL" setting. |
| search_param | object |  | The search param. |
| ^keyword | string |  | Search Keyword. |
| ^keyword_type | string |  | Pass in the parameter type which you use to search for target collaborations. You can query based on: - PRODUCT_ID：If you use PRODUCT_ID  to search, you can search for target collaboration information for a specified product ID. - PRODUCT_NAME: If you use PRODUCT_NAME to search, you can fuzzy search for target collaboration information involving related product names. - TARGET_COLLABORATION_ID: if you use Target_Collaboration_ID to search, you can search for target collaboration information for a specified target collaboration ID. - TARGET_COLLABORATION_NAME: If you use Target_Collaboration_NAME to search, you can fuzzy search for target collaboration information involving related target collaboration names. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Cursor for the next page request. |
| ^target_collaborations | array<object> |  | The basic information of target collaboration which creators can view in Targeted Invitation on TikTok EC Center. |
| ^^content_creator_count | integer |  | The number of creators who posted content featuring products from target collaboration. |
| ^^creator_inivited_count | integer |  | The count of creators invited in the target collaboration. |
| ^^end_time | integer |  | The end time of the target collaboration. |
| ^^free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^^^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration. |
| ^^^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| ^^id | string |  | Target collaboration ID. |
| ^^message | string |  | Message seller has sent to creators about seller's  introduction and why excited to collaborate. |
| ^^name | string |  | Target collaboration name. |
| ^^product_count | integer |  | The count of products added in the target collaboration. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from target collaboration. |
| ^^start_time | integer |  | The start time of the target collaboration. |
| ^^type | string |  | The type of target collaboration. Field values: - STANDARD: The target collaboration is created by sellers manually selecting products and creators. - TOP_CREATOR_PROGRAM: The target collaboration created by seller joining TikTok Shop Top Creator Program, requiring only product submission. |
| ^^update_time | integer |  | The update time of the target collaboration. |
| ^total_count | integer |  | The total count of target collaboration returned by this query. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QueryTargetCollaborationDetail

This API is used by Sellers to get target collaboration information.

**Path:** `/affiliate_seller/202409/target_collaborations/{target_collaboration_id}`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/query-target-collaboration-detail-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | Target collaboration id. |

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
| ^target_collaboration | object |  | Target Collaboration detail. |
| ^^content_creator_count | integer |  | The number of creators who posted content featuring products from target collaboration. The count will only include the NORMAL state. |
| ^^creator_invited_count | integer |  | The count of creators invited in the target collaboration. The count will only include the NORMAL state. |
| ^^creators | array<object> |  | The information of creators in the target collaboration. |
| ^^^avatar | object |  | Data associated with the TikTok creator's profile avatar. |
| ^^^^url | string |  | The URL for the TikTok creator's avatar image file. |
| ^^^collaboration_status | string |  | The status of the creator in the current target cooperation. Field values: - NORMAL: The status of the creator in the current target collaboration is normal. - DELETING: The status of the creator in the current target collaboration is deleting.The creator's product promotion relationship in the DELETING status will end the delayed effectiveness status and flow to the DELETED status at 00:00 the next day. - DELETED: The status of the creator in the current target collaboration is deleted. |
| ^^^content_product_count | integer |  | This field indicates the number of products creator has posted video or live from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^nickname | string |  | The TikTok nick name. |
| ^^^product_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission rate for all products under Target Collaboration is effective. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current creator and some products, the commission rate will be based on TOP_CREATOR_PROGRAM. The products' commission under the current Target Collaboration will only be partially effective for the creator, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^selection_region | string |  | The regions in which the creator is eligible to promote products in showcases, videos, and live streams. |
| ^^^showcase_product_count | integer |  | This field indicates the number of products creator has added  to the showcase from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^user_id | string |  | Creators' TikTok User ID. |
| ^^^username | string |  | The TikTok user name. |
| ^^end_time | integer |  | The end time of the target collaboration. |
| ^^free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^^^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration group. |
| ^^^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| ^^id | string |  | Target collaboration ID. |
| ^^message | string |  | Message seller has sent to creators about seller's  introduction and why excited to collaborate. |
| ^^name | string |  | Target collaboration name. |
| ^^product_count | integer |  | The count of products added in the target collaboration. The count will only include the NORMAL state. |
| ^^products | array<object> |  | The information of products in the target collaboration. |
| ^^^collaboration_status | string |  | The status of the product in the current target cooperation. Field values: - NORMAL: The status of the product in the current target collaboration is normal. - DELETING: The status of the product in the current target collaboration is deleting.Product in the DELETING state will end their delayed effectiveness state and move to the DELETED state at 00:00 the next day. - DELETED: The status of the product in the current target collaboration is deleted. |
| ^^^commission | object |  | Commission info. |
| ^^^^currency | string |  | The currency code. |
| ^^^^effective_time | string |  | Commission effective time. It is a timestamp. |
| ^^^^maximum_amount | string |  | The maximum estimated commission amount for all SKUs of this product. |
| ^^^^minimum_amount | string |  | The minimum estimated commission amount for all SKUs of this product. |
| ^^^^rate | integer |  | The commission rate in hundredths of a pecent. For example, 3587 is a commission rate of 35.87%. This value must a minimum of 1000.  The range of this value is [100, 8000]. |
| ^^^commission_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission for a product will be the same for all creators. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current product and some creators, the commission rate will be based on TOP_CREATOR_PROGRAM. The product commission under the current Target Collaboration will be effective for some creators, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^id | string |  | The product identifier. |
| ^^^main_image_url | string |  | The product image url. |
| ^^^original_price | object |  | The original price of the product. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest original price of all SKUs of the product. |
| ^^^^minimum_amount | string |  | The lowest original price of all SKUs of the product. |
| ^^^status | string |  | Product's status. Field values: - LIVE: When the product is normal for sale, return to the LIVE status - OUT_OF_STOCK: When the product is out of stock for the consumer, the OUT_OF_STOCK state is returned - SELLER_DEACTIVATE:  When the product is deactivated by the merchant, the SELLER_DEACTIVATE status is returned - PLATFORM_DEACTIVATE: When the product is deactivated by the platform or is not available for sale, the PLATFORM_DEACTIVATE status is returned - GNE_REJECT: When the product is governed or the target collaboration is dismissed, the GNE_REJECT state is returned - DELETE: When the product is deleted, the DELETE status is returned - OTHER: When the product is in an unsaleable state, such as draft, frozen, review, etc, the OTHER status is returned |
| ^^^title | string |  | The product name. |
| ^^seller_contact_info | object |  | Contact information for the seller in the target collaboration. |
| ^^^email | string |  | Seller's email contact information. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from target collaboration. The count will only include the NORMAL state. |
| ^^start_time | integer |  | The start time of the target collaboration. |
| ^^type | string |  | The type of target collaboration. Field values: - STANDARD: The target collaboration is created by sellers manually selecting products and creators. - TOP_CREATOR_PROGRAM: The target collaboration created by seller joining TikTok Shop Top Creator Program, requiring only product submission. |
| ^^update_time | integer |  | The update time of the target collaboration. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateTargetCollaboration

This API is used by Seller to update STANDARD target collaboration.

**Path:** `/affiliate_seller/202409/target_collaborations/{target_collaboration_id}`
**Method:** `PUT`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/update-target-collaboration-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | The unique id of specific target collaboration. |

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
| creator_user_ids | array<string> |  | The list of Creators' TikTok User IDs invited in the target collaboration. The maximum number of creators is 50. |
| end_time | string |  | The end time of the target collaboration. |
| free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration. |
| ^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| name | string |  | The name of the target collaboration. |
| products | array<object> |  | The information about the products provided by the seller for target collaboration with creators in the target collaboration. The maximum number of products is 100. When a product is deleted from the product list, if the deleted product has been added to the showcase by the creator, it will take effect at 0:00 the next day, otherwise it will take effect immediately. |
| ^commission_rate | integer |  | The desired commission rate for the target collaboration. The value is measured in ten thousandths. For example, 3587 means the commission fee equals 35.87% of the original price. The range is [100, 8000]. Increasing product commissions will take effect immediately, while reducing product commissions will take effect at 00:00 the next day if the current product has been added to the showcase by a creator, otherwise it will take effect immediately. |
| ^id | string |  | The product identifier. |
| seller_contact_info | object |  | Contact information for the seller in the target collaboration. |
| ^email | string |  | Seller's email contact information |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^target_collaboration_conflicts | array<object> |  | A list of creators and products with target collaboration conflicts that caused target collaboration update failure. |
| ^^creator_user_id | string |  | The TikTok user identifier. |
| ^^product_id | string |  | The product identifier. |
| ^update_failed | object |  | Describe which fields were not updated successfully. |
| ^^add_creator_ids | array<string> |  | The list of creators' TikTok User IDs that have not been successfully added. |
| ^^add_products | object |  | The list of products that have not been successfully added. |
| ^^^commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must be a minimum of 1000. |
| ^^^id | string |  | The product identifier. |
| ^^change_commissions | object |  | The list of commission information that has not been successfully changed. |
| ^^^commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must be a minimum of 1000. |
| ^^^product_id | string |  | The product identifier. |
| ^^end_time | integer |  | The end time of the target collaboration, which has not been successfully updated. |
| ^^name | string |  | The name of the target collaboration. |
| ^^remove_creator_ids | array<string> |  | The list of creators' TikTok User IDs that have not been successfully removed. |
| ^^remove_product_ids | array<string> |  | The list of product ids that have not been successfully removed. |
| ^^seller_contact_info | object |  | Contact information for the seller in the target collaboration which has not been successfully updated. |
| ^^^email | string |  | Seller's email contact information which has not been successfully updated. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveTargetCollaboration

This API is used by Seller to remove affiliate target collaboration.

**Path:** `/affiliate_seller/202409/target_collaborations/{target_collaboration_id}`
**Method:** `DELETE`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-target-collaboration-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | The unique id of the specified target collaboration. |

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

## GetOpenCollaborationSampleRules

Use this API to get the status and the details of the sample rules for products under an open collaboration. With this API, you can efficiently review the sample distribution criteria for products within the open collaboration context.

**Path:** `/affiliate_seller/202410/open_collaborations/sample_rules`
**Method:** `GET`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/get-open-collaboration-sample-rules-202410

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> | Y | The product IDs to which the sample rules apply. |
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
| ^sample_rules | array<object> |  | Sample rules |
| ^^available_quantity | integer |  | The quantity of remaining samples available for application. |
| ^^end_time | integer |  | The end time of the period during which a creator can apply for samples. |
| ^^is_sample_time_unlimited | boolean |  | Whether samples are timely unlimited for request: - If true, it means available all the time - If false, it means sample only available from `begin_time` to `end_time`. |
| ^^product_id | string |  | The unique id of product. |
| ^^sample_quota | integer |  | The sample total quantity provided by seller which creators can apply for. |
| ^^start_time | integer |  | The start time of the period during which a creator can apply for samples. You must specify `start_time` and `end_time` together. |
| ^^status | string |  | Free sample rule status: - NOT_STARTED. Not yet reached the specified `begin_time`. - ONGOING. The sample rule is effective and the collaboration is ongoing. - `NO_LEFT_COUNT`. `sample_quantity_available` is `0`. - PLAN_EXCEPTION. The product commission collaboration status is abnormal - EXPIRED. Exceeded the `end_time`. |
| ^^thresholds | object |  | The threshold criteria that a creator must meet to be eligible to apply for the sample. |
| ^^^avg_ec_video_views | integer |  | The creator must have the average views of e-commerce videos in the past 30 days greater than this value to be eligible to request the sample. |
| ^^^category_ids | array<string> |  | A list of product first-level category IDs. Use this to limit participating creators: for each creator, sort their GMV over the past 30 days by first-level product category. If the GMV of one of the categories is among the top three, the creator is eligible to participate in the event. No restriction by default. For example, if a creator's top three categories are [{Cellphone_ID}, {Furniture_ID}, {Food_ID}], and the value of tehis parameter is `[{Food_ID}]`, the creator is qualified for open collaboration. |
| ^^^minimum_follower_count | integer |  | The creator must have a follower count greater than this value to be eligible to request the sample. |
| ^^^minimum_gmv | integer |  | The creator must have the GMV in the past 30 days greater than this value to be eligible to request the sample. |
| ^^^predicted_fulfillment_rank | string |  | The creators whose predicted rate of posting a shoppable video or LIVE after receiving a sample. - ALL. All creators regardless of the rate. - LOW. The creators whose rate is above or equal to low. - MEDIUM. The creators whose rate is above or equal to medium. - HIGH. The creators whose rate is high. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EditOpenCollaborationSampleRule

Use this API to manage sample rules in open collaborations, like valid time periods, or thresholds for creators to request samples. You can create, update, or deactivate rules.

**Path:** `/affiliate_seller/202410/open_collaborations/sample_rules`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-open-collaboration-sample-rule-202410

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
| product_id | string |  | The product ID to which the sample rule applies. You can only assign one sample rule for one `product_id`. Only the most recent API call will take effect. |
| sample_rule | object |  | Sample rule |
| ^activate_status | string |  | To activate the sample rule, use `ACTIVATE`; to deactivate the sample rule, use `DEACTIVATE`. When using `ACTIVATE`, you must specify the details of the rule; when using `DEACTIVATE`, you just need to specify `product_id`. |
| ^end_time | integer |  | The end time of the period during which a creator can apply for samples. You must specify `start_time` and `end_time` together. |
| ^is_sample_time_unlimited | boolean |  | Whether the sample is always available for application: - If true, the sample can be requested at any time. - If false, the sample can only be requested during specified time periods. You must set start_time and end_time. |
| ^sample_quota | integer |  | The total quantity of the samples provided by the seller that the creators can apply for. |
| ^start_time | integer |  | The start time of the period during which a creator can apply for samples. You must specify `start_time` and `end_time` together. |
| ^thresholds | object |  | The threshold criteria that a creator must meet to be eligible to apply for the sample. |
| ^^avg_ec_video_views | integer |  | The creator must have the average views of e-commerce videos in the past 30 days greater than this value to be eligible to request the sample. |
| ^^category_ids | array<string> |  | A list of product first-level category IDs. Use this to limit participating creators: for each creator, sort their GMV over the past 30 days by first-level product category. If the GMV of one of the categories is among the top three, the creator is eligible to participate in the event. No restriction by default. For example, if a creator's top three categories are [{Cellphone_ID}, {Furniture_ID}, {Food_ID}], and the value of tehis parameter is `[{Food_ID}]`, the creator is qualified for open collaboration. |
| ^^minimum_follower_count | integer |  | The creator must have a follower count greater than this value to be eligible to request the sample. |
| ^^minimum_gmv | integer |  | The creator must have the GMV in the past 30 days greater than this value to be eligible to request the sample. |
| ^^predicted_fulfillment_rank | string |  | The creators whose predicted rate of posting a shoppable video or LIVE after receiving a sample. - ALL. All creators regardless of the rate. - LOW. The creators whose rate is above or equal to low. - MEDIUM. The creators whose rate is above or equal to medium. - HIGH. The creators whose rate is high. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchSellerAffiliateOrders

This API allows the partner to retrieve a list of affiliate orders (orders which are affiliate-commission eligible) generated by a seller, returning the order ID and the product ID. Using this, the partner can track their affiliate-conversions on behalf of a seller, using the order ID.

**Path:** `/affiliate_seller/202410/orders/search`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/search-seller-affiliate-orders-202410

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Default: 20 Valid Range: [1-100] |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

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
| program_id | string |  | Filter orders by the associated affiliate program. This can be a campaign ID, target collaboration ID, or open collaboration ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^orders | array<object> |  | The returned list of orders. |
| ^^create_time | integer |  | The date and time when the order was created. Unix timestamp. |
| ^^delivery_time | integer |  | The date and time when the order was delivered. Unix timestamp. |
| ^^id | string |  | The order ID. |
| ^^skus | array<object> |  | The list of SKUs that are included in this order. |
| ^^^actual_cofunded_creator_bonus_amount | object |  | The portion of the actual creator bonus that you co-fund in commission boost. |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^actual_commission_base | object |  | The actual total sales value after deducting any refunds, used as a base for calculating commission. Formula: selling price * (order quantity - return/refund quantity) |
| ^^^^amount | string |  | The commission base amount. |
| ^^^^currency | string |  | The commission base currency. |
| ^^^actual_paid_commission | object |  | The actual commission the seller will pay on sales. Formula: actual commission base * commission rate |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^actual_paid_shop_ads_commission | object |  | The actual Shop Ads commission the seller will pay on sales. Formula: actual commission base * Shop Ads commission rate |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^campaign_id | string |  | The ID of the TAP campaign in which the product is enrolled. |
| ^^^commission_model | string |  | Determine order commission be calculated based on fixed commission model or tiering model |
| ^^^commission_rate | string |  | The commission rate established by the seller to be paid to creators involved in the collaboration, expressed in hundredths of a percent. For example, 1550 represents a commission rate of 15.50%. |
| ^^^commission_tier_setting | string |  | Between Seller & Creator percentagecommission. When tiering commission model applied, will return each tier's commission rate seller set. |
| ^^^content_id | string |  | The content identifier. |
| ^^^content_type | string |  | The content format of the creator content through which the order was created. Possible values: - SHOP - VIDEO - LIVE - PRE_LIVE - PROMOTION_PAGE - LINKSHARE |
| ^^^creator_username | string |  | The username of the creator that's participating in the specified open collaboration. |
| ^^^estimated_cofunded_creator_bonus_amount | object |  | The portion of the estimated creator bonus that you co-fund in commission boost. |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^estimated_commission_base | object |  | The estimated total sales value before deducting any refunds, used as a base for calculating commission. Formula: selling price * order quantity |
| ^^^^amount | string |  | The commission base amount. |
| ^^^^currency | string |  | The commission base currency. |
| ^^^estimated_paid_commission | object |  | The estimated commission that a seller will pay on sales. Formula: estimated commission base *  commission rate |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^estimated_paid_shop_ads_commission | object |  | The estimated Shop Ads commission that a seller will pay on sales. Formula: estimated commission base * Shop Ads commission rate |
| ^^^^amount | string |  | The commission amount. |
| ^^^^currency | string |  | The commission currency. |
| ^^^open_collaboration_id | string |  | The ID of the open collaboration in which the product is enrolled. |
| ^^^price | object |  | The SKU selling price information. |
| ^^^^amount | string |  | The price amount. |
| ^^^^currency | string |  | The price currency. |
| ^^^product_id | string |  | The product  ID in TikTok Shop. |
| ^^^quantity | integer |  | The SKU quantity for the order. |
| ^^^refunded_quantity | integer |  | The number of SKUs refunded. |
| ^^^returned_quantity | integer |  | The number of SKUs returned. |
| ^^^shop_ads_commission_rate | string |  | The commission rate for orders generated through Shop Ads. |
| ^^^target_collaboration_id | string |  | The ID of the target collaboration in which the product is enrolled. |
| ^^status | string |  | The order status. This is an enumerated type with values: * ALL * PROCESSING * COMPLETED * CANCELLED * FROZEN * DEDUCTED |
| ^total_count | integer |  | The total number of orders that matches the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetMessageintheConversation

Get chat history in one conversation.

**Path:** `/affiliate_seller/202412/conversation/{conversation_id}/messages`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-messageinthe-conversation-202412

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y | The conversation identifier. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The maximum number of queries. The maximum number is 20. |
| page_token | string |  | Pagination offset determines where you begin to query. It's empty when you raise your first request. |
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
| ^has_more | boolean |  | Whether there are any more messages. |
| ^messages | array<object> |  |  |
| ^^conversation_index | string |  | Index of the message in the conversation. Higher index corresponds to newer message. |
| ^^message_body | object |  | Message's content |
| ^^^content | string |  | Message content, in JSON serialized string. - TEXT: {"content": "simple text"} - PRODUCT_CARD: {"product_id": "12345"} - TARGET_INVITATION_CARD {"invitation_group_id": "1234"} - FREE_SAMPLE_CARD {"apply_id": "1234"} - IMAGE: { "height": "290", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "304" } - CRM_TEXT_WITH_IMAGE_CARD { "title":"abc", "content":"efg", "url":"https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290" } - CRM_TEXT_WITH_PRODUCTS_CARD { "title":"abc", "content":"efg", "productIds":[123,456,789,222] } - NOTIFICATION,SYSTEM {"content": "notification/system message"} - EMOTICONS { "height": "110", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "110" } |
| ^^^conversation_id | string |  | Conversation ID to which the message belongs. |
| ^^^create_time | integer |  | Message creation time, represented as a Unix timestamp (seconds). |
| ^^^id | string |  | Message ID. |
| ^^^sender_id | string |  | The message sender im id |
| ^^^type | string |  | Message type, with possible values: - TEXT - PRODUCT_CARD - TARGET_COLLABORATION_CARD - FREE_SAMPLE_CARD - IMAGE - CRM_TEXT_WITH_IMAGE_CARD - CRM_TEXT_WITH_PRODUCTS_CARD - NOTIFICATION - EMOTICONS - SYSTEM The response's message type support more type.Especially image, crm card,notification,emoticons and system. |
| ^next_page_token | string |  | Cursor for the next page request. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConversationList

Get User's Conversation list.

**Path:** `/affiliate_seller/202412/conversations`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-conversation-list-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The maximum number of queries. The maximum number is 50. |
| page_token | string |  | Pagination offset determines where you begin to query. It's empty when you raise your first request. |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `conversation` is returned. - If `false`, all fields in conversation` are returned. `true` by default. |
| conversation_status | string |  | Filter the list of IM conversations returned based on the status. Possible values: - ALL: Retrieve all conversations regardless of the status. - UNREAD: Retrieve all conversations with messages that the seller has not read yet. The messages stay unread until explicitly marked as read by calling [Mark Conversation Read](6791db761882810314a991a8). Replying to a message does not change the read / unread status. - UNREPLIED: Retrieve all conversations in which the seller is not the last message sender. This filter helps you to efficiently manage and prioritize conversations. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `data.conversation` is returned. - If `false`, all fields in `data.conversation` are returned. `true` by default. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^conversations | array<object> |  | The conversation list. |
| ^^avatar | string |  | The URL for the TikTok creator's avatar image file. |
| ^^creator_im_id | string |  | Creators' IM User ID. |
| ^^id | string |  | Conversation unique ID. |
| ^^unread_count | integer |  | Number of unread messages. |
| ^^username | string |  | The TikTok user name. |
| ^has_more | boolean |  | Whether there are more conversations. |
| ^next_page_token | string |  | Cursor for the next page request. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateConversationwithcreator

Get the existing conversation or create a new conversation with the specified TikTok creator for later communication.

**Path:** `/affiliate_seller/202412/conversations`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/create-conversationwithcreator-202412

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
| creator_id | string |  | Creators' TikTok User ID. |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `data.conversation` is returned. - If `false`, all fields in `data.conversation` are returned. `true` by default. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^avatar | string |  | The URL for the TikTok creator's avatar image file. |
| ^conversation_id | string |  | Conversion unique id. |
| ^creator_im_id | string |  | Creators' IM User ID. |
| ^is_new | boolean |  | Is it a new conversion or not. |
| ^unread_count | integer |  | Number of messages unread by the shop. |
| ^username | string |  | The TikTok creator's name. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetLatestUnreadMessages

Get the unread messages from the last minute.
You are recommended to use the Webhook, New Message Listener, for the message notification.

**Path:** `/affiliate_seller/202412/conversations/messages/list/newest`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-latest-unread-messages-202412

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
| ^newest_message_list | array<object> |  | The list of unread messages from the last minute. |
| ^^content | string |  | Message content, in JSON serialized string. - TEXT: {"content": "simple text"} - PRODUCT_CARD: {"product_id": "12345"} - TARGET_INVITATION_CARD {"invitation_group_id": "1234"} - FREE_SAMPLE_CARD {"apply_id": "1234"} - IMAGE: { "height": "290", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "304" } - CRM_TEXT_WITH_IMAGE_CARD { "title":"abc", "content":"efg", "url":"https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290" } - CRM_TEXT_WITH_PRODUCTS_CARD { "title":"abc", "content":"efg", "productIds":[123,456,789,222] } - NOTIFICATION,SYSTEM {"content": "notification/system message"} - EMOTICONS { "height": "110", "url": "https://tosv.boei18n.byted.org/obj/temai-im/FszkJ53nSapYG6KDaJQmqR3jjoZGwww304-290", "width": "110" } |
| ^^conversation_id | string |  | The converastion id to which the message belongs |
| ^^sender_id | string |  | sender's IM id |
| ^^type | string |  | Message type, with possible values: - TEXT - PRODUCT_CARD - TARGET_COLLABORATION_CARD - FREE_SAMPLE_CARD - IMAGE - CRM_TEXT_WITH_IMAGE_CARD - CRM_TEXT_WITH_PRODUCTS_CARD - NOTIFICATION - EMOTICONS - SYSTEM The response's message type support more type.Especially image, crm card,notification,emoticons and system. |
| ^^unread_message_count | integer |  | The number of unread messages of the sender in the conversation. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SendIMMessage

The API for sending IM messages.

**Path:** `/affiliate_seller/202412/conversations/{conversation_id}/messages`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/send-immessage-202412

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| conversation_id | string | Y | conversation_id |

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
| content | string |  | Message content, in JSON serialized string. Examples: - TEXT: {"content": "simple text"} - PRODUCT_CARD: {"product_id": "12345"} - TARGET_ COLLABORATION_CARD {"target_collaboration_id": "1234"} - FREE_SAMPLE_CARD {"apply_id": "1234"} IMAGE { "url":"https://p16-oec-va.ibyteimg.com/tos-maliva-i-o3syd03w52-us/2ca53c34ad8443e6b39f4e0153d3aed4~tplv-o3syd03w52-origin-image.image?from=1320446476", "width": 1280, "height": 720 } Note: You can get the value of url by calling [Upload Messages Image](https://partner.tiktokshop.com/docv2/page/upload-message-image-202511). target_collaboration_id is Invitation group id. |
| msg_type | string |  | Message type, with possible values: - TEXT - PRODUCT_CARD - TARGET_ COLLABORATION_CARD - FREE_SAMPLE_CARD - IMAGE |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^message_id | string |  | The message ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## MarkConversationRead

Mark the messages in the specified conversations to be read.

**Path:** `/affiliate_seller/202412/conversatons/read`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/mark-conversation-read-202412

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
| conversation_ids | array<string> |  | The array of conversations to read. After the API is called, all the messages in the specified conversations will be read, and the read timestamp is set to the time when the API is called. The length of the array must not exceed `20`. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^failed_conversation_ids | array<string> |  | The ID list of conversations failed to be set to read. You are suggested to retry the API. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateOpenCollaboration

This API allows the seller to create an open collaboration. You create an open collaboration by selecting products and setting a commission rate.

**Path:** `/affiliate_seller/202412/open_collaborations`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/create-open-collaboration-202412

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
| commission_rate | integer |  | The desired commission rate for the open collaboration. The desired commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `100`. |
| product_id | string |  | The product ID for adding to the affiliate open collaboration. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^open_collaboration | object |  | The open collaboration. |
| ^^effective_time | integer |  | The effective time of the open collaboration in Unix epoch time format. |
| ^^id | string |  | The open collaboration identifier. |
| ^^product_id | string |  | The product identifier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOpenCollaborationCreatorContentDetail

This API allows the seller to get the creator content details of specified open collaboration.

**Path:** `/affiliate_seller/202412/open_collaborations/creator_content_details`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/get-open-collaboration-creator-content-detail-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when you raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 100. |
| product_id | string | Y | The product ID that needs to be queried. |
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
| ^creator_content_details | array<object> |  | Creators' posting content details. |
| ^^creator_profile | object |  | Creator's profile details. |
| ^^^avatar | object |  | The creator's avatar details. |
| ^^^^url | string |  | The url of the creator's avatar. |
| ^^^follower_count | integer |  | Number of followers of the creator. |
| ^^^nickname | string |  | The creator's nickname. |
| ^^^username | string |  | The creator's username. |
| ^^live_count | integer |  | This field indicates the number of lives posted by the creator. |
| ^^promotion_end_time | integer |  | End time of creator promotion. |
| ^^promotion_status | string |  | Promotion status of the creator. Field values: - NORMAL: When the creator is promoting normally, it returns to NORMAL status - TERMINATING:When the creator is asked by the merchant to terminate the promotion, the status will return to TERMINATING, indicating that the creator's promotion rights will expire soon. |
| ^^video_count | integer |  | This field indicates the number of videos posted by the creator. |
| ^next_page_token | string |  | Next page token |
| ^product | object |  | Product details. |
| ^^id | string |  | Product's unique id. |
| ^^image_url | string |  | The product image url. |
| ^total_count | integer |  | Total count of creators that satisfy all the input search conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchOpenCollaboration

Retrieve all open collaboration information from merchants, including commission rate, add to showcase and post content creator count.

**Path:** `/affiliate_seller/202412/open_collaborations/search`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/search-open-collaboration-202412

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when you raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 100. |
| sort_order | string |  | Default value of "sort_order" is DESC. Enum: - ASC：means to sort data in ascending order - DESC：means to sort data in descending order |
| sort_field | string |  | Some sorting fields are as follows: - product_original_price: sort by products' original price. By default, the open collaborations are sorted in descending order by creation time. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Search based on the product name or product ID. Pass in the appropriate value based on the keyword_type above. |
| keyword_type | string |  | Pass in the parameter type which you use to query open collaborations. You can query based on: - PRODUCT_ID：If you use PRODUCT_ID  to search, you can search for open collaboration information for a specified product ID. - PRODUCT_NAME: If you use PRODUCT_NAME to search, you can fuzzy search for open collaboration information involving related product names. |
| top_level_category_id | string |  | The category of the searched product needs to be limited in this param. Prerequisites: - The value of field category_id must be greater than 0. - Currently, it only supports first-level categories |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Next page token |
| ^open_collaborations | array<object> |  | The open collaborations |
| ^^content_creator_count | integer |  | This field indicates the number of creators who posted the LIve or Video from open collaboration. |
| ^^current_commission | object |  | The commission information is currently in effect for this open collaboration. |
| ^^^end_time | integer |  | The effective end time of the commission rate. |
| ^^^rate | integer |  | The commission rate for this product is set by merchants for creators' public promotion. The range of this value is [100, 8000]. This value is expressed in 1/10000 increments. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^^start_time | integer |  | The time when the commission rate becomes effective. |
| ^^id | string |  | The open collaboration id |
| ^^product | object |  | The open collaboration bound product information. |
| ^^^id | string |  | Product's unique id. |
| ^^^inventory | integer |  | The inventory of this product. |
| ^^^main_image_url | string |  | The product image url. |
| ^^^original_price | object |  | The product's original price |
| ^^^^currency | string |  | Currency Symbol |
| ^^^^maximum_amount | string |  | The maximum original price of all skus of this product. |
| ^^^^minimum_amount | string |  | The minimum original price of all skus of this product. |
| ^^^status | string |  | Product's status. Field values: - LIVE: When the product is normal for sale, return to the LIVE status - OUT_OF_STOCK: When the product is out of stock for the consumer, the OUT_OF_STOCK state is returned - SELLER_DEACTIVATE:  When the product is deactivated by the merchant, the SELLER_DEACTIVATE status is returned - PLATFORM_DEACTIVATE: When the product is deactivated by the platform or is not available for sale, the PLATFORM_DEACTIVATE status is returned - GNE_REJECT: When the product is governed or the open collaboration is dismissed, the GNE_REJECT state is returned - DELETE: When the product is deleted, the DELETE status is returned - OTHER: When the product is in an unsaleable state, such as draft, frozen, review, etc, the OTHER status is returned |
| ^^^title | string |  | Product's name. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from open collaboration. |
| ^^status | string |  | Status of open collaboration. Field values: - NORMAL：NORMAL means the current open collaboration status is normal and in effect. - TERMINATING: TERMINATING means that the merchant has removed open collaboration and the open collaboration will expire soon. The expiration time can be found at the end_time of current_commission. The open collaborations which were removed and expired will not be returned in the response. |
| ^total_count | integer |  | Total count of products that satisfy all the input search conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QueryTargetCollaborationDetail

This API is used by Sellers to get target collaboration information.

**Path:** `/affiliate_seller/202412/target_collaborations/{target_collaboration_id}`
**Method:** `GET`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/query-target-collaboration-detail-202412

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | Target collaboration id. |

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
| ^target_collaboration | object |  | Target Collaboration detail. |
| ^^content_creator_count | integer |  | The number of creators who posted content featuring products from target collaboration. The count will only include the NORMAL state. |
| ^^creator_invited_count | integer |  | The count of creators invited in the target collaboration. The count will only include the NORMAL state. |
| ^^creators | array<object> |  | The information of creators in the target collaboration. |
| ^^^avatar | object |  | Data associated with the TikTok creator's profile avatar. |
| ^^^^url | string |  | The URL for the TikTok creator's avatar image file. |
| ^^^collaboration_status | string |  | The status of the creator in the current target cooperation. Field values: - NORMAL: The status of the creator in the current target collaboration is normal. - DELETING: The status of the creator in the current target collaboration is deleting.The creator's product promotion relationship in the DELETING status will end the delayed effectiveness status and flow to the DELETED status at 00:00 the next day. - DELETED: The status of the creator in the current target collaboration is deleted. |
| ^^^content_product_count | integer |  | This field indicates the number of products creator has posted video or live from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^nickname | string |  | The TikTok nick name. |
| ^^^product_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission rate for all products under Target Collaboration is effective. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current creator and some products, the commission rate will be based on TOP_CREATOR_PROGRAM. The products' commission under the current Target Collaboration will only be partially effective for the creator, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^selection_region | string |  | The regions in which the creator is eligible to promote products in showcases, videos, and live streams. |
| ^^^showcase_product_count | integer |  | This field indicates the number of products creator has added  to the showcase from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^username | string |  | The TikTok user name. |
| ^^end_time | integer |  | The end time of the target collaboration. |
| ^^free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^^^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration group. |
| ^^^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| ^^id | string |  | Target collaboration ID. |
| ^^message | string |  | Message seller has sent to creators about seller's  introduction and why excited to collaborate. |
| ^^name | string |  | Target collaboration name. |
| ^^product_count | integer |  | The count of products added in the target collaboration. The count will only include the NORMAL state. |
| ^^products | array<object> |  | The information of products in the target collaboration. |
| ^^^collaboration_status | string |  | The status of the product in the current target cooperation. Field values: - NORMAL: The status of the product in the current target collaboration is normal. - DELETING: The status of the product in the current target collaboration is deleting.Product in the DELETING state will end their delayed effectiveness state and move to the DELETED state at 00:00 the next day. - DELETED: The status of the product in the current target collaboration is deleted. |
| ^^^commission | object |  | Commission info. |
| ^^^^currency | string |  | The currency code. |
| ^^^^effective_time | string |  | Commission effective time. It is a timestamp. |
| ^^^^maximum_amount | string |  | The maximum estimated commission amount for all SKUs of this product. |
| ^^^^minimum_amount | string |  | The minimum estimated commission amount for all SKUs of this product. |
| ^^^^rate | integer |  | The commission rate in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must a minimum of 1000.  The range of this value is [100, 8000]. |
| ^^^commission_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission for a product will be the same for all creators. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current product and some creators, the commission rate will be based on TOP_CREATOR_PROGRAM. The product commission under the current Target Collaboration will be effective for some creators, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^id | string |  | The product identifier. |
| ^^^main_image_url | string |  | The product image url. |
| ^^^original_price | object |  | The original price of the product. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest original price of all SKUs of the product. |
| ^^^^minimum_amount | string |  | The lowest original price of all SKUs of the product. |
| ^^^status | string |  | Product's status. Field values: - LIVE: When the product is normal for sale, return to the LIVE status - OUT_OF_STOCK: When the product is out of stock for the consumer, the OUT_OF_STOCK state is returned - SELLER_DEACTIVATE:  When the product is deactivated by the merchant, the SELLER_DEACTIVATE status is returned - PLATFORM_DEACTIVATE: When the product is deactivated by the platform or is not available for sale, the PLATFORM_DEACTIVATE status is returned - GNE_REJECT: When the product is governed or the target collaboration is dismissed, the GNE_REJECT state is returned - DELETE: When the product is deleted, the DELETE status is returned - OTHER: When the product is in an unsaleable state, such as draft, frozen, review, etc, the OTHER status is returned |
| ^^^title | string |  | The product name. |
| ^^seller_contact_info | object |  | Contact information for the seller in the target collaboration. |
| ^^^email | string |  | Seller's email contact information. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from target collaboration. The count will only include the NORMAL state. |
| ^^start_time | integer |  | The start time of the target collaboration. |
| ^^type | string |  | The type of target collaboration. Field values: - STANDARD: The target collaboration is created by sellers manually selecting products and creators. - TOP_CREATOR_PROGRAM: The target collaboration created by seller joining TikTok Shop Top Creator Program, requiring only product submission. |
| ^^update_time | integer |  | The update time of the target collaboration. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConversationList

Get User's Conversation list.

**Path:** `/affiliate_seller/202505/conversations`
**Method:** `GET`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/get-conversation-list-202505

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The maximum number of queries. The maximum number is 50. |
| page_token | string |  | Pagination offset determines where you begin to query. It's empty when you raise your first request. |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `conversation` is returned. - If `false`, all fields in conversation` are returned. `true` by default. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `data.conversation` is returned. - If `false`, all fields in `data.conversation` are returned. `true` by default. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^conversations | array<object> |  | The conversation list. |
| ^^avatar | string |  | The URL for the TikTok creator's avatar image file. |
| ^^creator_im_id | string |  | Creators' IM User ID. |
| ^^id | string |  | Conversation unique ID. |
| ^^unread_count | integer |  | Number of unread messages. |
| ^^username | string |  | The TikTok user name. |
| ^has_more | boolean |  | Whether there are more conversations. |
| ^next_page_token | string |  | Cursor for the next page request. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchCreatoronMarketplace

This API is used by Sellers to search for Creators in the Creator Marketplace. Sellers can search based on filters such as GMV, keywords, and Creator follower demographics. All the data returned is for the last 30 days.

**Path:** `/affiliate_seller/202505/marketplace_creators/search`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-creatoron-marketplace-202505

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request |
| page_size | integer | Y | The value of "page_size" must be 12 or 20 |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| follower_demographics | object |  | Filtering creators by follower demographics |
| ^age_ranges | array<string> |  | Follower age filtering options, which are range intervals, include: AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^count_range | object |  | Follower count filtering |
| ^^count_ge | integer |  | The minimum value of follower count. The value passed in must be greater than or equal to 0 |
| ^^count_le | integer |  | The maximum value of follower count. - Generally, a value greater than or equal to 0 needs to be passed. If a value less than 0 is passed, it means that the field will not be filtered. |
| ^gender_distribution | object |  | Filtering creators by follower gender which includes: "male", "female" |
| ^^gender | string |  | A particular gender, "MALE" or "FEMALE" |
| ^^percentage_ge | integer |  | Greater than or equal to a certain percentage, scaled up by 10,000 times. For example, 6000 stands for 0.6 or 60% |
| gmv_ranges | array<string> |  | Filtering by GMV range intervals which include: GMV_RANGE_0_100: "0-100", GMV_RANGE_100_1000: "100-1000", GMV_RANGE_1000_10000: "1000-10000", GMV_RANGE_10000_AND_ABOVE: "10000+" For example: - If GMV_RANGE_0_100 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 100. - If GMV_RANGE_0_100 and GMV_RANGE_100_1000 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 1000. |
| keyword | string |  | Searching creators by keyword, matching based on TikTok Username and Nickname. |
| search_key | string |  | Caching search results improves api performance and ensures stable request results. You don't need to pass a value on the first call. For the second call, please pass the value returned in the response of the first call. |
| units_sold_ranges | array<string> |  | Filtering by sales volume range intervals which include: UNITS_SOLD_RANGE_0_10: "0-10", UNITS_SOLD_RANGE_10_100: "10-100", UNITS_SOLD_RANGE_100_1000: "100-1000", UNITS_SOLD_RANGE_1000_AND_ABOVE: "1000+" For example: - If UNITS_SOLD_RANGE_0_10 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 10. - If UNITS_SOLD_RANGE_0_10 and UNITS_SOLD_RANGE_10_100 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 100. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^creators | array<object> |  | Creator's basic information |
| ^^avatar | object |  | Creator's profile picture |
| ^^^url | string |  | URL of creator's avatar picture |
| ^^avg_ec_live_uv | integer |  | Average UV for creator's e-commerce live streams |
| ^^avg_ec_video_view_count | integer |  | Average views for creator's e-commerce videos |
| ^^category_ids | array<string> |  | It indicates the main product categories when the creator posts products. |
| ^^follower_count | integer |  | Follower count |
| ^^gmv | object |  | Creator GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^gmv_range | object |  | GMV range. Applicable if the target market is the US and the creator does not authorize sharing precise data. |
| ^^^currency | string |  | Currency symbol |
| ^^^formatted_range | string |  | The formatted range of GMV values associated with this creator. |
| ^^^maximum_amount | string |  | The maximum value of GMV range |
| ^^^minimum_amount | string |  | The minimum value of GMV range |
| ^^live_gmv | object |  | Live stream GMV If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Live stream GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^nickname | string |  | Creator's TikTok Nickname |
| ^^selection_region | string |  | Regions where the creator operates and promotes products |
| ^^top_follower_demographics | object |  | Top follower information of the creator |
| ^^^age_ranges | array<string> |  | Return the top 3 age ranges of the followers. Ranges are : AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^^^major_gender | object |  | Major gender of the followers |
| ^^^^gender | string |  | Top follower gender category of the creator, "MALE" or "FEMALE" |
| ^^^^percentage | integer |  | Percentage of top follower gender, scaled up by 10,000 times. For example, 6524 stands for 0.6524 or 65.24%. You can then infer that the opposite gender would be 0.3476 or 34.76%. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is US only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^formatted_range | string |  | The formatted range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. |
| ^^^maximum_amount | integer |  | The maximum value of sales volume range |
| ^^^minimum_amount | integer |  | The minimum value of sales volume range |
| ^^username | string |  | Creator's TikTok Username |
| ^^video_gmv | object |  | Video GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Video GMV value |
| ^^^currency | string |  | Currency symbol |
| ^next_page_token | string |  | Next page token |
| ^search_key | string |  | Caching search results improves api performance and ensures stable request results |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetMarketplaceCreatorPerformance

Get the Creator Affiliate's Marketplace information and performance metrics in the last 30 days.

**Path:** `/affiliate_seller/202505/marketplace_creators/{creator_user_id}`
**Method:** `GET`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/get-marketplace-creator-performance-202505

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_id | string | Y | Creators' TikTok User ID |

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
| ^creator | object |  | Data associated with the creator's TikTok profile. |
| ^^avatar | object |  | Metadata and data associated with the creator's TikTok profile avatar. |
| ^^^url | string |  | The URL for the creator's TikTok profile avatar. |
| ^^avg_commission_rate | integer |  | The average commission rate in hundredths of a percent. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^avg_commission_rate_range | object |  | The range of average commission rates associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^maximum_amount | integer |  | The largest average commission rate in hundredths of a percent. |
| ^^^minimum_amount | integer |  | The smallest average commission rate in hundredths of a percent. |
| ^^avg_ec_live_comment_count | integer |  | Average e-commerce live stream comments. |
| ^^avg_ec_live_like_count | integer |  | Average e-commerce live stream likes. |
| ^^avg_ec_live_share_count | integer |  | Average e-commerce live stream shares. |
| ^^avg_ec_live_view_count | integer |  | Average live stream views with promoted products. |
| ^^avg_ec_video_comment_count | integer |  | Average e-commerce video comments. |
| ^^avg_ec_video_like_count | integer |  | Average e-commerce video likes. |
| ^^avg_ec_video_play_count | integer |  | The average number of number of e-commerce video plays. |
| ^^avg_ec_video_share_count | integer |  | Average e-commerce video shares. |
| ^^avg_gmv_per_buyer | object |  | Average GMV per buyer metadata and data associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The average GMV per buyer amount. |
| ^^^currency | string |  | The currency code. |
| ^^avg_gmv_per_buyer_range | object |  | The range of average GMV per buyer associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of average GMV per buyer associated with the creator. |
| ^^^maximum_amount | string |  | The largest average GMV per buyer. |
| ^^^minimum_amount | string |  | The smallest average GMV per buyer. |
| ^^bio_description | string |  | The biography description associated with the creator. |
| ^^brand_collaboration_count | integer |  | The total number of brands with which the creator has previously collaborated. |
| ^^category_gmv_distribution | array<object> |  | GMV distribution by category. |
| ^^^category_id | string |  | The top-level category identifier. |
| ^^^value | string |  | GMV associated with the category in hundredths of a percent. |
| ^^category_ids | array<string> |  | A list of category identifiers associated with the products for which the creator has created posts. |
| ^^content_gmv_distribution | array<object> |  | GMV associated with creator content by content type. |
| ^^^content_type | string |  | The content type. This an enumerated type with values: - VIDEO - LIVE - SHOWCASE |
| ^^^value | string |  | Content GMV distribution value in hundredths of a percent. |
| ^^ec_live_count | integer |  | The number of e-commerce livestreams associated with the creator. |
| ^^ec_live_engagement_rate | string |  | E-commerce live stream engagement rate in hundredths of a percent. For example, `6000` is 60%. |
| ^^ec_video_count | integer |  | The number of e-commerce video posts associated with the creator. |
| ^^follower_count | integer |  | The creator's follower count. |
| ^^gmv | object |  | Gross merchandise value (GMV) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^gmv_range | object |  | The range of GMV values associated with this creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of GMV values associated with this creator. |
| ^^^maximum_amount | string |  | The highest GMV value. |
| ^^^minimum_amount | string |  | The lowest GMV value. |
| ^^gpm | object |  | GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^gpm_range | object |  | The range of GPM values associated with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of GPM values associated with the creator. |
| ^^^maximum_amount | string |  | The highest GPM value. |
| ^^^minimum_amount | string |  | The lowest GPM value. |
| ^^live_gmv | object |  | Livestream GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | Total livestream GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm | object |  | Livestream GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The livestream GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm_range | object |  | The range of livestream GPM values associted with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of livestream GPM values associted with the creator. |
| ^^^maximum_amount | string |  | The highest livestream GPM value. |
| ^^^minimum_amount | string |  | The lowest livestream GPM value. |
| ^^nickname | string |  | TikTok nickname. |
| ^^product_original_price_range | object |  | Original promoted product price metadata and data associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The higest original promoted product price. |
| ^^^minimum_amount | string |  | The lowest original promoted product price. |
| ^^profile_tt_uri | string |  | The URL for the creator's TikTok profile page. |
| ^^promoted_product_num | integer |  | The number of promoted products associated with the creator. |
| ^^selection_region | string |  | The region associated with the creator. |
| ^^top_collaborated_brand_ids | array<string> |  | A list of the top 10 brands with which the creator has previously collaborated. |
| ^^units_sold | integer |  | The total number of units sold. Units are indexed to SKU. Note that if the creator has not given permission for precise data sharing, this property will not be present. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^formatted_range | string |  | The formatted range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. |
| ^^^maximum_amount | integer |  | The highest number of units sold. |
| ^^^minimum_amount | integer |  | The lowest number of units sold. |
| ^^username | string |  | TikTok user name. |
| ^^video_gmv | object |  | The video GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total video GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm | object |  | Video GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The video GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm_range | object |  | The range of video GPM values associted with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of video GPM values associted with the creator. |
| ^^^maximum_amount | string |  | The highest video GPM value. |
| ^^^minimum_amount | string |  | The lowest video GPM value. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchSampleApplications

This API is provided for sellers to query sample applications based on various criteria such as products, creators, or application statuses. By using this API, sellers can retrieve detailed information about sample application records, including the creator's information and the specifics of each application.

**Path:** `/affiliate_seller/202507/sample_applications/search`
**Method:** `POST`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-202507

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer |  | The value of "page_size" must be greater than 0 and less than or equal to 50. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_id | string |  | TikTok User ID of a creator |
| order_id | string |  | Main order ID associated with a sample order when the sample application is approved by seller. |
| product_id | string |  | The unique identifier of a product. It is used to specify which product's sample application details are being queried. |
| status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: Open collaboration has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. This field allows for tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |
| target_collabration_id | string |  | The unique ID generated after creating a target collaboration. |
| title | string |  | Product name, supports fuzzy search queries. It allows sellers to search for products by name when managing sample applications. |
| username | string |  | TikTok User Name of a creator, supports fuzzy search |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Page token to query next page orders, last page is empty string |
| ^sample_applications | array<object> |  | The sample applications from creators |
| ^^approve_expiration_time | integer |  | The expire time for a seller to approve a sample application. |
| ^^available_quantity | integer |  | The remaining stock quota of a sample product. |
| ^^commission_rate | string |  | The commission rate for this product is set by merchants for creators. - The range of this value is [0.01, 0.8]. |
| ^^creator | object |  | Creator detailed information. It includes various details such as the creator's TikTok user name, TikTok user id, and performance metrics related to creator e-commerce activities, such as sales, fulfillment rates, and other relevant statistics. |
| ^^^avatar_url | string |  | The URL of the creator's avatar image |
| ^^^content_count | integer |  | The number of contents a creator has posted in the last 30 days. It is formatted as an integer. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^ec_video_view | integer |  | The median number of creators' shoppable video views over the past 30 days. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^follower_count | integer |  | The number of creator's followers |
| ^^^fulfillment_percentage | string |  | Sample fulfillment rate of a creator received sample from seller over the past 90 days, formatted as a floating-point percentage with two decimal places (e.g., "60.85%"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^gmv | object |  | GMV generated by a creators' shoppable content over the past 30 days. It is formatted as a floating-point number with a currency symbol (e.g., "$1234.56"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^^amount | string |  | GMV amount |
| ^^^^currency | string |  | currency |
| ^^^nickname | string |  | TikTok Nick Name of a creator |
| ^^^user_id | string |  | TikTok User ID of a creator |
| ^^^username | string |  | TikTok User Name of a creator |
| ^^disapprovable_reasons | array<string> |  | The reasons why can not approve the sample application |
| ^^fulfillment_status | string |  | It indicates the current status of the fulfillment process. The possible values are: - PENDING: The creator is yet to fulfill the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator has been exempted from the fulfillment obligation. |
| ^^id | string |  | The unique id of sample request application ID |
| ^^is_approvable | boolean |  | The sample application can be approved or not. |
| ^^order_id | string |  | The sample order is generated after the sample application is approved by seller |
| ^^partner_name | string |  | The name of the partner if the sample application is submitted on behalf of a creator by an agency. It is only populated when an agency handles the application process instead of the creator directly. |
| ^^product | object |  | product information |
| ^^^id | string |  | The product identifier. |
| ^^^sku_id | string |  | The unique id of product sku which creator apply for as sample. |
| ^^^sku_image_url | string |  | The URL of SKU image. |
| ^^^sku_name | string |  | The description of sku |
| ^^^title | string |  | The product name of the product. |
| ^^shipment_expiration_time | integer |  | The deadline for a seller to ship a sample for a sample application. |
| ^^status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: The open collaboration plan has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has finished creating the content. |
| ^^tracking_number | string |  | The logistics tracking number for the sample application order |
| ^total_count | integer |  | total count |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerReviewSampleApplications

This API allows the seller to approve or reject the creator's sample application in an open collaboration. When rejecting an application, the seller must provide a specific reason. This API facilitates the management of sample applications by giving sellers the ability to review and update applications according to their criteria and requirements.

**Path:** `/affiliate_seller/202507/sample_applications/{application_id}/review`
**Method:** `POST`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-review-sample-applications-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| application_id | string | Y | The unique id of sample request application ID |

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
| reject_reason | string |  | The reason why a seller rejected a creator's sample application. The possible enumerated values are: - NOT_MATCH: The creator does not meet the seller's collaboration requirements. - OFFLINE: The product has been taken offline. - OUT_OF_STOCK: The product is temporarily out of stock. - OTHER: Any other reason not covered by the above categories. Required if the review_result is set to REJECT This field allows the seller to specify the reason for rejecting a sample application, providing clarity to the creator regarding the rejection. |
| review_result | string |  | The audit action to be taken on a sample application record by the seller. The field accepts one of four enumerated values: - APPROVE: Approves the sample application. - REJECT: Rejects the sample application. This field allows the seller to specify the desired operation to manage the sample application record effectively. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateConversationwithcreator

Get the existing conversation or create a new conversation with the specified TikTok creator for later communication.

**Path:** `/affiliate_seller/202508/conversations`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/create-conversationwithcreator-202508

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
| creator_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| only_need_conversation_id | boolean |  | - If `true`, only `conversation_id` in `data.conversation` is returned. - If `false`, all fields in `data.conversation` are returned. `true` by default. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^avatar | string |  | The URL for the TikTok creator's avatar image file. |
| ^conversation_id | string |  | Conversion unique id. |
| ^creator_im_id | string |  | Creators' IM User ID. |
| ^is_new | boolean |  | Is it a new conversion or not. |
| ^unread_count | integer |  | Number of messages unread by the shop. |
| ^username | string |  | The TikTok creator's name. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchCreatoronMarketplace

This API is used by Sellers to search for Creators in the Creator Marketplace. Sellers can search based on filters such as GMV, keywords, and Creator follower demographics. All the data returned is for the last 30 days.

**Path:** `/affiliate_seller/202508/marketplace_creators/search`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-creatoron-marketplace-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request |
| page_size | integer | Y | The value of "page_size" must be 12 or 20 |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| advanced_filters | object |  | Advanced filters are specific to each country. We will provide a separate endpoint which allows you to query which filters are available for which country. |
| ^category_pro | array<string> |  | Get the available "Category Pro" categories available. Category Pro is a specific label given to Creators that regularly post about one product category and have generated most of their sales in that Category in the past 60 days - Beauty and Self Care - Fashion and Style - Health and Wellness - Home - Men's Style - Pet Supplies - Sports and Outdoor - Tech, Office and Books See [Get Seller Search Creator Marketplace Advanced Filters](https://partner.tiktokshop.com/docv2/page/get-seller-search-creator-marketplace-advanced-filters-202601) for the country-specific category pro enums. |
| ^creator_level | array<string> |  | Supported creator levels are country/region-specific. Always fetch the valid creator level enums from the Get Seller Search [Creator Marketplace Advanced Filters](https://partner.tiktokshop.com/docv2/page/get-seller-search-creator-marketplace-advanced-filters-202601) endpoint before calling this API. |
| ^language | array<string> |  | Supported languages vary by country. If you pass an unsupported language value, the API returns an error. See [Get Seller Search Creator Marketplace Advanced Filters](https://partner.tiktokshop.com/docv2/page/get-seller-search-creator-marketplace-advanced-filters-202601) for the country-specific language enums. |
| affiliate_data | object |  | Object which contains affiliate based data |
| ^avg_commission_rate | string |  | - ALL - LESS_THAN_20% - LESS_THAN_15% - LESS_THAN_10% - LESS_THAN_5% Creator's average commission rate range based on showcase products, sales, and promoted products in the last 30 days. You can only pick one value. |
| ^creator_agency_staus | string |  | - AGENCY_MANAGED - INDEPENDENT |
| ^is_fast_growing | boolean |  | Top 10% of creators with the greatest increase in transactions, revenue, shoppable videos, live views, or followers in the last 30 days |
| ^not_invited_l90_days | boolean |  | True/False Select this filter to see creators you haven't invited in the last 90 days |
| ^post_rate | string |  | These categories represent how often a creator posts a shoppable video or LIVE after receiving a sample. - All - OK - GOOD - BETTER Every country has its own benchmark based on what is a GOOD vs BETTER fulfillment rate. BETTER is always going to have the highest fulfillment rate, including 100% fulfillment rate. |
| category | array<object> |  | Object for category filters: [Get Categories](https://partner.tiktokshop.com/docv2/page/get-categories-202309) |
| ^child_category_id_list | array<string> |  | If you are using the category ID for a child category, you must pass the parent category as well. A child category is only 1 level deeper than the parent category. We do not support going deeper down the category tree (some countries have 4 levels, others have 7) |
| ^parent_category_id | string |  | Category of the parent category. If you are only using a parent category, you do not need to pass in a child category ID. |
| content_performance | object |  | Object containing content performance filters |
| ^avg_engagement_rate | string |  | Average engagement rate more than 0-20. You can only filter by increments of 1% point, up to 20%. |
| ^avg_live_avg_viewers_ge | string |  | Average LIVE views greater than or equal to Pick any whole number between 0 and 100,000, and we will return all results with average video views greater than that number. You can only pass in average LIVE or average shoppable LIVE. Using both filters will cause the API call to fail |
| ^avg_shopable_engagement_rate | string |  | Average shoppable engagement rate more than 0-20. You can only filter by increments of 1% point, up to 20%. |
| ^avg_shoppable_live_avg_viewers_ge | string |  | Average shoppable LIVE viewers greater than or equal to Pick any whole number between 0 and 100,000, and we will return all results with average video views greater than that number. You can only pass in average LIVE or average shoppable LIVE. Using both filters will cause the API call to fail |
| ^avg_shoppable_video_views | string |  | You can pass in average shoppable video views anywhere between 0 and 100k Pick any whole number between 0 and 100,000, and we will return all results with average shoppable video views greater than that number. You can only pass in Average Video Views OR Average Shoppable Video Views. Using both filters will cause the API call to fail. |
| ^avg_video_views | string |  | Average Video Views more than You can pass in average video views anywhere between 0 and 100k Pick any whole number between 0 and 100,000, and we will return all results with average video views greater than that number. You can only pass in Average Video Views OR Average Shoppable Video Views. Using both filters will cause the API call to fail. |
| follower_demographics | object |  | Filtering creators by follower demographics |
| ^age_ranges | array<string> |  | Follower age filtering options, which are range intervals, include: AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^count_range | object |  | Follower count filtering |
| ^^count_ge | integer |  | The minimum value of follower count. The value passed in must be greater than or equal to 0 |
| ^^count_le | integer |  | The maximum value of follower count. - Generally, a value greater than or equal to 0 needs to be passed. If a value less than 0 is passed, it means that the field will not be filtered. |
| ^gender_distribution | object |  | Filtering creators by follower gender which includes: "male", "female" |
| ^^gender | string |  | A particular gender, "MALE" or "FEMALE" |
| ^^percentage_ge | integer |  | Greater than or equal to a certain percentage, scaled up by 10,000 times. For example, 6000 stands for 0.6 or 60% |
| gmv_ranges | array<string> |  | Filtering by GMV range intervals which include: GMV_RANGE_0_100: "0-100", GMV_RANGE_100_1000: "100-1000", GMV_RANGE_1000_10000: "1000-10000", GMV_RANGE_10000_AND_ABOVE: "10000+" For example: - If GMV_RANGE_0_100 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 100. - If GMV_RANGE_0_100 and GMV_RANGE_100_1000 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 1000. |
| keyword | string |  | Searching creators by keyword, matching based on TikTok Username and Nickname. |
| search_key | string |  | Caching search results improves api performance and ensures stable request results. You don't need to pass a value on the first call. For the second call, please pass the value returned in the response of the first call. |
| units_sold_ranges | array<string> |  | Filtering by sales volume range intervals which include: UNITS_SOLD_RANGE_0_10: "0-10", UNITS_SOLD_RANGE_10_100: "10-100", UNITS_SOLD_RANGE_100_1000: "100-1000", UNITS_SOLD_RANGE_1000_AND_ABOVE: "1000+" For example: - If UNITS_SOLD_RANGE_0_10 is passed, it means filtering the creator data that is greater than or equal to 0 and less than or equal to 10. - If UNITS_SOLD_RANGE_0_10 and UNITS_SOLD_RANGE_10_100 are passed, it means to filter the creator data that is greater than or equal to 0 and less than or equal to 100. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^creators | array<object> |  | Creator's basic information |
| ^^avatar | object |  | Creator's profile picture |
| ^^^url | string |  | URL of creator's avatar picture |
| ^^avg_ec_live_uv | integer |  | Average UV for creator's e-commerce live streams |
| ^^avg_ec_video_view_count | integer |  | Average views for creator's e-commerce videos |
| ^^category_ids | array<string> |  | It indicates the main product categories when the creator posts products. |
| ^^creator_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^^follower_count | integer |  | Follower count |
| ^^gmv | object |  | Creator GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^gmv_range | object |  | GMV range. Applicable if the target market is the US and the creator does not authorize sharing precise data. |
| ^^^currency | string |  | Currency symbol |
| ^^^formatted_range | string |  | The formatted range of GMV values associated with this creator. |
| ^^^maximum_amount | string |  | The maximum value of GMV range |
| ^^^minimum_amount | string |  | The minimum value of GMV range |
| ^^live_gmv | object |  | Live stream GMV If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Live stream GMV value |
| ^^^currency | string |  | Currency symbol |
| ^^nickname | string |  | Creator's TikTok Nickname |
| ^^selection_region | string |  | Regions where the creator operates and promotes products |
| ^^top_follower_demographics | object |  | Top follower information of the creator |
| ^^^age_ranges | array<string> |  | Return the top 3 age ranges of the followers. Ranges are : AGE_RANGE_18_24: "18-24", AGE_RANGE_25_34: "25-34", AGE_RANGE_35_44: "35-44", AGE_RANGE_45_54: "45-54", AGE_RANGE_55_AND_ABOVE: "55+" |
| ^^^major_gender | object |  | Major gender of the followers |
| ^^^^gender | string |  | Top follower gender category of the creator, "MALE" or "FEMALE" |
| ^^^^percentage | integer |  | Percentage of top follower gender, scaled up by 10,000 times. For example, 6524 stands for 0.6524 or 65.24%. You can then infer that the opposite gender would be 0.3476 or 34.76%. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is US only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^formatted_range | string |  | The formatted range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. |
| ^^^maximum_amount | integer |  | The maximum value of sales volume range |
| ^^^minimum_amount | integer |  | The minimum value of sales volume range |
| ^^username | string |  | Creator's TikTok Username |
| ^^video_gmv | object |  | Video GMV-related information If the creator does not authorize sharing precise data, this will be omitted. |
| ^^^amount | string |  | Video GMV value |
| ^^^currency | string |  | Currency symbol |
| ^next_page_token | string |  | Next page token |
| ^search_key | string |  | Caching search results improves api performance and ensures stable request results |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetMarketplaceCreatorPerformance

Get the Creator Affiliate's Marketplace information and performance metrics in the last 30 days.

**Path:** `/affiliate_seller/202508/marketplace_creators/{creator_user_id}`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-marketplace-creator-performance-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_id | string | Y | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |

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
| ^creator | object |  | Data associated with the creator's TikTok profile. |
| ^^avatar | object |  | Metadata and data associated with the creator's TikTok profile avatar. |
| ^^^url | string |  | The URL for the creator's TikTok profile avatar. |
| ^^avg_commission_rate | integer |  | The average commission rate in hundredths of a percent. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^avg_commission_rate_range | object |  | The range of average commission rates associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^maximum_amount | integer |  | The largest average commission rate in hundredths of a percent. |
| ^^^minimum_amount | integer |  | The smallest average commission rate in hundredths of a percent. |
| ^^avg_ec_live_comment_count | integer |  | Average e-commerce live stream comments. |
| ^^avg_ec_live_like_count | integer |  | Average e-commerce live stream likes. |
| ^^avg_ec_live_share_count | integer |  | Average e-commerce live stream shares. |
| ^^avg_ec_live_view_count | integer |  | Average live stream views with promoted products. |
| ^^avg_ec_video_comment_count | integer |  | Average e-commerce video comments. |
| ^^avg_ec_video_like_count | integer |  | Average e-commerce video likes. |
| ^^avg_ec_video_play_count | integer |  | The average number of number of e-commerce video plays. |
| ^^avg_ec_video_share_count | integer |  | Average e-commerce video shares. |
| ^^avg_gmv_per_buyer | object |  | Average GMV per buyer metadata and data associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The average GMV per buyer amount. |
| ^^^currency | string |  | The currency code. |
| ^^avg_gmv_per_buyer_range | object |  | The range of average GMV per buyer associated with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of average GMV per buyer associated with the creator. |
| ^^^maximum_amount | string |  | The largest average GMV per buyer. |
| ^^^minimum_amount | string |  | The smallest average GMV per buyer. |
| ^^bio_description | string |  | The biography description associated with the creator. |
| ^^brand_collaboration_count | integer |  | The total number of brands with which the creator has previously collaborated. |
| ^^category_gmv_distribution | array<object> |  | GMV distribution by category. |
| ^^^category_id | string |  | The top-level category identifier. |
| ^^^value | string |  | GMV associated with the category in hundredths of a percent. |
| ^^category_ids | array<string> |  | A list of category identifiers associated with the products for which the creator has created posts. |
| ^^content_gmv_distribution | array<object> |  | GMV associated with creator content by content type. |
| ^^^content_type | string |  | The content type. This an enumerated type with values: - VIDEO - LIVE - SHOWCASE |
| ^^^value | string |  | Content GMV distribution value in hundredths of a percent. |
| ^^ec_live_count | integer |  | The number of e-commerce livestreams associated with the creator. |
| ^^ec_live_engagement_rate | string |  | E-commerce live stream engagement rate in hundredths of a percent. For example, `6000` is 60%. |
| ^^ec_video_count | integer |  | The number of e-commerce video posts associated with the creator. |
| ^^ec_video_engagement_rate | string |  | The number of post engagements (likes, shares, and comments) divided by the total video views averaged across the videos in the last 30 days. For example, 3000 stands for 0.3 or 30% |
| ^^follower_age | array<object> |  | A list of key–value pairs representing the distribution of followers by age range. |
| ^^^key | string |  | The age range (e.g., "18–23"). |
| ^^^value | string |  | The proportion of followers in this age range, expressed as a decimal (e.g., 0.2500 = 25.00%). |
| ^^follower_count | integer |  | The creator's follower count. |
| ^^follower_gender | array<object> |  | A list of key–value pairs representing the distribution of followers by gender. |
| ^^^key | string |  | The gender (e.g., "Male", "Female"). |
| ^^^value | string |  | The proportion of followers of this gender, expressed as a decimal (e.g., 0.5000 = 50.00%). |
| ^^follower_location | array<object> |  | A list of key–value pairs representing the distribution of followers by location. |
| ^^^key | string |  | The location, use [TWO-LETTER STATE AND TERRITORY ABBREVIATIONS](https://www.faa.gov/air_traffic/publications/atpubs/cnt_html/appendix_a.html) |
| ^^^value | string |  | The proportion of followers from this location, expressed as a decimal (e.g., 0.3705 = 37.05%). |
| ^^gmv | object |  | Gross merchandise value (GMV) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^gmv_range | object |  | The range of GMV values associated with this creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of GMV values associated with this creator. |
| ^^^maximum_amount | string |  | The highest GMV value. |
| ^^^minimum_amount | string |  | The lowest GMV value. |
| ^^gpm | object |  | GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^gpm_range | object |  | The range of GPM values associated with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of GPM values associated with the creator. |
| ^^^maximum_amount | string |  | The highest GPM value. |
| ^^^minimum_amount | string |  | The lowest GPM value. |
| ^^live_gmv | object |  | Livestream GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | Total livestream GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm | object |  | Livestream GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The livestream GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^live_gpm_range | object |  | The range of livestream GPM values associted with the creator. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of livestream GPM values associted with the creator. |
| ^^^maximum_amount | string |  | The highest livestream GPM value. |
| ^^^minimum_amount | string |  | The lowest livestream GPM value. |
| ^^nickname | string |  | TikTok nickname. |
| ^^post_rate | string |  | The projected rate at which a creator is likely to post a shoppable video or LIVE after receiving a sample. For example, 3000 stands for 0.3 or 30% |
| ^^pps | string |  | Promotion Performance Score (PPS) The score reflects the quality of a creator's shoppable content and product selection over the past 90 days. A high score may indicate a better shopping experience, with fewer potential refunds or negative reviews. |
| ^^product_original_price_range | object |  | Original promoted product price metadata and data associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^^maximum_amount | string |  | The higest original promoted product price. |
| ^^^minimum_amount | string |  | The lowest original promoted product price. |
| ^^profile_tt_uri | string |  | The URL for the creator's TikTok profile page. |
| ^^promoted_product_num | integer |  | The number of promoted products associated with the creator. |
| ^^rating | string |  | Rating from sellers who worked with this creator |
| ^^selection_region | string |  | The region associated with the creator. |
| ^^top_collaborated_brand_ids | array<string> |  | A list of the top 10 brands with which the creator has previously collaborated. |
| ^^units_sold | integer |  | The total number of units sold. Units are indexed to SKU. Note that if the creator has not given permission for precise data sharing, this property will not be present. |
| ^^units_sold_range | object |  | The range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. Note that this property is included if the target market is `US` only. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^formatted_range | string |  | The formatted range of minimum number of units sold to maximum number of units sold over the lifetime of the creator account. |
| ^^^maximum_amount | integer |  | The highest number of units sold. |
| ^^^minimum_amount | integer |  | The lowest number of units sold. |
| ^^username | string |  | TikTok user name. |
| ^^video_gmv | object |  | The video GMV metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The total video GMV associated with the creator. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm | object |  | Video GMV per mille (GPM) metadata and data associated with the creator. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^amount | string |  | The video GPM amount. |
| ^^^currency | string |  | The currency code. |
| ^^video_gpm_range | object |  | The range of video GPM values associted with the creator. Note that this property is included if the target market is `US`. Note that if the creator has not given permission for precise data sharing, these properties will not be present. |
| ^^^currency | string |  | The currency code. |
| ^^^formatted_range | string |  | The formatted range of video GPM values associted with the creator. |
| ^^^maximum_amount | string |  | The highest video GPM value. |
| ^^^minimum_amount | string |  | The lowest video GPM value. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOpenCollaborationCreatorContentDetail

This API allows the seller to get the creator content details of specified open collaboration.

**Path:** `/affiliate_seller/202508/open_collaborations/creator_content_details`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-open-collaboration-creator-content-detail-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when you raise your first request. |
| page_size | integer | Y | The value of "page_size" must be greater than 0 and less than or equal to 100. |
| product_id | string | Y | The product ID that needs to be queried. |
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
| ^creator_content_details | array<object> |  | Creators' posting content details. |
| ^^creator_profile | object |  | Creator's profile details. |
| ^^^avatar | object |  | The creator's avatar details. |
| ^^^^url | string |  | The url of the creator's avatar. |
| ^^^creator_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^^^follower_count | integer |  | Number of followers of the creator. |
| ^^^nickname | string |  | The creator's nickname. |
| ^^^username | string |  | The creator's username. |
| ^^live_count | integer |  | This field indicates the number of lives posted by the creator. |
| ^^promotion_end_time | integer |  | End time of creator promotion. |
| ^^promotion_status | string |  | Promotion status of the creator. Field values: - NORMAL: When the creator is promoting normally, it returns to NORMAL status - TERMINATING:When the creator is asked by the merchant to terminate the promotion, the status will return to TERMINATING, indicating that the creator's promotion rights will expire soon. |
| ^^video_count | integer |  | This field indicates the number of videos posted by the creator. |
| ^next_page_token | string |  | Next page token |
| ^product | object |  | Product details. |
| ^^id | string |  | Product's unique id. |
| ^^image_url | string |  | The product image url. |
| ^total_count | integer |  | Total count of creators that satisfy all the input search conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveCreatorFromOpenCollaboration

This API is used to remove creators from open collaboration. Please note, due to current platform design, creators can still rejoin an open collaboration after removal. Partners/Sellers can call this API again to remove the creator again.

**Path:** `/affiliate_seller/202508/open_collaborations/{open_collaboration_id}/remove_creator`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-creator-from-open-collaboration-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| open_collaboration_id | string | Y | Open collaboration ID. This API is only applicable to the seller removing creators from open collaboration. |

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
| creator_user_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| product_id | string |  | The product identifier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SellerSearchSampleApplications

This API is provided for sellers to query sample applications based on various criteria such as products, creators, or application statuses. By using this API, sellers can retrieve detailed information about sample application records, including the creator's information and the specifics of each application.

**Path:** `/affiliate_seller/202508/sample_applications/search`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-search-sample-applications-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| page_size | integer |  | The value of "page_size" must be greater than 0 and less than or equal to 50. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_user_oepn_id | string |  | TikTok User ID of a creator |
| order_id | string |  | Main order ID associated with a sample order when the sample application is approved by seller. |
| product_id | string |  | The unique identifier of a product. It is used to specify which product's sample application details are being queried. |
| status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: Open collaboration has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has posted the content. This field allows for tracking the status of a sample application throughout its lifecycle, providing visibility into each stage of the process for sellers and creators. |
| target_collabration_id | string |  | The unique ID generated after creating a target collaboration. |
| title | string |  | Product name, supports fuzzy search queries. It allows sellers to search for products by name when managing sample applications. |
| username | string |  | TikTok User Name of a creator, supports fuzzy search |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Page token to query next page orders, last page is empty string |
| ^sample_applications | array<object> |  | The sample applications from creators |
| ^^approve_expiration_time | integer |  | The expire time for a seller to approve a sample application. |
| ^^available_quantity | integer |  | The remaining stock quota of a sample product. |
| ^^commission_rate | string |  | The commission rate for this product is set by merchants for creators. - The range of this value is [0.01, 0.8]. |
| ^^creator | object |  | Creator detailed information. It includes various details such as the creator's TikTok user name, TikTok user id, and performance metrics related to creator e-commerce activities, such as sales, fulfillment rates, and other relevant statistics. |
| ^^^avatar_url | string |  | The URL of the creator's avatar image |
| ^^^content_count | integer |  | The number of contents a creator has posted in the last 30 days. It is formatted as an integer. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^creator_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^^^ec_video_view | integer |  | The median number of creators' shoppable video views over the past 30 days. If the creator has not authorized the sharing of this information, the field returns an empty string. |
| ^^^follower_count | integer |  | The number of creator's followers |
| ^^^fulfillment_percentage | string |  | Sample fulfillment rate of a creator received sample from seller over the past 90 days, formatted as a floating-point percentage with two decimal places (e.g., "60.85%"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^gmv | object |  | GMV generated by a creators' shoppable content over the past 30 days. It is formatted as a floating-point number with a currency symbol (e.g., "$1234.56"). If the creator has not authorized the disclosure of this information, the field returns an empty string. |
| ^^^^amount | string |  | GMV amount |
| ^^^^currency | string |  | currency |
| ^^^nickname | string |  | TikTok Nick Name of a creator |
| ^^^username | string |  | TikTok User Name of a creator |
| ^^disapprovable_reasons | array<string> |  | The reasons why can not approve the sample application |
| ^^fulfillment_status | string |  | It indicates the current status of the fulfillment process. The possible values are: - PENDING: The creator is yet to fulfill the content creation obligation. - ONGOING: Fulfillment is in progress; content has been created and is being evaluated against criteria. - SUCCEED: Fulfillment has been successfully completed; the content meets the required standards. - FAILED: Fulfillment failed; the content did not meet the required standards. - OVERDUE: Fulfillment is overdue; the creator did not meet the deadline. - SUSPEND: Fulfillment has been suspended. - CANCELLED: Fulfillment has been cancelled, either by the creator or due to operational reasons. - EXEMPTED: The creator has been exempted from the fulfillment obligation. |
| ^^id | string |  | The unique id of sample request application ID |
| ^^is_approvable | boolean |  | The sample application can be approved or not. |
| ^^order_id | string |  | The sample order is generated after the sample application is approved by seller |
| ^^partner_name | string |  | The name of the partner if the sample application is submitted on behalf of a creator by an agency. It is only populated when an agency handles the application process instead of the creator directly. |
| ^^product | object |  | product information |
| ^^^id | string |  | The product identifier. |
| ^^^sku_id | string |  | The unique id of product sku which creator apply for as sample. |
| ^^^sku_image_url | string |  | The URL of SKU image. |
| ^^^sku_name | string |  | The description of sku |
| ^^^title | string |  | The product name of the product. |
| ^^shipment_expiration_time | integer |  | The deadline for a seller to ship a sample for a sample application. |
| ^^status | string |  | The status of sample applications. The possible enumerated values are: - PENDING: The sample application is waiting for the seller's review. - AWAITING_SHIPMENT: The application is approved, and the seller needs to ship the sample. - SHIPPED: The sample has been shipped by the seller and is waiting for the creator to receive the package. - CONTENT_PENDING: The creator has received the sample package and is expected to create content. - REJECT_CANCELLED: The sample application has been rejected by the seller. - OVERDUE_CANCELLED: The sample application has expired due to being overdue. - UNFULFILL_CANCELLED: The creator did not fulfill the commitment to create content within the agreed timeframe. - DEL_OPEN_COLLAB: The open collaboration plan has been deleted. - SELLER_NOT_SHIP_CANCELLED: The seller did not ship the sample within the required timeframe. - WITHDRAW_CANCELLED: The creator withdrew the sample application before the seller approved it. - UNFULFILLABLE_CANCELLED: The application was cancelled due to reasons beyond the creator's control, making it impossible to create content. - OPS_CANCELLED: The application was manually cancelled by operations staff. - OPS_FAILED: The application was marked as failed by operations staff. - OPS_COMPLETED: The application was manually marked as completed by operations staff. - COMPLETED: The application is complete, and the creator has finished creating the content. |
| ^^tracking_number | string |  | The logistics tracking number for the sample application order |
| ^total_count | integer |  | total count |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateTargetCollaboration

This API is used to create a target collaboration.
A target collaboration is a collaboration between a seller selected set of products (including a commission payout) and a set of creators the seller has added (invited) to the collaboration. Target collaborations are private and not visible in the Creator Marketplace to all creators; they are only visible to those that have been added to the collaboration.

**Path:** `/affiliate_seller/202508/target_collaborations`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/create-target-collaboration-202508

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
| creator_user_open_ids | array<string> |  | Maximum length of the list is `50` user open identifiers. Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| end_time | string |  | The date at which the target collaboration ends, in Unix epoch time. |
| free_sample_rule | object |  | A set of properties that control the free sample behavior for the product. |
| ^has_free_sample | boolean |  | If set to `true`, free samples are provided to creators invited to the target collaboration group. If set to `false`, free samples are not provided. |
| ^is_sample_approval_exempt | boolean |  | If set to `true`, creators invited to the target collaboration are exempt from seller review and are automatically approved for a free  product sample. Note that the `has_free_sample` property overrides the free sample behavior. |
| message | string |  | The message sent to creators associated with the target collaboration. |
| name | string |  | The name of the target collaboration. |
| products | array<object> |  | A list of metadata and data for the products provided by the seller for target collaboration. Maximum length of the list is `100` products. |
| ^id | string |  | The product identifier. |
| ^shop_ads_commission_rate | integer |  | The commission rate applies only to orders generated from ads. If a creator’s video is used as an ad without this rate being set, the resulting orders will instead earn either: - The Shop Ads commission you configured in open collaboration, or - The standard commission defined in this invitation. The commission rate is specified in increments of 1/10,000. For example, 1000 stands for 0.1 or 10%. |
| ^target_commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, `3587` is a commission rate of `35.87%`. This value must a minimum of `1000`. |
| seller_contact_info | object |  | Metadata and data associated with the seller contact information. |
| ^email | string |  | The seller's email address. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^target_collaboration | object |  | The target collaboration. |
| ^^id | string |  | The target collaboration identifier. |
| ^target_collaboration_conflicts | array<object> |  | A list of user and product identifiers with target collaboration conflicts that caused target collaboration failure. |
| ^^creator_user_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^^product_id | string |  | The product identifier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchTargetCollaborations

This API is used by Seller to search for all existing target collaborations. Sellers can search based on filters such as Invitation name, Invitation ID, Product name, Product ID and Creator name.

**Path:** `/affiliate_seller/202508/target_collaborations/search`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/search-target-collaborations-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The value of "page_size" must be 20, 50 or 100. |
| page_token | string |  | Pagination offset determines where you begin to search for. It's empty when raise your first request. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| collaboration_status | string |  | Filtering by target collaborations' status. You can query based on: - ONGOING: If you use ONGOING to search, the remaining validity period of the returned target collaborations will be greater than 7 days. - EXPIRING: If you use EXPIRING to search, the remaining validity period of the returned target collaborations will be less than 7 days. - VALID: If you use VALID to search, all returned target collaborations will be valid. - CANCELING: If you use CANCELING to search, all returned target collaborations will be in the process of canceling. - COMPLETED: If you use COMPLETED to search, all returned target collaborations will be in the state of completed, including expired and canceled. |
| creator_accept_status | string |  | Filtering by acceptance status of creators who are invited to target collaborations. You can query based on: - "ACCEPT", it means creators have already added the products to the showcase - "ALL""", it means regardless of whether the creator adds the product to the Showcase. By default, the target collaborations will be searched by "ALL" status. |
| creator_user_open_id | string |  | Creators' TikTok User Open ID.[More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) - CREATOR_OPEN_ID: If you use CREATOR_OPEN_ID  to search, you can search for target collaboration information for a specified creator ID. |
| free_sample_setting | string |  | Filtering by target collaborations' free sample setting. You can query based on: - "WITH_FREE_SAMPLE" - "ALL" By default, the target collaborations will be searched by "ALL" setting. |
| search_param | object |  | The search param. |
| ^keyword | string |  | Search Keyword. |
| ^keyword_type | string |  | Pass in the parameter type which you use to search for target collaborations. You can query based on: - PRODUCT_ID：If you use PRODUCT_ID  to search, you can search for target collaboration information for a specified product ID. - PRODUCT_NAME: If you use PRODUCT_NAME to search, you can fuzzy search for target collaboration information involving related product names. - TARGET_COLLABORATION_ID: if you use Target_Collaboration_ID to search, you can search for target collaboration information for a specified target collaboration ID. - TARGET_COLLABORATION_NAME: If you use Target_Collaboration_NAME to search, you can fuzzy search for target collaboration information involving related target collaboration names. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Cursor for the next page request. |
| ^target_collaborations | array<object> |  | The basic information of target collaboration which creators can view in Targeted Invitation on TikTok EC Center. |
| ^^content_creator_count | integer |  | The number of creators who posted content featuring products from target collaboration. |
| ^^creator_inivited_count | integer |  | The count of creators invited in the target collaboration. |
| ^^end_time | integer |  | The end time of the target collaboration. |
| ^^free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^^^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration. |
| ^^^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| ^^id | string |  | Target collaboration ID. |
| ^^message | string |  | Message seller has sent to creators about seller's  introduction and why excited to collaborate. |
| ^^name | string |  | Target collaboration name. |
| ^^product_count | integer |  | The count of products added in the target collaboration. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from target collaboration. |
| ^^start_time | integer |  | The start time of the target collaboration. |
| ^^type | string |  | The type of target collaboration. Field values: - STANDARD: The target collaboration is created by sellers manually selecting products and creators. - TOP_CREATOR_PROGRAM: The target collaboration created by seller joining TikTok Shop Top Creator Program, requiring only product submission. |
| ^^update_time | integer |  | The update time of the target collaboration. |
| ^total_count | integer |  | The total count of target collaboration returned by this query. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QueryTargetCollaborationDetail

This API is used by Sellers to get target collaboration information.

**Path:** `/affiliate_seller/202508/target_collaborations/{target_collaboration_id}`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/query-target-collaboration-detail-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | target collaboration id |

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
| ^target_collaboration | object |  | Target Collaboration detail. |
| ^^content_creator_count | integer |  | The number of creators who posted content featuring products from target collaboration. The count will only include the NORMAL state. |
| ^^creator_invited_count | integer |  | The count of creators invited in the target collaboration. The count will only include the NORMAL state. |
| ^^creators | array<object> |  | The information of creators in the target collaboration. |
| ^^^avatar | object |  | Data associated with the TikTok creator's profile avatar. |
| ^^^^url | string |  | The URL for the TikTok creator's avatar image file. |
| ^^^collaboration_status | string |  | The status of the creator in the current target cooperation. Field values: - NORMAL: The status of the creator in the current target collaboration is normal. - DELETING: The status of the creator in the current target collaboration is deleting.The creator's product promotion relationship in the DELETING status will end the delayed effectiveness status and flow to the DELETED status at 00:00 the next day. - DELETED: The status of the creator in the current target collaboration is deleted. |
| ^^^content_product_count | integer |  | This field indicates the number of products creator has posted video or live from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^creator_open_id | string |  | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| ^^^nickname | string |  | The TikTok nick name. |
| ^^^product_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission rate for all products under Target Collaboration is effective. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current creator and some products, the commission rate will be based on TOP_CREATOR_PROGRAM. The products' commission under the current Target Collaboration will only be partially effective for the creator, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^selection_region | string |  | The regions in which the creator is eligible to promote products in showcases, videos, and live streams. |
| ^^^showcase_product_count | integer |  | This field indicates the number of products creator has added  to the showcase from target collaboration. The count includes NORMAL and DELETING states. |
| ^^^username | string |  | The TikTok user name. |
| ^^end_time | integer |  | The end time of the target collaboration. |
| ^^free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^^^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration group. |
| ^^^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| ^^id | string |  | Target collaboration ID. |
| ^^message | string |  | Message seller has sent to creators about seller's  introduction and why excited to collaborate. |
| ^^name | string |  | Target collaboration name. |
| ^^product_count | integer |  | The count of products added in the target collaboration. The count will only include the NORMAL state. |
| ^^products | array<object> |  | The information of products in the target collaboration. |
| ^^^collaboration_status | string |  | The status of the product in the current target cooperation. Field values: - NORMAL: The status of the product in the current target collaboration is normal. - DELETING: The status of the product in the current target collaboration is deleting.Product in the DELETING state will end their delayed effectiveness state and move to the DELETED state at 00:00 the next day. - DELETED: The status of the product in the current target collaboration is deleted. |
| ^^^commission | object |  | Commission info. |
| ^^^^currency | string |  | The currency code. |
| ^^^^effective_time | string |  | Commission effective time. It is a timestamp. |
| ^^^^maximum_amount | string |  | The maximum estimated commission amount for all SKUs of this product. |
| ^^^^minimum_amount | string |  | The minimum estimated commission amount for all SKUs of this product. |
| ^^^^rate | integer |  | The commission rate in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must a minimum of 1000.  The range of this value is [100, 8000]. |
| ^^^^shop_ads_commission_rate | integer |  | The commission rate applies only to orders generated from ads. If a creator’s video is used as an ad without this rate being set, the resulting orders will instead earn either: - The Shop Ads commission you configured in open collaboration, or - The standard commission defined in this invitation. The commission rate is specified in increments of 1/10,000. For example, 1000 stands for 0.1 or 10%. |
| ^^^commission_effective_status | string |  | The effectiveness of the creators' commissions and products. Field values: - EFFECTIVE_ALL: The current product commission is effective for all creators. - EFFECTIVE_PARTIALLY: The current product commission are effective for some creators. - EFFECTIVE_NONE: The current product commission is not effective for all creators. Normally, the commission for a product will be the same for all creators. If the merchant participates in TOP_CREATOR_PROGRAM, and TOP_CREATOR_PROGRAM includes the current product and some creators, the commission rate will be based on TOP_CREATOR_PROGRAM. The product commission under the current Target Collaboration will be effective for some creators, corresponding to EFFECTIVE_PARTIALLY status. |
| ^^^id | string |  | The product identifier. |
| ^^^main_image_url | string |  | The product image url. |
| ^^^original_price | object |  | The original price of the product. |
| ^^^^currency | string |  | The currency code. |
| ^^^^maximum_amount | string |  | The highest original price of all SKUs of the product. |
| ^^^^minimum_amount | string |  | The lowest original price of all SKUs of the product. |
| ^^^status | string |  | Product's status. Field values: - LIVE: When the product is normal for sale, return to the LIVE status - OUT_OF_STOCK: When the product is out of stock for the consumer, the OUT_OF_STOCK state is returned - SELLER_DEACTIVATE:  When the product is deactivated by the merchant, the SELLER_DEACTIVATE status is returned - PLATFORM_DEACTIVATE: When the product is deactivated by the platform or is not available for sale, the PLATFORM_DEACTIVATE status is returned - GNE_REJECT: When the product is governed or the target collaboration is dismissed, the GNE_REJECT state is returned - DELETE: When the product is deleted, the DELETE status is returned - OTHER: When the product is in an unsaleable state, such as draft, frozen, review, etc, the OTHER status is returned |
| ^^^title | string |  | The product name. |
| ^^seller_contact_info | object |  | Contact information for the seller in the target collaboration. |
| ^^^email | string |  | Seller's email contact information. |
| ^^showcase_creator_count | integer |  | This field indicates the number of creators who added the product to the showcase from target collaboration. The count will only include the NORMAL state. |
| ^^start_time | integer |  | The start time of the target collaboration. |
| ^^type | string |  | The type of target collaboration. Field values: - STANDARD: The target collaboration is created by sellers manually selecting products and creators. - TOP_CREATOR_PROGRAM: The target collaboration created by seller joining TikTok Shop Top Creator Program, requiring only product submission. |
| ^^update_time | integer |  | The update time of the target collaboration. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateTargetCollaboration

This API is used by Seller to update STANDARD target collaboration.

**Path:** `/affiliate_seller/202508/target_collaborations/{target_collaboration_id}`
**Method:** `PUT`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/update-target-collaboration-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | The unique id of specific target collaboration. |

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
| creator_user_open_ids | array<string> |  | The list of Creators' TikTok User Open IDs invited in the target collaboration. The maximum number of creators is 50. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |
| end_time | string |  | The end time of the target collaboration. |
| free_sample_rule | object |  | The free sample rules set by the seller in the target collaboration. |
| ^has_free_sample | boolean |  | If true, free samples are provided to creators invited to the target collaboration. |
| ^is_sample_approval_exempt | boolean |  | If true, creators invited to the target collaboration are exempt from seller review and will automatically be approved for a free sample. Note that if has_free_sample=false, this field will not take effect. |
| name | string |  | The name of the target collaboration. |
| products | array<object> |  | The information about the products provided by the seller for target collaboration with creators in the target collaboration. The maximum number of products is 100. When a product is deleted from the product list, if the deleted product has been added to the showcase by the creator, it will take effect at 0:00 the next day, otherwise it will take effect immediately. |
| ^commission_rate | integer |  | The desired commission rate for the target collaboration. The value is measured in ten thousandths. For example, 3587 means the commission fee equals 35.87% of the original price. The range is [100, 8000]. Increasing product commissions will take effect immediately, while reducing product commissions will take effect at 00:00 the next day if the current product has been added to the showcase by a creator, otherwise it will take effect immediately. |
| ^id | string |  | The product identifier. |
| ^target_ad_commission_rate | integer |  | The commission rate applies only to orders generated from ads. If a creator’s video is used as an ad without this rate being set, the resulting orders will instead earn either: - The Shop Ads commission you configured in open collaboration, or - The standard commission defined in this invitation. The commission rate is specified in increments of 1/10,000. For example, 1000 stands for 0.1 or 10%. |
| seller_contact_info | object |  | Contact information for the seller in the target collaboration. |
| ^email | string |  | Seller's email contact information |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^target_collaboration_conflicts | array<object> |  | A list of creators and products with target collaboration conflicts that caused target collaboration update failure. |
| ^^creator_user_open_id | string |  | Creator Open ID. More details:https://partner.tiktokshop.com/docv2/page/3obfokj6 |
| ^^product_id | string |  | The product identifier. |
| ^update_failed | object |  | Describe which fields were not updated successfully. |
| ^^add_creator_open_ids | array<string> |  | The list of creators' TikTok User Open IDs that have not been successfully added. More details:https://partner.tiktokshop.com/docv2/page/3obfokj6 |
| ^^add_products | object |  | The list of products that have not been successfully added. |
| ^^^commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must be a minimum of 1000. |
| ^^^id | string |  | The product identifier. |
| ^^change_commissions | object |  | The list of commission information that has not been successfully changed. |
| ^^^commission_rate | integer |  | The desired commission rate for the target collaboration. The desired commission rate is expressed in hundredths of a percent. For example, 3587 is a commission rate of 35.87%. This value must be a minimum of 1000. |
| ^^^product_id | string |  | The product identifier. |
| ^^end_time | integer |  | The end time of the target collaboration, which has not been successfully updated. |
| ^^name | string |  | The name of the target collaboration. |
| ^^remove_creator_open_ids | array<string> |  | The list of creators' TikTok User Open IDs that have not been successfully removed. More details:https://partner.tiktokshop.com/docv2/page/3obfokj6 |
| ^^remove_product_ids | array<string> |  | The list of product ids that have not been successfully removed. |
| ^^seller_contact_info | object |  | Contact information for the seller in the target collaboration which has not been successfully updated. |
| ^^^email | string |  | Seller's email contact information which has not been successfully updated. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GenerateTargetCollaborationLink

Generate a Target Collaboration Link that the seller can share with the creator. This link directs the creator to a guided flow to review details and formally accept the target collaboration

**Path:** `/affiliate_seller/202509/target_collaboration/{target_collaboration_id}/link`
**Method:** `POST`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/generate-target-collaboration-link-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| target_collaboration_id | string | Y | Target collaboration ID. |

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
| ^link | string |  | The link of the target invitation, the creator can jump to the page of adding products after clicking. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadMessageImage

You must use this API to upload the image first, before sending an image as a message using [Send IM Messsage](https://partner.tiktokshop.com/docv2/page/send-im-message-202412)

**Path:** `/affiliate_seller/202511/images/upload`
**Method:** `POST`
**Version:** 202511
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-message-image-202511

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

## SellerGetSampleRequestDeeplink

Use this API to get a TikTok deeplink, use this deeplink to launch the TikTok app and land the user on the sample request page.
- The seller can encode the deeplink into an QR code and send it to a creator via email.

**Path:** `/affiliate_seller/202512/sample_applications/deeplink`
**Method:** `GET`
**Version:** 202512
**Docs:** https://partner.tiktokshop.com/docv2/page/seller-get-sample-request-deeplink-202512

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | Product id |
| sku_id | string | Y | Sku id |
| campaign_id | string |  | If the product belongs to a TAP campaign, a campaign_id is required. only support campaign  type : - MY_CAMPAIGNS - SELLER_CAMPAIGNS |
| collaboration_id | string |  | If the product belongs to a seller collaboration, a collaboration_id is required. |
| valid_days | integer |  | 7 days by default. 14 days maximum. 1 day minimum. |
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
| ^deeplink | string |  | Use this deeplink to invoke TikTok: |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetSellerSearchCreatorMarketplaceAdvancedFilters

This API allows you to obtain the advanced filters available in Seller Search Creator Marketplace. Because we are constantly releasing new filters which are specific to each country or region, this API serves as a way for developers to retrieve the latest available search filters.

**Path:** `/affiliate_seller/202601/marketplace_creators/search/filter`
**Method:** `POST`
**Version:** 202601
**Docs:** https://partner.tiktokshop.com/docv2/page/get-seller-search-creator-marketplace-advanced-filters-202601

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
| ^advanced_filters | object |  | This is an object which contains the advanced filters available for [Seller Search Creator on Marketplace](https://partner.tiktokshop.com/docv2/page/seller-search-creator-on-marketplace-202508) If we return an empty object, it means this filter is not currently supported by your country or region. |
| ^^category_pro | array<string> |  | Category Pro is a specific label given to Creators that regularly post about one product category and have generated most of their sales in that Category in the past 60 days. It is currently only available in the US. If we return an empty object, it means this filter is not currently supported by your country or region. |
| ^^creator_level | array<string> |  | The Creator level, based on their GMV. The exact definition changes by country, and is set by the TikTok Shop Creator team. If we return an empty object, it means this filter is not currently supported by your country or region. |
| ^^language | array<string> |  | The language of the user. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
