# TikTok Shop API — affiliate_partner

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 17 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202405, 202411, 202501, 202504, 202505, 202508

---

## GetAffiliatePartnerCampaignList

This API offers the ability to list campaigns created by the Affiliate Partner.

**Path:** `/affiliate_partner/202405/campaigns`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-partner-campaign-list-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API](https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |
| page_size | integer | Y | The number of results to be returned per page. Default: 10. Valid range: [1-100]. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. Maximum page size is `100` items. |
| status | string |  | The campaign status. The status is an enumerated type with values: - `READY` - `UPCOMING` - `ONGOING` - `CLOSED` - `UNSPECIFIED` |
| type | string |  | The campaign type. This is an enumerated type with values: - MY_CAMPAIGNS - GS_SELLING_CAMPAIGNS - SELLER_CAMPAIGNS - EXCLUSIVE_TIKTOK_SHOP Default value is MY_CAMPAIGNS. |
| query_type_filter | string |  | An extended filter to be used when the campaign type property type is set to SELLER_CAMPAIGNS or EXCLUSIVE_TIKTOK_SHOP. If the type property is set to SELLER_CAMPAIGNS, the valid values for this property are: - MARKETPLACE: the response includes campaigns that the partner did not join. - JOINED :  the response includes campaigns the partner has joined only. If the type property is set to EXCLUSIVE_TIKTOK_SHOP, the valid values for this property are: - AVAILABLE: the response includes campaigns the partner is permitted to join. - JOINED: the response includes campaigns the partner has joined only. Other types can either not pass a value or pass in Default. |

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
| ^campaigns | array<object> |  | A list of campaigns. |
| ^^campaign_end_time | integer |  | The scheduled end time in Unix epoch time format for the campaign. Note that the end time must be less than 360 days from the start date. This field is no longer editable when the campaign status is set to `CLOSED`. |
| ^^campaign_start_time | integer |  | The scheduled start time in Unix epoch time format for the campaign. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| ^^id | string |  | The campaign identifier. |
| ^^name | string |  | The campaign name. |
| ^^registration_end_time | integer |  | The scheduled end time in Unix epoch time format for seller product registration. This field is no longer editable when the campaign status is set to `CLOSED`. |
| ^^registration_start_time | integer |  | The scheduled start time in Unix epoch format for seller product registration. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| ^^status | string |  | The campaign status. The status is an enumerated type with values: - READY - UPCOMING - ONGOING - CLOSED |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. |
| ^total_count | integer |  | The total number of campaigns in the list. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateAffiliatePartnerCampaign

This API offers the ability to create a campaign for targeted sellers/public sellers, including campaign period, campaign registration period and commission requirements. Note: The campaign will not be displayed to sellers after creation

**Path:** `/affiliate_partner/202405/campaigns`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/create-affiliate-partner-campaign-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_end_time | integer |  | The scheduled end time in Unix epoch time format for the campaign. Note that the end time must be less than 360 days from the start date. This field is no longer editable when the campaign status is set to `CLOSED`. |
| campaign_start_time | integer |  | The scheduled start time in Unix epoch time format for the campaign. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| commission_rate | integer |  | The total commission rate in hundredths of a percent (0.01%) units proposed by the affiliate partner for display to sellers. Commission rate must be greater than 100 and less than 8000. |
| contact_info | object |  | The partner's contact information. |
| ^email | string |  | The partner's email address. |
| ^line | string |  | The partner's phone number registered in LINE. Required if the target market is TH; otherwise, not applicable. |
| ^phone | string |  | The partner's phone number. |
| ^viber | string |  | The partner's phone number registered in Viber. Required if the target market is PH; otherwise, not applicable. |
| ^whatsapp | string |  | The partner's phone number registered in WhatsApp. Required if the target market is MY, SG, GB, or ID, optional if the target market is US; otherwise, not applicable. |
| ^zalo | string |  | The partner's phone number registered in Zalo. Required if the target market is VN; otherwise, not applicable. |
| description | string |  | The campaign description. The campaign description must be less than 1000 characters. |
| name | string |  | The campaign name. The campaign name must be less than 50 characters. |
| registration_end_time | integer |  | The scheduled end time in Unix epoch time format for seller product registration. This field is no longer editable when the campaign status is set to `CLOSED`. |
| registration_start_time | integer |  | The scheduled start time in Unix epoch format for seller product registration. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| target_seller_types | array<string> |  | A list of eligible seller types to allow to register for the campaign. Use this field to broadly target types of sellers instead of specific sellers in the `target_shop_codes` field. This is an enumerated type with possible values: - LOCAL - CROSS_BORDER |
| target_shop_codes | array<string> |  | A list of TikTok Shop seller shop codes to allow to register for the campaign. The seller shop code in available in TikTok Shop Seller Central by clicking on the Seller Profile icon in the top right of the user interface. The list must be less than 100 items in length. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^campaign_id | string |  | The campaign identifier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliatePartnerCampaignDetail

This API offers the ability to get affiliate campaign details.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-partner-campaign-detail-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The ID of the campaign. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

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
| ^campaign_end_time | integer |  | The scheduled end time in Unix epoch time format for the campaign. Note that the end time must be less than 360 days from the start date. This field is no longer editable when the campaign status is set to `CLOSED`. |
| ^campaign_start_time | integer |  | The scheduled start time in Unix epoch time format for the campaign. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| ^commission_rate | integer |  | The total commission rate in hundredths of a percent (0.01%) units proposed by the affiliate partner for display to sellers. Commission rate must be greater than 100 and less than 8000. |
| ^contact_info | object |  | The campaign creator's contact information. |
| ^^email | string |  | Email |
| ^^line | string |  | Line account number |
| ^^phone | string |  | Phone number |
| ^^viber | string |  | Viber account number |
| ^^whatsapp | string |  | WhatsApp account number |
| ^^zalo | string |  | Zalo account number |
| ^description | string |  | The campaign description. The campaign description must be less than 1000 characters. |
| ^id | string |  | The campaign identifier. |
| ^name | string |  | The campaign name. The campaign name must be less than 50 characters. |
| ^region | string |  | The region to which the campaign is associated. |
| ^registration_end_time | integer |  | The scheduled end time in Unix epoch time format for seller product registration. This field is no longer editable when the campaign status is set to `CLOSED`. |
| ^registration_start_time | integer |  | The scheduled start time in Unix epoch format for seller product registration. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| ^status | string |  | The campaign status. The status is an enumerated type with values: - READY - UPCOMING - ONGOING - CLOSED |
| ^target_seller_types | array<string> |  | A list of eligible seller types to allow to register for the campaign. Use this field to broadly target types of sellers instead of specific sellers in the `target_shop_codes` field. This is an enumerated type with possible values: - LOCAL - CROSS_BORDER |
| ^target_shops | array<object> |  | A list of TikTok Shop seller shop codes and names with permission to register for the campaign. |
| ^^code | string |  | The seller shop code in available in TikTok Shop Seller Central by clicking on the Seller Profile icon in the top right of the user interface. |
| ^^name | string |  | The TikTok Shop name. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EditAffiliatePartnerCampaign

This API offers the ability to edit an Affiliate Partner campaign. No editing after the campaign is closed.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}/partial_edit`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-affiliate-partner-campaign-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The ID of the campaign. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests.  Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_end_time | integer |  | The scheduled end time in Unix epoch time format for the campaign. Note that the end time must be less than 360 days from the start date. This field is no longer editable when the campaign status is set to `CLOSED`. |
| campaign_start_time | integer |  | The scheduled start time in Unix epoch time format for the campaign. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| commission_rate | integer |  | The total commission rate in hundreds of a percent (0.01%) units proposed by the affiliate partner for display to sellers. Commission rate must be greater than 100 and less than 8000. |
| contact_info | object |  | The partner's contact information. |
| ^email | string |  | The partner's email address. |
| ^line | string |  | The partner's phone number registered in LINE. Applicable if the target market is TH. |
| ^phone | string |  | The partner's phone number. |
| ^viber | string |  | The partner's phone number registered in Viber. Applicable if the target market is PH. |
| ^whatsapp | string |  | The partner's phone number registered in WhatsApp. Applicable if the target market is MY, SG, GB, ID, or US. |
| ^zalo | string |  | The partner's phone number registered in Zalo. Applicable if the target market is VN. |
| description | string |  | The campaign description. The campaign description must be less than 1000 characters. |
| name | string |  | The campaign name. The campaign name must be less than 50 characters. |
| registration_end_time | integer |  | The scheduled end time in Unix epoch time format for seller product registration. This field is no longer editable when the campaign status is set to `CLOSED`. |
| registration_start_time | integer |  | The scheduled start time in Unix epoch format for seller product registration. Note that this field can be updated when the campaign status is set to `READY` or `UPCOMING` only. |
| target_seller_types | array<string> |  | A list of eligible seller types to allow to register for the campaign. Use this field to broadly target types of sellers instead of specific sellers in the `target_shop_codes` field. This is an enumerated type with possible values: - LOCAL - CROSS_BORDER |
| target_shop_codes | array<string> |  | A list of TikTok Shop seller shop codes to allow to register for the campaign. The seller shop code in available in TikTok Shop Seller Central by clicking on the Seller Profile icon in the top right of the user interface. The list must be less than 100 items in length. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliatePartnerCampaignProductList

This API offers the ability to list products submitted by sellers in an Affiliate Partner campaign.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}/products`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-partner-campaign-product-list-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The ID of the campaign. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API](https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |
| page_size | integer | Y | The number of results to be returned per page. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| review_status | string |  | The product review status. This an enumerated type with values: - PENDING - APPROVED - REJECTED - PENDING_CLOSED - CLOSED |
| product_name | string |  | Filter the product list by product name. If value of `product_name` is contained in `product.name`, the product will be included in the response. |
| product_id | string |  | Filter the product list by product ID. If value of `product_id` matches `product.id`, the product will be included in the response. |
| shop_name | string |  | Filter the product list by shop name. If value of `shop_name` is contained in `product.shop_name`, the product will be included in the response. |
| category_id | string |  | Filter the product list by category ID. If value of `category_id` matches `product.category.id`, or the product falls into the leaf category of the specified category, the product will be included in the response. |

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
| ^products | array<object> |  | The list of products. |
| ^^category | object |  | The leaf category to which this product is associated. |
| ^^^id | string |  | The category identifier. |
| ^^^name | string |  | The category name. |
| ^^creator_commission_rate | integer |  | The creator commission rate in hundredths of a percent (0.01%) units. |
| ^^highest_price | object |  | The highest original price of all SKUs of this product. |
| ^^^amount | string |  | The highest price amount. |
| ^^^currency | string |  | The currency code for the region in which the product is sold. |
| ^^id | string |  | The product identifier. |
| ^^inventory | integer |  | The number of in-stock units of all SKUs for this product. |
| ^^is_available | boolean |  | Set to `true` if a product URL is available. Set to `false` if no product URL is available. |
| ^^lowest_price | object |  | The lowest original price of all SKUs of this product. |
| ^^^amount | string |  | The lowest price amount. |
| ^^^currency | string |  | The currency in the sales region. |
| ^^main_image_url | string |  | The product image URL. |
| ^^name | string |  | The product name. |
| ^^open_collaboration_commission_rate | integer |  | The product open collaboration commission rate in hundredths of a percent (0.01%) units. |
| ^^partner_commission_rate | integer |  | The partner commission rate in hundredths of a percent (0.01%) units. |
| ^^product_description | string |  | Return product description |
| ^^product_sales | integer |  | The total number of units sold of this product for this campaign. |
| ^^review_status | string |  | The product review status. This an enumerated type with values: - PENDING - APPROVED - REJECTED - PENDING_CLOSED - CLOSED |
| ^^sample_quota | integer |  | The total amount of sample inventory available for allocation to creators by the seller. |
| ^^shop_name | string |  | The TikTok Shop name. |
| ^^sku_information_list | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^base_price | object |  | the base price of the sku |
| ^^^^currency | string |  | The currency of the SKU price. Possible values based on the region: - BRL:  Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^list_price | string |  | The SKU's list price information that has been verified to be legitimate by the audit team. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). |
| ^^^^localized_dutiable_price | string |  | localized dutiable price |
| ^^^^region_code | string |  | the region code of the sku |
| ^^^^sale_price | string |  | The SKU's selling price, inclusive of tax. Applicable only for cross-border sellers from China. |
| ^^^inventory | object |  | SKU inventory details. |
| ^^^^available_quantity | string |  | The total SKU quantity available in the warehouse. |
| ^^^properties | array<object> |  | The properties of the sku |
| ^^^^name | string |  | the name of the property |
| ^^^^value_name | string |  | the name of the value |
| ^^^region_prices | array<object> |  | region prices |
| ^^^^currency | string |  | The currency of the SKU price. Possible values based on the region: - BRL:  Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^list_price | string |  | The SKU's list price information that has been verified to be legitimate by the audit team. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). |
| ^^^^localized_dutiable_price | string |  | localized dutiable price |
| ^^^^region_code | string |  | the region code of the sku |
| ^^^^sale_price | string |  | The SKU's selling price, inclusive of tax. Applicable only for cross-border sellers from China. |
| ^^^sku_id | string |  | The id of the sku |
| ^^^sku_name | string |  | The name of the sku |
| ^^total_commission_rate | integer |  | The total commission rate in hundredths of a percent (0.01%) units. |
| ^total_count | integer |  | The total number of products in the list. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GenerateAffiliatePartnerCampaignProductLink

This API offers the ability to generate campaign product promotion links.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}/products/{product_id}/promotion_link/generate`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/generate-affiliate-partner-campaign-product-link-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The ID of the campaign. |
| product_id | string | Y | The ID of the product. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| creator_commission_rate | integer |  | The commission rate paid to a creator in hundredths of a percent (0.01%). The commission rate must be lower than or equal to the total commission rate set by the seller. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^product_promotion_link | string |  | A URL for product promotion content. This URL is provided to agencies for sharing with colloborating creators. Creators share this link with followers via the TikTok App. Note that creators control whether or not to add products to their showcase in the pop-up window. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ReviewAffiliatePartnerCampaignProduct

This API offers the ability for the TikTok Affiliate Partner to review the products submitted by the sellers. This API offers the ability for the TikTok Affiliate Partner to review the products submitted by the sellers.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}/products/{product_id}/review`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/review-affiliate-partner-campaign-product-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| reject_reasons | array<string> |  | If the `review_result` property is set to `REJECT` or `REJECT_FOREVER`, this property is set to the enumerated reason that the TikTok Affiliate Partner rejected the product. This is an enumerated type with values: - COMMISSION_TOO_LOW - PRODUCT_HARD_TO_PROMOTE - PRODUCT_TOO_EXPENSIVE - NO_SUITABLE_CREATOR |
| review_result | string |  | The product review decision by the TikTok Affiliate Partner. This is an enumerated type with values: - APPROVE - REJECT - REJECT_FOREVER |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PublishAffiliatePartnerCampaign

This API offers the ability to publish an Affiliate Partner campaign. The campaign will be displayed to sellers after publishing.

**Path:** `/affiliate_partner/202405/campaigns/{campaign_id}/publish`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/publish-affiliate-partner-campaign-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string | Y | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

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

## SearchTapAffiliateOrders

TAP can use this API to retrieve a list of affiliate orders and track the affiliate conversions.

**Path:** `/affiliate_partner/202411/orders/search`
**Method:** `POST`
**Version:** 202411
**Docs:** https://partner.tiktokshop.com/docv2/page/search-tap-affiliate-orders-202411

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | The next page token |
| page_size | integer | Y | The default is 20, it must be positive integer, the range is 1-100 |
| category_asset_cipher | string | Y | The partner identifier used in API requests.  Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string |  | Filter orders by a TAP campaign using its identifier. |
| create_time_ge | integer |  | Filter orders to show only those that are created on or after the specified date and time. Unix timestamp. Note: `create_time_ge` and `create_time_lt` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_lt` is empty, `create_time_lt` will default to the current time. - If `create_time_lt` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_lt | integer |  | Filter orders to show only those that are created before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Cursor used for searching for more information |
| ^orders | array<object> |  | Order list |
| ^^create_time | integer |  | Time and date of order created, UTC+0 timing |
| ^^delivery_time | integer |  | Time and date order delivered, UTC+0 timing |
| ^^id | string |  | Transaction main order ID |
| ^^skus | object |  | SKUs |
| ^^^actual_commission_base | object |  | The actual commission base is the item price multiplied by the number of items ordered minus returns at the time the order is completed. |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_creator_commission | object |  | Actual TAP commission x creator commission rate |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_creator_commission_reward_fee | object |  | Actual creator commission reward fee |
| ^^^^amount | string |  | The actual fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_partner_commission_reward_fee | object |  | Actual partner commission reward fee |
| ^^^^amount | string |  | The actual fee affiliate partners earn from commission rewards |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_tap_commission | object |  | Actual commission base x TAP commission rate |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^campaign_id | string |  | New seller campaign |
| ^^^content_id | string |  | Unique identifier for content |
| ^^^content_type | string |  | The content format of the creator content through which the order was created. Possible values: - SHOP - VIDEO - LIVE - PRE_LIVE - PROMOTION_PAGE - LINKSHARE |
| ^^^creator_commission_rate | integer |  | Between TAP & creator percentage commission |
| ^^^creator_commission_reward_rate | integer |  | The commission reward rate affiliate partners allocate to creators |
| ^^^creator_username | string |  | Creator username |
| ^^^estimated_commission_base | object |  | The estimated commission base is the item price multiplied by the number of items ordered at the time the order is created. |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_creator_commission | object |  | Estimated TAP commission x creator commission rate |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_creator_commission_reward_fee | object |  | Estimated creator commission reward fee |
| ^^^^amount | string |  | The estimated fee creators receive from affiliate partners through commission rewards |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_partner_commission_reward_fee | object |  | Estimated partner commission reward fee |
| ^^^^amount | string |  | The estimated fee affiliate partners earn from commission rewards |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_tap_commission | object |  | Estimated commission base x TAP commission rate |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^id | string |  | sku ID |
| ^^^partner_commission_reward_rate | integer |  | The additional commission rate TikTok Shop offers to affiliate partners for driving product sales in specific campaigns |
| ^^^price | object |  | Price |
| ^^^^amount | string |  | Price amount for product, such as USD 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^product_id | string |  | Unique identifier for Product |
| ^^^product_name | string |  | Product name / description |
| ^^^quantity | integer |  | Total sku quantity per order |
| ^^^refunded_quantity | integer |  | Number of sku refunded per order |
| ^^^returned_quantity | integer |  | Number of sku returned per order |
| ^^^tap_commission_rate | integer |  | Between seller & TAP percentage commission |
| ^^status | string |  | Status order for product sales The order status. Possible values: 1. "ALL" 2. "PROCESSING" 3. "COMPLETED" 4. "CANCELLED" 5. "FROZEN" 6. "DEDUCTED" |
| ^total_count | integer |  | The total number of orders |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorFulfillmentStatusList

This API offers the ability to get the product of the campaign fulfillment status for creators who added partner campaign products to their showcase. For details of a specified product involved in an affiliated campaign, use Get Affiliate Campaign Creator Fulfillment Status Info gateway.

**Path:** `/affiliate_partner/202501/campaigns/{campaign_id}/products/performance`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-fulfillment-status-list-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | the unique id of a campaign |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The number of results to be returned per page. Valid range: 1-50. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

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
| ^campaign_product_statistics | array<object> |  | A list of objects representing campaign product statistics. |
| ^^campaign_product_detail | object |  | An object representing the details for the product associated with the campaign. |
| ^^^creator_commission_percent | string |  | The commission rate for the creator in the partner plan. The value is in hundredths of a percent. For example, a value of 1000 means 10.00%. |
| ^^^indicator_data | object |  | Key performance indicators for the product. |
| ^^^^actual_amount | string |  | GMV, the total payment amount corresponding to `actual_order_num`. |
| ^^^^actual_order_num | string |  | The actual number of paid orders. |
| ^^^^actual_partner_commission | string |  | The partner commission amount corresponding to actual_order_num. |
| ^^^^collaborated_creators_num | string |  | The total number of creators collaborating on the campaign. |
| ^^^^creator_sales_num | string |  | The number of creators credited with at least one product sale. |
| ^^^^estimated_amount | string |  | The total payment amount corresponding to `paid_order_num`. |
| ^^^^estimated_partner_commission | string |  | The partner commission amount corresponding to paid_order_num. |
| ^^^^paid_order_num | string |  | The total number of paid orders. `paid_order_num` = `actual_order_num` + {number of paid but returned orders} |
| ^^^^promoted_creator_num | string |  | The number of creators involved in the partner plan. |
| ^^^^sample_requested_creator_num | string |  | The total number of creators that applied for a sample. |
| ^^^partner_commission_percent | string |  | The commission rate for the partner in the partner plan. The value is in hundredths of a percent. For example, a value of 1000 means 10.00%. |
| ^^^plan_commission_percent | string |  | The commission rate for open collaboration. The value is in hundredths of a percent. For example, a value of 1000 means 10.00%. |
| ^^^product_id | string |  | The product identifier. |
| ^^^product_name | string |  | The product name. |
| ^^^product_price | object |  | The product price. |
| ^^^^currency | string |  | The currency code for the maximum and minimum offered price for the product. |
| ^^^^max_price | string |  | The maximum offered price of the product. |
| ^^^^min_price | string |  | The minimum offered price of the product. |
| ^^^product_status | string |  | The product status. This is an enumerated type with values: -  PRODUCT_UNSPECIFIED -  PRODUCT_PENDING -  PRODUCT_APPROVED -  PRODUCT_REJECTED -  PRODUCT_PENDING_CLOSED -  PRODUCT_CLOSED |
| ^^^product_stock_count | string |  | The total number of products in stock. |
| ^^^product_thumbnail | object |  | An object representing the product thumbnail. |
| ^^^^uri | string |  | The base URI of the product. |
| ^^^^url_list | array<string> |  | A list of URLs for each image associated with the product. |
| ^^^total_commission_percent | string |  | The commission rate of the partner plan. It is the sum of the `creator_commission_rate` and `partner_commission_rate`. The value is in hundredths of a percent. For example, a value of 1000 means 10.00%. |
| ^^collaborated_creators_num | integer |  | The total number of creators associated with the campaign. |
| ^^creator_sales_num | integer |  | The number of products sold in the campaign. |
| ^^data_update_time | string |  | The time at which the product data was last updated, in Unix epoch format. |
| ^^promoted_creator_num | integer |  | The number of the creators involved in the campaign. |
| ^^sample_requested_creator_num | integer |  | The total number of samples requested by all creators associated with the campaign. |
| ^next_page_token | string |  | next page query token |
| ^total_count | integer |  | The total count of products included in the specified campaign. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorProductContentStatistics

Get statistics on creator's marketing video content

**Path:** `/affiliate_partner/202501/campaigns/{campaign_id}/products/{product_id}/creator/{creator_temp_id}/content/statistics`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-product-content-statistics-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |
| creator_temp_id | string | Y | A time-limited identifier associated with the creator that is valid for one hour. This identifier is valid to retrieve content performance data associated with the creator. Refer to `promotion_creators.creator.creator_temp_id` in the response of Get Affiliate Campaign Creator Fulfillment Status Info gateway. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| affiliate_product_id | string | Y | The affiliate product identifier to be included in the response. Refer to `promotion_creators.affiliate_product_id` in the response of Get Affiliate Campaign Creator Fulfillment Status Info gateway. |
| content_type | string |  | Content type.Identify content as video or live. - 1: VIDEO - 2: LIVE_ROOM |

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
| ^creator_content_statistics | array<object> |  | A list of objects that represent content statistics for the associated creator. |
| ^^comment_num | string |  | The number of TikTok user comments associated with the live room or video. |
| ^^content_end_date | string |  | When content_type == VIDEO, this field is None; when content_type == LIVE_ROOM, this is the date when the live ended. The value is in YYYY_MM_DD format. |
| ^^content_type | string |  | Content type.Identify content as video or live. - 1: VIDEO - 2: LIVE_ROOM |
| ^^cover_img_url | string |  | A URL for the live room cover image in the TikTok CDN.The video content doesn't have this value. |
| ^^like_count | string |  | The number of TikTok user likes associated with the live room or video. |
| ^^linked_tiktok_video | string |  | The friendly URL for the video on the TikTok website. |
| ^^paid_amount | string |  | The aggregate value of product orders associated with the live room or video. |
| ^^paid_order_num | string |  | The total number of paid orders associated with the live room or video. |
| ^^published_date | string |  | When content_type == VIDEO, this is the date when the video was published; when content_type == LIVE_ROOM, this is the date when the live started. The value is in YYYY_MM_DD format. |
| ^^source_url | string |  | The URL on the public TikTok website at which the live room video can be played back. When content_type == VIDEO, the value is the url of the source video; when content_type == LIVE_ROOM, the value is the url where you can play back the recording of the live. |
| ^^view_count | string |  | The number of public views of the live room or video. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorProductSampleStatus

Get progress on creator's sample status

**Path:** `/affiliate_partner/202501/campaigns/{campaign_id}/products/{product_id}/creator/{creator_temp_id}/content/statistics/sample/status`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-product-sample-status-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |
| creator_temp_id | string | Y | A time-limited identifier associated with the creator that is valid for one hour. This identifier is valid to retrieve content performance data associated with the creator.`promotion_creators.creator.creator_temp_id` in the response of Get Affiliate Campaign Creator Fulfillment Status Info gateway. |

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
| ^sample_status | object |  | The creator's sample status |
| ^^delivery_option | string |  | The delivery option: - ECONOMY_SHIPPING - PREMIUM_SHIPPING |
| ^^estimated_earliest_delivery_date | string |  | The earliest estimated delivery date in Unix epoch format. |
| ^^estimated_latest_delivery_date | string |  | The longest estimated delivery date in Unix epoch format. |
| ^^quantity | integer |  | The quantity of products delivered. |
| ^^shipping_provider_name | string |  | The name of the shipping provider |
| ^^tracking_results | array<object> |  | A list of objects representing tracking events. |
| ^^^tracking_event_description | string |  | The title of the tracking event. - THE_PACKAGE_HAS_BEEN_DELIVERED - OUT_FOR_DELIVERY - ORDER_PACKED_AND_READY_FOR_DROP_OFF_AT_CARRIERS_FACILITY - ORDER_PLACED |
| ^^^tracking_event_description_extended | string |  | More information about the tracking event |
| ^^^tracking_event_update_date | string |  | The date at which the tracking event was last updated, in Unix epoch format. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorFulfillmentStatusInfo

This API offers the ability to get the product fulfillment status for creators who added partner campaign products to their showcase

**Path:** `/affiliate_partner/202501/campaigns/{campaign_id}/products/{product_id}/performance`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-fulfillment-status-info-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The number of results to be returned per page. Valid range: 1-50. |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

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
| ^next_page_token | string |  | Querying next page need this token. |
| ^promotion_creators | array<object> |  | A list of objects representing information about the Affiliate Creator associated with the product promotion. |
| ^^affiliate_product_id | string |  | The affiliate product identifier. |
| ^^commission | string |  | The commission rate in hundredths of a percent (0.01%). For example, a value of 1000 is 10.00%. |
| ^^creator | object |  | An object representing information about the creator associated with the promotion. |
| ^^^avatar_url | string |  | A URL for the creator's avatar image in the TikTok CDN. |
| ^^^creator_temp_id | string |  | A time-limited identifier associated with the creator that is valid for one hour. This identifier is valid to retrieve content performance data associated with the creator. |
| ^^^follower_num | integer |  | The total count of TikTok followers for the creator. |
| ^^^nick_name | string |  | The TikTok nickname of the creator. |
| ^^^user_name | string |  | user name |
| ^^effective_end_time | string |  | The effective end time for the collaboration in Unix epoch time format. |
| ^^effective_start_time | string |  | The effective start time for the collaboration in Unix epoch time format. |
| ^^free_sample_status | string |  | Status of the Creator's sample application. - NOT_REQUESTED - PENDING - AWAITING_SHIPMENT - AWAITING_COLLECTION - SHIPPED - CONTENT_PENDING - REJECT_CANCELLED - OVERDUE_CANCELLED - UNFULFIL_CANCELLED - DEL_PLAN_CANCELLED - SELLER_NOT_SHIP_CANCELLED - WITHDRAW_CANCELLED - UNFULFILLABLE_CANCELLED - OPERATOR_MANUAL_CANCELLED - OPERATOR_MANUAL_FAILED - OPERATOR_MANUAL_COMPLETED - COMPLETED |
| ^^paid_amount | object |  | An object representing the total amount paid for this product. |
| ^^^amount | string |  | The total amount paid for this product. |
| ^^^currency | string |  | The currency code for the amount field. |
| ^^room_count | integer |  | The number of live broadcast rooms associated with this promotion. |
| ^^video_count | integer |  | The total number of videos associated with this promotion published by creators. |
| ^total_creator_count | integer |  | The total number of creators involved in the campaign. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCAPAffiliateOrders

Search the list of affiliate orders of the specified date range from a MCN or known as CAP - Creator Agency partner

**Path:** `/affiliate_partner/202504/cap_order/search`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/search-capaffiliate-orders-202504

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | The next page token |
| page_size | integer | Y | The default is 20, it must be positive integer, the range is 1-100 |
| category_asset_cipher | string | Y | The partner identifier used in API requests.  Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | Unix timestamp representing the start of transactions time range one wants to request |
| create_time_lt | integer |  | Unix timestamp representing the end of transactions time range one wants to request |
| order_id | string |  | Transaction main order ID |
| order_status | integer |  | Status order for product sales |
| product_id | string |  | Unique identifier for Product |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Cursor used for searching for more information |
| ^orders | array<object> |  | Order list |
| ^^create_time | integer |  | Time and date of order created, UTC+0 timing |
| ^^delivery_time | integer |  | Time and date order delivered, UTC+0 timing |
| ^^id | string |  | Transaction main order ID |
| ^^skus | object |  | SKUs |
| ^^^actual_bonus_commission | object |  | Actual commission on sales that a creator will receive from seller/advertisers purchasing a specific creative |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_commission | object |  | Commission given to well-performed creators by TTS |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_commission_base | object |  | The actual commission base is the product sale price multiplied by the number of products sold, excluding returned and refunded orders. |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^actual_shop_ads_commission | object |  | actual commission on sales that a creator will receive from seller/advertisers purchasing a specific creative |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^agency_bonus_commission | object |  | actual total bonus commission on sales that  agency will receive after commission split |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^agency_commission | object |  | actual total standard commission on sales that  agency will receive after commission split |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^agency_commission_rate | string |  | Percentage of agency commission |
| ^^^agency_shop_ads_commission | object |  | actual total shop ads commission on sales that  agency will receive after commission split |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^attribution_type | string |  | Direct: Orders placed when customers click on links creators shared and buy from the shop. The commission rate is higher than indirect attribution. Indirect: Orders placed from the Recommendations page through links creators shared. The commission rate is lower than direct attribution. |
| ^^^commission_bonus_rate | string |  | TTS to creator percentage commission bonus |
| ^^^commission_model | string |  | Determine order commission be calculated based on fixed commission model or tiering model |
| ^^^commission_rate | string |  | Between Seller & Creator percentage commission |
| ^^^commission_tier_setting | string |  | Between Seller & Creator percentagecommission. When tiering commission model applied, will return each tier's commission rate seller set. |
| ^^^content_id | string |  | Unique identifier for content |
| ^^^content_type | string |  | The content format of the creator content through which the order was created. Possible values: - SHOP - VIDEO - LIVE - PRE_LIVE - PROMOTION_PAGE - LINKSHARE |
| ^^^creator_username | string |  | Creator username |
| ^^^estimated_bonus_commission | object |  | Estimated commission TTS pays well-performed creators |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_commission | object |  | Estimated commission on sales that a creator will obtain |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_commission_base | object |  | The estimated commission base is the product sale price multiplied by the number of products sold when the order is created. |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^estimated_shop_ads_commission | object |  | Estimated commission on sales that a creator will receive from seller/advertisers purchasing a specific creative |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^id | string |  | The SKU identifier. |
| ^^^isr | string |  | Tax amount be charged on behalf the agency by platform, which only used in MX |
| ^^^iva | string |  | Tax amount be charged on behalf the agency by platform, which only used in MX |
| ^^^open_collaboration_id | string |  | The open collaboration identifier associated with the order. |
| ^^^price | object |  | The SKU selling price information |
| ^^^^amount | string |  | Price amount for product, such as USD 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^^product_id | string |  | Unique identifier for Product |
| ^^^product_name | string |  | Product name / description |
| ^^^quantity | integer |  | Total sku quantity per order |
| ^^^refunded_quantity | integer |  | Number of sku returned per order |
| ^^^returned_quantity | integer |  | Number of sku refunded per order |
| ^^^shop_ads_commission_rate | string |  | Commission on sales that a creator will receive from seller/advertisers purchasing a specific creative |
| ^^^shop_name | string |  | Shop / Seller name |
| ^^^target_collaboration_id | string |  | The target collaboration identifier associated with the order. |
| ^^^total_agency_commission | object |  | Total actual agency commission earned from this order. |
| ^^^^amount | string |  | Price amount for product, such as Rp 1000 |
| ^^^^currency | string |  | Type of currency use |
| ^^status | string |  | Status order for product sales The order status. Possible values: 1. "ALL" 2. "PROCESSING" 3. "COMPLETED" 4. "CANCELLED" 5. "FROZEN" 6. "DEDUCTED" |
| ^^tags | string |  | The customizable ID for each order, used for tracking performance at difference front end modules. |
| ^total_count | integer |  | The total number of orders |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartnerGenerateMultiAffiliateCampaignProductLink

This API offers the ability to generate promotion links for multiple products in a campaign.

**Path:** `/affiliate_partner/202505/campaigns/{campaign_id}/products/promotion_links/generate_batch`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/partner-generate-multi-affiliate-campaign-product-link-202505

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The ID of the campaign |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_asset_cipher | string |  | The partner identifier used in API requests. Retrieve this value by using the [Get Authorized Category Assets API] (https://partner.tiktokshop.com/docv2/page/666012dd609d4402cc3be995). |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The list of product IDs. The max length is 50. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^failed_product_ids | array<string> |  | The list of products for which the promotion links failed to be generated. |
| ^product_promotion_links | array<object> |  | The list of products for which the promotion links are generated successfully. |
| ^^link | string |  | This is the product promotion link that agencies can share with collaborated creators. Creators can copy/paste this link into the web browser. Creators will be re-directed to the add-product-link page in the Tikotk app. Creators can decide whether to add products to their showcases in the pop-up window. |
| ^^product_id | string |  | The ID of the product to promote. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorProductContentStatistics

Get statistics on creator's marketing video content

**Path:** `/affiliate_partner/202508/campaigns/{campaign_id}/products/{product_id}/creator/{creator_temp_id}/content/statistics`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-product-content-statistics-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |
| creator_temp_id | string | Y | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| affiliate_product_id | string | Y | The affiliate product identifier to be included in the response. Refer to `promotion_creators.affiliate_product_id` in the response of Get Affiliate Campaign Creator Fulfillment Status Info gateway. |
| content_type | string |  | Content type.Identify content as video or live. - 1: VIDEO - 2: LIVE_ROOM |

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
| ^creator_content_statistics | array<object> |  | A list of objects that represent content statistics for the associated creator. |
| ^^comment_num | string |  | The number of TikTok user comments associated with the live room or video. |
| ^^content_end_date | string |  | When content_type == VIDEO, this field is None; when content_type == LIVE_ROOM, this is the date when the live ended. The value is in YYYY_MM_DD format. |
| ^^content_type | string |  | Content type.Identify content as video or live. - 1: VIDEO - 2: LIVE_ROOM |
| ^^cover_img_url | string |  | A URL for the live room cover image in the TikTok CDN.The video content doesn't have this value. |
| ^^like_count | string |  | The number of TikTok user likes associated with the live room or video. |
| ^^linked_tiktok_video | string |  | The friendly URL for the video on the TikTok website. |
| ^^paid_amount | string |  | The aggregate value of product orders associated with the live room or video. |
| ^^paid_order_num | string |  | The total number of paid orders associated with the live room or video. |
| ^^published_date | string |  | When content_type == VIDEO, this is the date when the video was published; when content_type == LIVE_ROOM, this is the date when the live started. The value is in YYYY_MM_DD format. |
| ^^source_url | string |  | The URL on the public TikTok website at which the live room video can be played back. When content_type == VIDEO, the value is the url of the source video; when content_type == LIVE_ROOM, the value is the url where you can play back the recording of the live. |
| ^^view_count | string |  | The number of public views of the live room or video. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAffiliateCampaignCreatorProductSampleStatus

Get progress on creator's sample status

**Path:** `/affiliate_partner/202508/campaigns/{campaign_id}/products/{product_id}/creator/{creator_temp_id}/content/statistics/sample/status`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-affiliate-campaign-creator-product-sample-status-202508

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| campaign_id | string | Y | The campaign identifier. |
| product_id | string | Y | The product identifier. |
| creator_temp_id | string | Y | Creator Open ID. [More details](https://partner.tiktokshop.com/docv2/page/3obfokj6) |

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
| ^sample_status | object |  | The creator's sample status |
| ^^delivery_option | string |  | The delivery option: - ECONOMY_SHIPPING - PREMIUM_SHIPPING |
| ^^estimated_earliest_delivery_date | string |  | The earliest estimated delivery date in Unix epoch format. |
| ^^estimated_latest_delivery_date | string |  | The longest estimated delivery date in Unix epoch format. |
| ^^quantity | integer |  | The quantity of products delivered. |
| ^^shipping_provider_name | string |  | The name of the shipping provider |
| ^^tracking_results | array<object> |  | A list of objects representing tracking events. |
| ^^^tracking_event_description | string |  | The title of the tracking event. - THE_PACKAGE_HAS_BEEN_DELIVERED - OUT_FOR_DELIVERY - ORDER_PACKED_AND_READY_FOR_DROP_OFF_AT_CARRIERS_FACILITY - ORDER_PLACED |
| ^^^tracking_event_description_extended | string |  | More information about the tracking event |
| ^^^tracking_event_update_date | string |  | The date at which the tracking event was last updated, in Unix epoch format. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
