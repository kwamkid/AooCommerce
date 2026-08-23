# TikTok Shop API — product

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 77 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202312, 202401, 202404, 202405, 202407, 202409, 202411, 202501, 202502, 202503, 202505, 202506, 202507, 202508, 202509, 202601

---

## GetBrands

Retrieve all available brands for your shop, including the built-in brands and any custom brands created using the [Create Custom Brands API](650a0926f1fd3102b91bbfb0). Pass the returned brand ID when creating or editing a product to associate the brand with the product.
- To check if a brand is fully authorized for use in a specific product category, specify the **category ID**.
- To obtain the full list of brands that your shop can potentially use and their authorization status, omit the category ID. We recommend that you specify the **brand name** to narrow down the list of brands returned.
**Key concept**
Whether you can select and display a brand depends on the brand's authorization status, the categories authorized for the brand, and whether the brand is classified as T1 (internationally renowned brands that require prior brand authorization).
**- Brand selection rules**: You can only select the following types of brands during product creation/editing.
   - Authorized brands which contain the desired category (`authorized_status=AUTHORIZED` and `brand_status=AVAILABLE`)
   - Unauthorized non-T1 brands (`authorized_status=UNAUTHORIZED` and `is_t1_brand=false`) 
**- Brand display rules**: Note however that brands will only appear on the product display page if the brand is authorized (`authorized_status=AUTHORIZED`) and available in the desired category (`brand_status=AVAILABLE`). This means that you need to obtain brand authorization for unauthorized non-T1 brands before they can be displayed. Obtain brand authorization or add categories to an authorized brand through TikTok Shop Seller Center > Qualification Center > Brand qualification.
**For Tokopedia sellers**: You can select and display any returned brand on Tokopedia regardless of these rules.

**Path:** `/product/202309/brands`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-brands-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string |  | Specify a category ID to show the availability of **authorized brands** in the category. **Note**: Specify this value to obtain an accurate list of brands that you can use in a category. |
| is_authorized | boolean |  | Filter results by the brand authorization status. Possible values: - 1: Returns only authorized brands - 0: Returns all brands |
| brand_name | string |  | Filter results to include brand names that begin with the specified value. |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| category_version | string |  | The category tree version that corresponds to the specified `category_id`. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: For US shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
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
| ^brands | array<object> |  | The list of brands that meet the query conditions. |
| ^^authorized_status | string |  | A status to indicate whether the seller has obtained prior authorization to sell goods bearing the brand's trademark, name, or logo. Possible values: - UNAUTHORIEZD - AUTHORIZED **Note**: If the brand is unauthorized, check `is_t1_brand` to determine if you can use it during product creation. |
| ^^brand_status | string |  | The availability of an **authorized brand** in the requested category. Possible values: - AVAILABLE - UNAVAILABLE **Note**: Not applicable if you did not specify the category ID, or the brand is unauthorized. |
| ^^id | string |  | The brand ID. |
| ^^is_t1_brand | boolean |  | A flag to indicate whether the brand is a T1 brand, which refers to internationally renowned brands that may have compliance risks and require sellers to obtain brand authorization. **Note**: - You cannot create products with unauthorized T1 brands. - You can create products with unauthorized non-T1 brands, **but** the brand information will not appear on the product display page. You can obtain authorization by submitting the required qualifications through TikTok Shop Seller Center > Qualification Center > Brand qualification. |
| ^^name | string |  | The brand name. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The total count of brands that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateCustomBrands

Create custom brands for your own use across all markets.
Authorization is not required when creating a brand. You can create the brand first and obtain brand authorization later through the Qualification Center in TikTok Shop Seller Center.
**Note**: You can create up to 50 brands per day, with a total limit of 1,000 brands.

**Path:** `/product/202309/brands`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-custom-brands-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| name | string |  | The brand name. **Note**: - Length: [2, 30] - No language restrictions, but do not use Chinese. - The name will not be translated into multiple languages. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^id | string |  | A unique ID that identifies the brand in TikTok Shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RecommendBrand

This API recommends the Category for each product, based on product title.

**Path:** `/product/202309/brands/recommend`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/recommend-brand-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| language | string |  | Providing the language that corresponds to the product name. If not provided, it will default to en. EN, ID, MS, TH, VI. Use BCP-47 language codes.For more details, please refer to http://www.unicode.org/reports/tr35/#Unicode_locale_identifier. |
| product_title | string |  | You can provide the product title to complete brand recommendations. - Chinese characters are not allowed in the product title. - The product name must have at least 1 character and no more than 255 [1,255] |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^brand | object |  | Brand of the brand recommended by the platform. |
| ^^id | string |  | Brand ID of the brand recommended by the platform. |
| ^^name | string |  | The Brand name |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCategories

Retrieve the list of product categories available for your shop.
Product categories are updated frequently, so it's recommended to call the API in real time to ensure you are using the latest category data. Caching category data locally may result in using outdated information, leading to errors when creating products.
**For the Indonesia market**: To list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. Please call this API twice to identify the overlapping categories.

**Path:** `/product/202309/categories`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-categories-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying category information. Default: The default locale of your shop. Possible values: - `de-DE` - `en-GB` - `en-IE` - `en-US` - `es-ES` - `es-MX` - `fr-FR` - `id-ID` - `it-IT` - `ja-JP` - `ms-MY` - `pt-BR` - `th-TH` - `vi-VN` - `zh-CN` |
| keyword | string |  | Filter categories by this keyword in `local_name`. |
| category_version | string |  | Filter categories by the category tree version. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: For US shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| listing_platform | string |  | Filter categories by the specified platform. Possible values: - TIKTOK_SHOP - TOKOPEDIA Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| include_prohibited_categories | boolean |  | A flag to indicate whether to include categories that are prohibited on TikTok Shop. Set this to `true` to identify which are the product categories that you can't list on TikTok Shop in any circumstances. Applicable only for BR, MX, EU and SEA markets. |
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
| ^categories | array<object> |  | The list of categories that meet the query conditions. |
| ^^id | string |  | The category ID. |
| ^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. **Note**: You can only create or edit products that belong to a leaf category. |
| ^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^parent_id | string |  | The parent category ID. For the root category, the parent ID is `0`. |
| ^^permission_statuses | array<string> |  | The shop's permission status for this category. Possible values: - `AVAILABLE`: You have the permission to create products in this category. - `INVITE_ONLY`: This is a restricted category and you do not have permission to use it. Submit an application through the Qualification Center on TikTok Shop Seller Center to gain access. In Seller Center, `INVITE_ONLY` is also known as "restricted". - `NON_MAIN_CATEGORY`: This category is out of scope for this shop, and you do not have permission to use it.  Contact your account manager for assistance. - `PROHIBITED`: This category is prohibited on TikTok Shop. Do not attempt to list products in this category as they will be rejected during audit. Applicable only for BR, MX, EU and SEA markets. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RecommendCategory

Retrieve the recommended category for a candidate product based on its title, description, and images.
If you are syncing product catalogs from an external system to TikTok Shop, use this API to facilitate product categorization.
**Note**: The language used in text fields such as descriptions and titles must align with the target market's language (e.g. don't use Chinese).

**Path:** `/product/202309/categories/recommend`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/recommend-category-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_version | string |  | The category tree version to use for this product. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: For US shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| images | array<object> |  | Product images, including gallery images, images that appear in the description, product variant images. |
| ^uri | string |  | The URI of the image. Retrieve the URI from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| include_prohibited_categories | boolean |  | A flag to indicate whether to include matching categories that are prohibited on TikTok Shop. Set this to `true` to identify if the product falls under a category that you can't list on TikTok Shop in any circumstances. **Note**: - Applicable only for BR and MX markets. - Default: `false` |
| listing_platform | string |  | Recommend categories that belong to the specified platform. Possible values: - TIKTOK_SHOP - TOKOPEDIA Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| product_title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^categories | array<object> |  | Recommended category information. |
| ^^id | string |  | The category ID. |
| ^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. **Note**: You can only create or edit products that belong to a leaf category. |
| ^^level | integer |  | The category level. |
| ^^name | string |  | The category name. |
| ^^permission_statuses | array<string> |  | The shop's permission status for this category. Possible values: - AVAILABLE: You have the permission to create products in this category. - INVITE_ONLY: This is a restricted category and you do not have permission to use it. Submit an application through the Qualification Center on TikTok Shop Seller Center to gain access. In Seller Center, `INVITE_ONLY` is also known as "restricted". - PROHIBITED: This category is prohibited on TikTok Shop. If your product falls under this category, do not attempt to list it, as it will be rejected during audit. Applicable only for BR and MX markets. |
| ^leaf_category_id | string |  | The recommended category ID. This is always a leaf category. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAttributes

Retrieve the standard built-in product and sales attributes for listing a product in a particular category based on your shop's location.
Products on TikTok Shop are grouped into categories predefined by TikTok Shop, and each category is associated with a standard set of product attributes and sales attributes.
- **Sales attributes** (e.g. size, color, length) define product variants and are optional if your product is straightforward and has no variants.
- **Product attributes** (e.g. manufacturer, country of origin, materials used) describe the product as a whole, regardless of variant. Some product attributes are mandatory based on listing policies.
Use this API to determine the mandatory and optional attributes before listing a product.
**Note**: It must be a [leaf category](6509c89d0fcef602bf1acd9b) that corresponds to the category tree type specified in the `category_version` property.

**Path:** `/product/202309/categories/{category_id}/attributes`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-attributes-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | The ID of the category of this product. It must be a leaf category. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying the attribute information. Default: The default locale of your shop. Possible values: - `de-DE` - `en-GB` - `en-IE` - `en-US` - `es-ES` - `es-MX` - `fr-FR` - `id-ID` - `it-IT` - `ja-JP` - `ms-MY` - `pt-BR` - `th-TH` - `vi-VN` - `zh-CN` |
| category_version | string |  | The category tree version that corresponds to the specified `category_id`. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: For US shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
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
| ^attributes | array<object> |  | The list of standard built-in product and sales attributes that are bound to the specified category, based on your shop's location. |
| ^^id | string |  | The ID of the built-in attribute. |
| ^^is_customizable | boolean |  | A flag to indicate if the product attribute value can be customized by sellers when creating or editing a product. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^is_multiple_selection | boolean |  | A flag to indicate if multiple values can be provided for a product attribute when creating or editing a product. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^is_requried | boolean |  | A flag to indicate if the product attribute is always required when creating or editing a product. - true: The attribute is always required. - false: The attribute is not required, or required only if certain conditions are met. Refer to `requirement_conditions` for the specific requirements. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^name | string |  | The name of the built-in attribute. |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the product attribute is required based on the seller's inputs for other attributes. If any of the conditions is met, the attribute is required; otherwise, it is optional. For example, there's a condition that states that the "Battery type" attribute is required if the seller selects the value "Batteries" for the attribute "Contains Batteries or Cells?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide - CAT-PRE-HAZMAT](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `type=PRODUCT_PROPERTY` and `is_requried=false`. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_id | string |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^^condition_type | string |  | The type of condition, such as matching values, or range comparisons. Possible values: - VALUE_ID_MATCH: The condition is true when the seller selects a value whose ID matches the one specified in this condition. |
| ^^type | string |  | The attribute type. Possible values: - SALES_PROPERTY: Indicates sales attributes that define product variants. - PRODUCT_PROPERTY: Indicates product attributes that describe the product as a whole. |
| ^^value_data_format | string |  | The supported data type and structure of the attribute value for free-form entries, such as strings, integers, or positive decimals. Applicable only for **conditional (cascading) attributes**, not for standard attributes. Possible values: - POSITIVE_INT_OR_DECIMAL: Positive integers or decimal numbers. |
| ^^values | array<object> |  | A list of selectable values for the attribute. |
| ^^^icon_url | string |  | The icon url value of the built-in attribute value. |
| ^^^id | string |  | The ID of the built-in attribute value. |
| ^^^name | string |  | The name of the built-in attribute value. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalAttributes

Retrieve the standard built-in product and sales attributes for listing a global product in a particular category, regardless of market variations.
Products on TikTok Shop are grouped into categories predefined by TikTok Shop, and each category is associated with a standard set of product attributes and sales attributes.
- **Sales attributes** (e.g. size, color, length) define product variants and are optional if your product is straightforward and has no variants.
- **Product attributes** (e.g. manufacturer, country of origin, materials used) describe the product as a whole, regardless of variant. Some product attributes are mandatory based on listing policies.
Use this API to determine the mandatory and optional attributes before listing a global product.
**Note**: It must be a [leaf category](650a03f8f1fd3102b91b338a) that corresponds to the category tree type specified in the `category_version` property.

**Path:** `/product/202309/categories/{category_id}/global_attributes`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-attributes-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | The ID of the category. It must be a leaf category. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying the attribute information. Default: en-US Possible values: - `de-DE` - `en-GB` - `en-IE` - `en-US` - `es-ES` - `es-MX` - `fr-FR` - `id-ID` - `it-IT` - `ja-JP` - `ms-MY` - `th-TH` - `vi-VN` - `zh-CN` |
| category_version | string |  | The category tree version that corresponds to the specified `category_id`. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |

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
| ^attributes | array<object> |  | The list of standard built-in product and sales attributes that are bound to the specified category. |
| ^^id | string |  | The ID of the built-in attribute. |
| ^^is_customizable | boolean |  | A flag to indicate if the product attribute value can be customized by sellers when creating or editing a product. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^is_multiple_selection | boolean |  | A flag to indicate if multiple values can be provided for a product attribute when creating or editing a product. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^is_requried | boolean |  | A flag to indicate if the product attribute is required **globally** when creating or editing a product. - true: The attribute is required in all regions. - false: The attribute is required only in some regions, or if certain conditions are met. Refer to `required_regions` and `requirement_conditions` for the specific requirements. Applicable only if `type=PRODUCT_PROPERTY`. |
| ^^name | string |  | The name of the built-in attribute. |
| ^^optional_regions | array<string> |  | The markets where the attribute is purely optional, or required only under certain conditions. Refer to `requirement_conditions` for details on markets with conditional requirements. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico Applicable only if `is_requried=false`. |
| ^^required_regions | array<string> |  | The markets where the attribute is required, without conditions. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico Applicable only if `is_requried=false`. |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the product attribute is required based on the seller's inputs for other attributes. If any of the conditions is met, the attribute is required; otherwise, it is optional. For example, there's a condition that states that the ""Battery type"" attribute is required if the seller selects the value ""Batteries"" for the attribute ""Contains Batteries or Cells?"". For more scenario-based guidance on using this parameter, refer to the [Solution Guide](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `type=PRODUCT_PROPERTY` and `optional_regions` is not empty. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_id | string |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^^condition_type | string |  | The type of condition, such as matching values, or range comparisons. Possible values: - VALUE_ID_MATCH: The condition is true when the seller selects a value whose ID matches the one specified in this condition. |
| ^^^region | string |  | The market where the attribute is required when the conditions are met. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico |
| ^^type | string |  | The attribute type. Possible values: - SALES_PROPERTY: Indicates sales attributes that define product variants. - PRODUCT_PROPERTY: Indicates product attributes that describe the product as a whole. |
| ^^values | array<object> |  | A list of selectable values for the attribute. |
| ^^^id | string |  | The ID of the built-in attribute value. |
| ^^^name | string |  | The name of the built-in attribute value. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalCategoryRules

Retrieve the additional requirements (beyond mandatory product attributes) for listing a global product in a particular category, regardless of market variations. Requirements may include product certifications, size charts, dimensions and more.
Use this API to determine the supporting information that you must prepare before listing a global product.
**Note**: It must be a [leaf category](650a03f8f1fd3102b91b338a) that corresponds to the category tree type specified in the `category_version` property.

**Path:** `/product/202309/categories/{category_id}/global_rules`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-category-rules-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | The ID of the category. It must be a leaf category. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_version | string |  | The category tree version that corresponds to the specified `category_id`. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| locale | string |  | The BCP-47 locale codes for displaying category information. Default: en-US Possible values: - `de-DE` - `en-GB` - `en-IE` - `en-US` - `es-ES` - `es-MX` - `fr-FR` - `id-ID` - `it-IT` - `ja-JP` - `ms-MY` - `th-TH` - `vi-VN` - `zh-CN` |

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
| ^manufacturer | object |  | Manufacturer rules. If this is empty, it means a manufacturer is not required for this category. Applicable only for EU markets. |
| ^^is_required | boolean |  | A flag to indicate whether the manufacturer is required for **all EU markets**. - true: The manufacturer is required in all EU markets. - false: The manufacturer is required only in some EU markets. Refer to `required_regions` and `optional_regions` for details. |
| ^^optional_regions | array<string> |  | The markets where the manufacturer is optional. Possible values: - DE: Germany - ES: Spain - FR: France - IT: Italy - IE: Ireland |
| ^^required_regions | array<string> |  | The markets where the manufacturer is required. Possible values: - DE: Germany - ES: Spain - FR: France - IT: Italy - IE: Ireland |
| ^product_certifications | array<object> |  | Certification related rules. As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. If this is empty, it means certifications are not required for this category. |
| ^^id | string |  | The ID to identify the type of certification required. |
| ^^is_required | boolean |  | A flag to indicate if the certification is required **globally**. - true: The certification is required in all regions. - false: The certification is required only in some regions, or if certain conditions are met. Refer to `required_regions` and `requirement_conditions` for the specific requirements. |
| ^^name | string |  | The name of the certification type. |
| ^^optional_regions | array<string> |  | The markets where the certification is purely optional, or required only under certain conditions. Refer to `requirement_conditions` for details on markets with conditional requirements. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico Applicable only if `is_required=false`. |
| ^^required_regions | array<string> |  | The markets where the certification is required, without conditions. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico Applicable only if `is_required=false`. |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the certification is required in a market based on the seller's inputs for a product attribute. If any of the conditions is met, the certification is required; otherwise, it is optional. For example, there's a condition that states that the "Safety Data Sheet (SDS) for flammable materials" certification is required if the seller selects the value "Yes" for the attribute "Flammable Liquid?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `optional_regions` is not empty. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_id | string |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^^condition_type | string |  | The type of condition, such as matching values, or range comparisons. Possible values: - VALUE_ID_MATCH: The condition is true when the seller selects a value whose ID matches the one specified in this condition. |
| ^^^region | string |  | The market where the certification is required when the conditions are met. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IT: Italy - IE: Ireland - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico |
| ^^sample_image_url | string |  | The URL to view an image of the sample certification document. |
| ^responsible_person | object |  | Responsible person rules. If this is empty, it means a responsible person is not required for this category. Applicable only for EU markets. |
| ^^is_required | boolean |  | A flag to indicate whether the responsible person is required for **all EU markets**. - true: The manufacturer is required in all EU markets. - false: The manufacturer is required only in some EU markets. Refer to `required_regions` and `optional_regions` for details. |
| ^^optional_regions | array<string> |  | The markets where the responsible person is optional. Possible values: - DE: Germany - ES: Spain - FR: France - IT: Italy - IE: Ireland |
| ^^required_regions | array<string> |  | The markets where the responsible person is required. Possible values: - DE: Germany - ES: Spain - FR: France - IT: Italy - IE: Ireland |
| ^size_chart | object |  | Size chart related rules. |
| ^^is_required | boolean |  | A flag to indicate whether a size chart is required. |
| ^^is_supported | boolean |  | A flag to indicate whether size charts are supported. **Note**: If size charts are not supported, even if you provide a size chart when creating or editing a product, the size chart will not be saved. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCategoryRules

Retrieve the additional requirements (beyond mandatory product attributes) for listing a product in a particular category based on your shop's location. Requirements may include product certifications, size charts, dimensions and more.
Use this API to determine the supporting information that you must prepare before listing a product.
**Note**: It must be a [leaf category](6509c89d0fcef602bf1acd9b) that corresponds to the category tree type specified in the `category_version` property.

**Path:** `/product/202309/categories/{category_id}/rules`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-category-rules-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | The ID of the category. It must be a leaf category. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_version | string |  | The category tree version that corresponds to the specified `category_id`. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: For US shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| locale | string |  | The BCP-47 locale codes for displaying category information. Default: en-US Possible values: - de-DE - en-GB - en-IE - en-US - es-ES - es-MX - fr-FR - id-ID - it-IT - ja-JP - ms-MY - pt-BR - th-TH - vi-VN - zh-CN |
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
| ^allowed_special_product_types | array<string> |  | The list of special product types, excluding regular products, that your shop is allowed to list in this category. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a release date. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a duration. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a duration. **UK and SEA** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a duration. **Note**: This field is omitted if you lack the permission to list special product types. Contact your account manager for assistance if you wish to list such products. |
| ^cod | object |  | Cash on Delivery (COD) related rules. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN |
| ^^is_supported | boolean |  | A flag to indicate whether COD is supported. **Note**: If COD is not supported, but you set `is_cod_allowed=true` when creating or editing a product, the listing will fail. |
| ^epr | object |  | Extended Producer Responsibility (EPR) related rules. |
| ^^is_required | boolean |  | A flag to indicate whether EPR is required. |
| ^fees | array<object> |  | Product fees related rules. |
| ^^is_required | boolean |  | A flag to indicate whether information about the fee is required. |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^manufacturer | object |  | Manufacturer related rules. Applicable only for the EU market. |
| ^^is_required | boolean |  | A flag to indicate whether the manufacturer information is required. |
| ^package_dimension | object |  | Package dimension related rules. |
| ^^is_required | boolean |  | A flag to indicate whether package dimensions are required. |
| ^product_certifications | array<object> |  | Certification related rules. As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. If this is empty, it means certifications are not required for this category. |
| ^^document_details | string |  | Details about the certification documents that you must submit, including the content, format, and any other guidelines. |
| ^^expiration_date | object |  | Certification expiration date related rules. |
| ^^^is_required | boolean |  | A flag to indicate whether an expiration date is required for this certification. |
| ^^id | string |  | The ID to identify the type of certification required. |
| ^^is_required | boolean |  | A flag to indicate if the certification is always required when creating or editing a product. - true: The certification is always required. - false: The certification is not required, or required only if certain conditions are met. Refer to `requirement_conditions` for the specific requirements. |
| ^^name | string |  | The name of the certification type. |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the certification is required based on the seller's inputs for a product attribute. If any of the conditions is met, the certification is required; otherwise, it is optional. For example, there's a condition that states that the "Safety Data Sheet (SDS) for flammable materials" certification is required if the seller selects the value "Yes" for the attribute "Flammable Liquid?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide - CAT-PRE-HAZMAT](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `is_required=false`. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_id | string |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^^condition_type | string |  | The type of condition, such as matching values, or range comparisons. Possible values: - VALUE_ID_MATCH: The condition is true when the seller selects a value whose ID matches the one specified in this condition. |
| ^^sample_image_url | string |  | The URL to view an image of the sample certification document. |
| ^responsible_person | object |  | Responsible person (RP) related rules. Applicable only for the EU market. |
| ^^is_required | boolean |  | A flag to indicate whether the responsible person information is required. |
| ^size_chart | object |  | Size chart related rules. |
| ^^is_required | boolean |  | A flag to indicate whether a size chart is required. |
| ^^is_supported | boolean |  | A flag to indicate whether size charts are supported. **Note**: If size charts are not supported, even if you provide a size chart when creating or editing a product, the size chart will not be saved. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadProductFile

Upload non-image files, such as PDF or video to TikTok Shop. 
Use this API when you need to add videos to your product to improve the shopping experience, or submit certifications or reports to meet TikTok Shop requirements for listing restricted products. 
**Note**: You must store the response body to retrieve the ID or URL required to associate the file with a product during product creation or editing.

**Path:** `/product/202309/files/upload`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-product-file-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | The local file to be uploaded. **Note**： - Supported formats: PDF, MP4, MOV, MKV, WMV, WEBM, AVI, 3GP, FLV, MPEG - Max PDF size: 20 MB - Max video size: 100 MB - Video aspect ratio: 9:16 to 16:9 **Recommendations for product videos**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| name | string |  | The name of the file, including the file extension (e.g. `certification.pdf`) **Note**: - Do not use additional periods, except the one preceding the file extension. - Do not begin the name with symbols. - Do not include spaces. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^format | string |  | The format of the file. Possible values: PDF, MP4, MOV, MKV, WMV, WEBM, AVI, 3GP, FLV, MPEG |
| ^id | string |  | The file ID generated by TikTok Shop. Pass this value when creating or editing a product to associate the file with the product. |
| ^name | string |  | The name of the file. |
| ^url | string |  | The URL to access and view the file. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalCategories

Retrieve all available product categories, regardless of market variations.
Product categories are updated frequently, so it's recommended to call the API in real time to ensure you are using the latest category data. Caching category data locally may result in using outdated information, leading to errors when creating global products.

**Path:** `/product/202309/global_categories`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-categories-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| locale | string |  | The BCP-47 locale codes for displaying category information. Default: en-US Possible values: - `de-DE` - `en-GB` - `en-IE` - `en-US` - `es-ES` - `es-MX` - `fr-FR` - `id-ID` - `it-IT` - `ja-JP` - `ms-MY` - `th-TH` - `vi-VN` - `zh-CN` |
| keyword | string |  | Filter categories by this keyword in `local_name`. |
| category_version | string |  | Filter categories by the category tree version. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |

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
| ^categories | array<object> |  | The list of categories that meet the query conditions. |
| ^^id | string |  | The category ID. |
| ^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. **Note**: You can only create or edit products that belong to a leaf category. |
| ^^local_name | string |  | The name of the category. |
| ^^parent_id | string |  | The parent category ID. For the root category, the parent ID is `0`. |
| ^^permission_statuses | array<string> |  | The shop's permission status for this category. Possible values: - AVAILABLE: You have the permission to create products in this category. - NON_MAIN_CATEGORY: This category is out of scope for this seller, and you do not have permission to use it.  Contact your account manager for assistance. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RecommendGlobalCategories

Retrieve the recommended categories for a candidate global product based on its title, description, and images.
If you are syncing product catalogs from an external system to TikTok Shop, use this API to facilitate product classification.
**Note**: Double-byte characters (e.g. Chinese characters) are not supported in text fields such as descriptions and titles. If you include them, the API request will fail.

**Path:** `/product/202309/global_categories/recommend`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/recommend-global-categories-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_version | string |  | The category tree version to use for this product. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| images | array<object> |  | Product images, including gallery images, images that appear in the description, product variant images. |
| ^uri | string |  | The URI of the image. Retrieve the URI from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| product_title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - MX:[1,300] - Other regions: [25, 255] |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^categories | array<object> |  | Recommended category information. |
| ^^id | string |  | The category ID. |
| ^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. **Note**: You can only create or edit products that belong to a leaf category. |
| ^^level | integer |  | The category level. |
| ^^name | string |  | The category name. |
| ^leaf_category_id | string |  | The recommended category ID. This is always a leaf category. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateGlobalProduct

Create global products to be sold in one or multiple shops outside of the seller's base country.
You can only create global products in `AVAILABLE` product categories. For other categories, contact your account manager for assistance. After product creation, use the [Publish Global Product API](https://partner.tiktokshop.com/docv2/page/650a64d6defece02be678fd6) to publish and translate the product in the desired markets.
**Key concept**: Global products are products created by cross-border sellers to be sold in shops outside of their base country. With global products, cross-border sellers operating across multiple markets can avoid creating the same product for each shop individually. Instead, they just need to create a single global product, which can be published and synced to all their shops, simplifying product management across markets.
**Note**:
- This API is applicable only for intra-EU sellers and global sellers. To create and list local products intended for sale exclusively in local shops, use the [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a) instead.
- There may be a limit to the number of products you can list per day. We recommend prioritizing the creation of key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.

**Path:** `/product/202309/global_products`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-global-product-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_id | string |  | The ID of the brand of this product. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. - It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. - It must be a main category (`categories.permission_statuses=AVAILABLE` in [Get Global Categories API](650a03f8f1fd3102b91b338a)). **Note**: Refer to TikTok Shop Academy for information on product category restrictions. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US and SEA regions: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US or SEA shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_global_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer | object |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use `manufacturer_ids` instead.) The product manufacturer's details. **Note**: You must fill in all the nested properties for the manufacturer's information to be valid. |
| ^address | string |  | The address of the manufacturer. |
| ^email | string |  | The email address of the manufacturer. |
| ^name | string |  | The name of the manufacturer. |
| ^phone_number | string |  | The phone number of the manufacturer, prefixed by a plus `+` symbol. There must be a space or hyphen between the country code and the local phone number. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies may lead to additional shipping fees. |
| ^height | string |  | The package height. A positive whole number. |
| ^length | string |  | The package length. A positive whole number. |
| ^unit | string |  | The unit for the package dimensions. Only `CENTIMETER` is supported. |
| ^width | string |  | The package width. A positive whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that the measurements are accurate. Any discrepancies may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Only `KILOGRAM` is supported. |
| ^value | string |  | The package weight, which must be a positive number with up to 3 decimal places. |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^values | array<object> |  | A list of selectable values for the product attribute. Max count: 300 for US; 100 for other regions. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of a built-in product attribute value, retrieved from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters - Supports only alphabets and numbers. |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e) to check the requirements. - If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for EU, JP, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^global_quantity | integer |  | The total SKU inventory quantity across all shops globally. The inventory for each local shop is automatically calculated when a product is first published. After publishing, this global quantity cannot be manually changed. You can only modify the inventory quantity in each local shop. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **IMPORTANT**: This object and its values can only be modified when the product is in DRAFT status. Once submitted for review, changes are not allowed. Please define the values carefully. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information per warehouse. If multi-warehouse is enabled in Seller Center, you must provide the inventory details for each warehouse. Max count: 50 **Note**: `global_quantity` will not take effect if inventory details are provided for each warehouse. |
| ^^global_warehouse_id | string |  | The ID of the global warehouse where the SKU is stored. Retrieve the list of global warehouses available for the seller from the [Get Global Seller Warehouse API](https://partner.tiktokshop.com/docv2/page/650aa3f0defece02be6e5ffb). |
| ^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 99,999] |
| ^price | object |  | The SKU's **global uniform pre-tax** price that serves as the baseline for calculating the local prices across different markets. **Note**: - Upon publishing, this price will be automatically converted to the local pre-tax price and local display price based on market-specific exchange rates and applicable charges such as shipping costs, taxes, and other fees. - The auto-conversion will exclude JP and US shops using China warehouses. |
| ^^amount | string |  | The price amount. Max: 99,999,999.99 |
| ^^currency | string |  | The currency. Possible values: - `USD`: Applicable for global sellers - `EUR`: Applicable for intra-EU sellers |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You can omit this object if there is only 1 SKU. Otherwise, this is **required**. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of a built-in sales attribute, retrieved from [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^^name | string |  | A self-defined custom sales attribute name if the built-in attributes do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | An image to display for the SKU. You can attach images to only 1 type of sales attribute, and you must attach an image for each value of the chosen attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the Color sales attribute or the Size sales attribute. If you choose to attach images for Color, you must attach 2 images, one for each color. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of a built-in sales attribute value, retrieved from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. - Supports only alphabets and numbers. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Global Attributes API](650a0483c16ffe02b8dfc80a). The unit price would then be returned in the [Get Global Product API](6509e2b0bace3e02b7490c96). |
| source_locale | string |  | The BCP-47 locale code representing the source language used for specifying the product information. Default: en-US Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT **Note**: - Applicable only for intra-EU sellers. Other sellers can ignore this field and provide the product information in English. - The information provided will be automatically translated into all EU languages supported by TikTok Shop. Ensure the locale matches the language used in field values to avoid inaccurate translations. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - MX:[1,300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^global_product_id | string |  | The global product ID generated by TikTok Shop. |
| ^global_skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^id | string |  | The global SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeleteGlobalProducts

Delete global products that you no longer need.

**Path:** `/product/202309/global_products`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/delete-global-products-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_ids | array<string> |  | The global product IDs to delete. Max number of IDs: 20 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^global_product_id | string |  | The ID of the global product that could not be deleted. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchGlobalProducts

Search your catalog to retrieve a list of global products based on filter conditions through this API. If you need to get detailed information about a global product, use the global product ID response in the "Get Global Product" API.

**Path:** `/product/202309/global_products/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-global-products-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | "page_size" represents the return list pagination, the number of global products per page. Each page can retrieve up to 100 global product records. |
| page_token | string |  | The pagination token is a cursor used for pagination. It is not needed for the first page. The token is returned in the previous pagination query to determine the current position. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | The fields "create_time_ge" and "create_time_le" together constitute the filter condition for the creation time of the global product. - If you only fill in the "create_time_le", and the "create_time_ge" is empty , then we will set the earliest time of the shop to the field "create_time_ge" by default. - If you only fill in the "create_time_ge", and the "create_time_le" is empty , then we will set the current time to the field "create_time_le" by default. The time search condition uses Unix timestamp in GMT (UTC+00:00). |
| create_time_le | integer |  | Refer to the description of "create_time_ge". |
| seller_skus | array<string> |  | Seller SKUs, a filtering condition used for global product search. This field allows you to search for all global products that contain these Seller SKUs. |
| status | string |  | Global Product status, used as a filtering criterion for global product search. including PUBLISHED,UNPUBLISHED,DRAFT,DELETED |
| update_time_ge | integer |  | The fields "update_time_ge" and "update_time_le" together constitute the filter condition for the update time of the global product. -  If you only fill in the "update_time_le", and the "update_time_ge" is empty , then we will set the earliest time of the shop to the field "update_time_ge" by default. - If you only fill in the "update_time_ge", and the "update_time_le" is empty , then we will set the current time to the field "update_time_le" by default. |
| update_time_le | integer |  | Refer to the description of "update_time_ge". |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^global_products | array<object> |  | The searched global product list. |
| ^^create_time | integer |  | The time when the global product is created. Unix timestamp GMT (UTC+00:00). This timestamp is used across all API requests. Developers can use this convert to local time. |
| ^^id | string |  | The global product ID. |
| ^^skus | array<object> |  | global product SKU information. |
| ^^^id | string |  | The global SKU ID. |
| ^^^seller_sku | string |  | The seller SKU entered when creating or editing the global product. |
| ^^status | string |  | The status of the global product. including PUBLISHED,UNPUBLISHED,DRAFT,DETELTED |
| ^^title | string |  | The global product name. |
| ^^update_time | integer |  | The time when the global product status is updated. Unix timestamp GMT (UTC+00:00). This timestamp is used across all API requests. Developers can use this convert to local time. |
| ^next_page_token | string |  | The pagination token is a cursor used for pagination. The token is returned in the previous pagination query to determine the current position. |
| ^total_count | integer |  | The total number of global products searched. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalProduct

Retrieve all properties of a global product that is in the "DRAFT", "UNPUBLISHED", or "PUBLISHED" status, and the corresponding local product IDs in the published markets.

**Path:** `/product/202309/global_products/{global_product_id}`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | Global product ID |

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
| ^brand | object |  | Product brand information. |
| ^^id | string |  | The ID of the brand of this product. |
| ^category | object |  | The category of the product. |
| ^^id | string |  | The category ID. |
| ^certifications | array<object> |  | The list of certifications for your product. |
| ^^files | array<object> |  | A list of certification related files. |
| ^^^format | string |  | The format of the certification file. |
| ^^^id | string |  | The ID of the certification file. |
| ^^^name | string |  | The name of the certification file |
| ^^^urls | array<string> |  | The URLs to view the certification files. |
| ^^id | string |  | The ID to identify the type of certification required for the product category. |
| ^^images | array<object> |  | A list of certification related images. |
| ^^^height | integer |  | The image height. Unit: px |
| ^^^uri | string |  | The URI of the image. |
| ^^^width | integer |  | The image width. Unit: px |
| ^^title | string |  | The title of the certification type. |
| ^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^description | string |  | The product description in HTML format. |
| ^external_global_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. |
| ^global_seller_id | string |  | The cross-border seller ID. |
| ^id | string |  | The global product ID in TikTok Shop. |
| ^main_images | array<object> |  | A list of images to display in the product image gallery. |
| ^^height | integer |  | The image height. Unit: px |
| ^^uri | string |  | The URI of the image. |
| ^^width | integer |  | The image width. Unit: px |
| ^manufacturer | object |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use `manufacturer_ids` instead.) The product manufacturer's details. If there are more than one manufacturer information, only the first-added manufacturer will be returned in this field. |
| ^^address | string |  | The address of the manufacturer. |
| ^^email | string |  | The email address of the manufacturer. |
| ^^name | string |  | The name of the manufacturer. |
| ^^phone_number | string |  | The phone number of the manufacturer. |
| ^manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. |
| ^package_dimensions | object |  | The dimensions of the product package. |
| ^^height | string |  | The package height. |
| ^^length | string |  | The package length. |
| ^^unit | string |  | The unit for the package dimensions. |
| ^^width | string |  | The package width. |
| ^package_weight | object |  | The weight of the product package. |
| ^^unit | string |  | The unit for the package weight. |
| ^^value | string |  | The package weight. |
| ^product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. |
| ^^id | string |  | The ID of the product attribute. |
| ^^name | string |  | The product attribute name. |
| ^^values | array<object> |  | A list of selectable values for the product attribute. |
| ^^^id | string |  | The product attribute value ID. |
| ^^^name | string |  | The product attribute value name. |
| ^products | array<object> |  | The local products associated through global product publishing or manual binding. |
| ^^id | string |  | The local product ID. |
| ^^region | string |  | The market where the local product is listed. |
| ^^sku_mappings | array<object> |  | The list of sku mappings between the global and local products. |
| ^^^global_sku_id | string |  | The global SKU ID in TikTok Shop. |
| ^^^local_sku_id | string |  | The local SKU ID in TikTok Shop. |
| ^^^sales_attribute_mappings | array<object> |  | The list of sales attribute mappings between the global and local SKUs. |
| ^^^^global_attribute_id | string |  | The global sales attribute ID. |
| ^^^^global_value_id | string |  | The global sales attribute value ID. |
| ^^^^local_attribute_id | string |  | The local sales attribute ID. |
| ^^^^local_value_id | string |  | The local sales attribute value ID. |
| ^responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. |
| ^size_chart | object |  | The measurement details of the product to help buyers find the right size. |
| ^^image | object |  | An image of the size chart. |
| ^^^height | integer |  | The image height. Unit: px |
| ^^^uri | string |  | The URI of the image. |
| ^^^width | integer |  | The image width. Unit: px |
| ^^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^^id | string |  | The size chart template ID. |
| ^skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^extra_identifier_codes | array<string> |  | A list of up to 10 additional identifier codes if the SKU belongs to a virtual bundle (containing multiple individual SKUs). **Note**: Applicable only for the EU market. |
| ^^global_quantity | integer |  | The total SKU inventory quantity across all shops globally. The inventory for each local shop is automatically calculated when a product is first published. After publishing, this global quantity cannot be manually changed. You can only modify the inventory quantity in each local shop. |
| ^^id | string |  | The global SKU ID in TikTok Shop. |
| ^^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. |
| ^^^code | string |  | The identifier code. |
| ^^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. |
| ^^^global_warehouse_id | string |  | The ID of the global warehouse where the SKU is stored. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. |
| ^^price | object |  | The SKU's **global uniform pre-tax** price that serves as the baseline for calculating the local prices across different markets. **Note**: - Upon publishing, this price will be automatically converted to the local pre-tax price and local display price based on market-specific exchange rates and applicable charges such as shipping costs, taxes, and other fees. - The auto-conversion will exclude JP and US shops using China warehouses. |
| ^^^amount | string |  | The price amount. |
| ^^^currency | string |  | The currency. Possible values: - `USD`: Applicable for global sellers - `EUR`: Applicable for intra-EU sellers |
| ^^^unit_price | string |  | The unit price of the SKU. You can display the unit price to facilitate easier price comparisons across different products and packaging sizes. Applicable only for the EU market. **Note**: - This value is available only if you have defined the elements used to calculate this price when creating the product. - Unit price = Selling price/(SKU unit count/base unit count) |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. |
| ^^^name | string |  | The sales attribute name. |
| ^^^sku_img | object |  | An image to display for the SKU. |
| ^^^^height | integer |  | The image height. Unit: px |
| ^^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^^uri | string |  | The URI of the image. |
| ^^^^urls | array<string> |  | The URLs to view the images. |
| ^^^^width | integer |  | The image width. Unit: px |
| ^^^value_id | string |  | The sales attribute value ID. |
| ^^^value_name | string |  | The sales attribute value name. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Global Attributes API](650a0483c16ffe02b8dfc80a). |
| ^source_locale | string |  | The BCP-47 locale code representing the source language used for specifying the product information. Default: en-US Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT **Note**: Applicable only for intra-EU sellers. |
| ^title | string |  | The product title. |
| ^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^video | object |  | Product video information. |
| ^^id | string |  | The video ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EditGlobalProduct

Edit all properties (e.g. description, brand, images, attributes) of a global product.
**IMPORTANT**: For published products, the changes will be automatically retranslated and synced to all markets where the product is published. If you have already edited the product information or translations of the associated local products, they will be overwritten by the information in this API. For example, if you have customized the local prices such as the local pre-tax price or the local display price, they will be overwritten each time this API is called.
**Note**:
- There may be a limit to the number of products you can relist per day. We recommend prioritizing key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- All inputs, including blanks, in the request payload will overwrite existing values. To retain an existing value, make sure to include it in your request. Therefore, **it is strongly recommended to retrieve the latest product data using [Get Global Product](6509e2b0bace3e02b7490c96) and submit the complete data when editing**. This ensures accuracy and helps avoid errors or unintentional data loss due to missing fields.
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.

**Path:** `/product/202309/global_products/{global_product_id}`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-global-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | The global product ID generated by TikTok Shop. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_id | string |  | The ID of the brand of this product. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. - It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. - It must be a main category (`categories.permission_statuses=AVAILABLE` in [Get Global Categories API](650a03f8f1fd3102b91b338a)). **Note**: Refer to TikTok Shop Academy for information on product category restrictions. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US and SEA regions: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US or SEA shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_global_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer | object |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use `manufacturer_ids` instead.) The product manufacturer's details. |
| ^address | string |  | The address of the manufacturer. |
| ^email | string |  | The email address of the manufacturer. |
| ^name | string |  | The name of the manufacturer. |
| ^phone_number | string |  | The phone number of the manufacturer, prefixed by a plus `+` symbol. There must be a space or hyphen between the country code and the local phone number. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies may lead to additional shipping fees. |
| ^height | string |  | The package height. A positive whole number. |
| ^length | string |  | The package length. A positive whole number. |
| ^unit | string |  | The unit for the package dimensions. Only `CENTIMETER` is supported. |
| ^width | string |  | The package width. A positive whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that the measurements are accurate. Any discrepancies may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Only `KILOGRAM` is supported. |
| ^value | string |  | The package weight, which must be a positive number with up to 3 decimal places. |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Global Attributes API](650a0483c16ffe02b8dfc80a). |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^values | array<object> |  | A list of selectable values for the product attribute. Max count: 300 for US; 100 for other regions. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom product attribute value ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters - Supports only alphabets and numbers. |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e) to check the requirements. - If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for EU, JP, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^global_quantity | integer |  | The total SKU inventory quantity across all shops globally. The inventory for each local shop is automatically calculated when a product is first published. After publishing, this global quantity cannot be manually changed. You can only modify the inventory quantity in each local shop. |
| ^id | string |  | The global SKU ID in TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information per warehouse. If multi-warehouse is enabled in Seller Center, you must provide the inventory details for each warehouse. Max count: 50 **Note**: `global_quantity` will not take effect if inventory details are provided for each warehouse. |
| ^^global_warehouse_id | string |  | The ID of the global warehouse where the SKU is stored. Retrieve the list of global warehouses available for the seller from the [Get Global Seller Warehouse API](https://partner.tiktokshop.com/docv2/page/650aa3f0defece02be6e5ffb). |
| ^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 99,999] |
| ^price | object |  | The SKU's **global uniform pre-tax** price that serves as the baseline for calculating the local prices across different markets. **Note**: - Upon publishing, this price will be automatically converted to the local pre-tax price and local display price based on market-specific exchange rates and applicable charges such as shipping costs, taxes, and other fees. - The auto-conversion will exclude JP and US shops using China warehouses. For these shops, please use `sale_prices` instead. |
| ^^amount | string |  | The price amount. Max: 99,999,999.99 |
| ^^currency | string |  | The currency. Possible values: - `USD`: Applicable for global sellers - `EUR`: Applicable for intra-EU sellers |
| ^sale_prices | array<object> |  | The SKU's **local display price** shown on the product page before any discounts. **Note**: -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^^amount | string |  | The price amount. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^region | string |  | The market where you want to sync the sale price. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom attribute ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^name | string |  | A self-defined custom sales attribute name if the built-in attributes do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | An image to display for the SKU. You can attach images to only 1 type of sales attribute, and you must attach an image for each value of the chosen attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the Color sales attribute or the Size sales attribute. If you choose to attach images for Color, you must attach 2 images, one for each color. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom sales attribute value ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. - Supports only alphabets and numbers. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). The unit price would then be returned in the [Get Global Product API](https://partner.tiktokshop.com/docv2/page/6509e2b0bace3e02b7490c96). |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - MX:[1,300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^global_skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^id | string |  | The global SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^publish_results | array<object> |  | Results of syncing the changes in the edited product to markets where it is published. |
| ^^fail_reasons | array<object> |  | The list of errors that occurred. |
| ^^^message | string |  | The error message. |
| ^^region | string |  | The market where the product is published Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MX: Mexico - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^^status | string |  | The status of syncing the product to the market. Possible values: - SUCCESS: The global product was successfully synchronized to the local shop, submitted for listing, and is now under review. - FAILED: Synchronization of the global product to the local shop was unsuccessful. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateGlobalInventory

Update the inventory of unpublished global products if you have access to the Multi-Warehouse feature.
The inventory of published global products will not be affected by this update operation.

**Path:** `/product/202309/global_products/{global_product_id}/inventory/update`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-global-inventory-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | The global product ID to be updated. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_skus | array<object> |  | The list of global SKUs that need to be updated. |
| ^id | string |  | The global SKU ID in TikTok Shop. |
| ^inventory | array<object> |  | Global SKU inventory information. |
| ^^global_warehouse_id | string |  | The ID of the global warehouse where the SKU is stored. Retrieve this value from [Get Global Product](6509e2b0bace3e02b7490c96) or [Get Global Seller Warehouse](650aa3f0defece02be6e5ffb). |
| ^^quantity | integer |  | The updated SKU quantity. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PublishGlobalProduct

Publish and convert a global product to local products in one or multiple shops in supported markets. After publishing, the product is sent for review by TikTok Shop in the respective markets. For sellers in the EU market, the provided information will also be automatically translated into all EU languages supported by TikTok Shop.
**Note**: 
- You can only publish in each market once. To change product information, edit the global product by using the [Edit Global Product API](6509e1bcc16ffe02b8dc3cd7). The changes will be automatically synchronized to all markets where the product is published
- Use the [Get Product API](6509d85b4a0bb702c057fdda) to obtain the converted local product information in the target market's language. 
- Use the [Edit Product API](6509da7d0fcef602bf1caddf) or [Partial Edit Product API](650a98d74a0bb702c06c3289) to edit the local product information, if necessary.

**Path:** `/product/202309/global_products/{global_product_id}/publish`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/publish-global-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | The global product id. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| publish_target | array<object> |  | Target markets for publishing global products. |
| ^manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| ^region | string |  | The new market where you want to publish the global product. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico **Note**: You can only publish in each market once. |
| ^responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| ^skus | array<object> |  | The SKUs to be published in the specified market. - Max SKUs for EU, JP, UK, US: 300 - Max SKUs for other regions: 100 |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^inventory | object |  | SKU inventory information per warehouse. Required for sellers without multiple warehouses, optional for others. **Note*: If inventory details are not provided, the global SKU quantity will be evenly split among all markets, and any surplus will be added to the last published product SKU. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 99,999] **Note**: If the local SKU inventory quantity exceeds the global SKU quantity, the global SKU quantity will be updated to be the sum of all local inventories. |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). Default: - Sellers without multiple warehouses: The available warehouses will be used, prioritizing local warehouses in the specified market over warehouses in the seller's base country. - Sellers with multiple warehouses: The global warehouse ID |
| ^^price | object |  | The SKU's local pricing information in the specified market. **Note**: - Provide this only if you want to manually override the default local prices, which are automatically calculated from the global uniform price. - Specify either `amount` or `sale_price`, the other will be auto-filled. If both are provided, `sale_price` takes precedence. - JP and US shops using China warehouses must provide `price.sale_price`. |
| ^^^amount | string |  | The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**:  Not applicable for JP and US shops using China warehouses, please use `price.sale_price` instead. |
| ^^^currency | string |  | The currency. You can use the local currency or USD. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japanese - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam - MXN: Mexico |
| ^^^sale_price | string |  | The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^^related_global_sku_id | string |  | The global SKU ID to be published. After publishing, a corresponding local product SKU will be created and linked to the global SKU. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^products | array<object> |  | The local products converted from the global product. |
| ^^id | string |  | The newly generated local product ID. |
| ^^region | string |  | The market where the product is published. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico |
| ^^shop_id | string |  | The ID of the local shop in the specified market. One market can only have one local shop. |
| ^^skus | array<object> |  | The newly created local SKUs in the specified market. |
| ^^^id | string |  | The newly generated local SKU ID. |
| ^^^related_global_sku_id | string |  | The associated global SKU ID. |
| ^^^sale_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^^id | string |  | The newly generated local sales attribute ID. |
| ^^^^value_id | string |  | The newly generated local sales attribute value ID. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^publish_result | array<object> |  | Results of publishing the global product. |
| ^^fail_reasons | array<object> |  | The list of errors that occurred. |
| ^^^message | string |  | The error message. |
| ^^region | string |  | The market where the product is published. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam - MX: Mexico |
| ^^status | string |  | The status of publishing the product to the market. Possible values: - SUCCESS: The global product was successfully published to the local shop, submitted for listing, and is now under review. - DRAFT: The global product was saved as a draft local product due to validation errors. - FAILED: Synchronization of the global product to the local shop was unsuccessful. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RecommendSizechart

Use this API to check if  images are size chart.

**Path:** `/product/202309/images/size_charts/identify`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/recommend-sizechart-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| images | array<object> |  | List of images to be inspected. |
| ^url | string |  | URLs of the images to be inspected only support TikTok Shop internal network images. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^images | array<object> |  | List of images inspected. |
| ^^is_size_chart | boolean |  | If the is_size_chart is true, it indicates that the image is a size chart. |
| ^^url | string |  | URLs of images inspected |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadProductImage

Upload local images to TikTok Shop for use as product images, variant images, size charts, certification images and so on.

**Note**: 
- All images used in TikTok Shop products must be uploaded through this API. You will not be able to use any image URLs that are not hosted by TikTok Shop.
- You must store the response body to retrieve the ID or URL required to associate the image with a product during product creation or editing.

**Path:** `/product/202309/images/upload`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-product-image-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | The local image file to be uploaded. **Note**: - Supported formats: JPG, JPEG, PNG, WEBP, HEIC, BMP - Max size: 10MB - Dimensions: [100x100 px, 20000x20000 px] - For `use_case=MAIN_IMAGE`, the dimensions must be between 300x300 px and 4000x4000 px. - For `use_case=SIZE_CHART_IMAGE`, the dimension must be at least 1024 px on the shorter side. |
| use_case | string |  | The usage scenario of the image. Possible values: - MAIN_IMAGE: An image displayed in the product image gallery. - ATTRIBUTE_IMAGE: An image that represents a product variant (e.g. color). - DESCRIPTION_IMAGE: An image used within the product description. - CERTIFICATION_IMAGE: An image to provide supporting information to meet TikTok Shop requirements for listing restricted products (e.g., images of certifications, product packaging, labeling). - SIZE_CHART_IMAGE: An image that displays the product's measurement details. **Note**: Images for use cases `MAIN_IMAGE` and `ATTRIBUTE_IMAGE` that do not fit within the 3:4 to 4:3 aspect ratio range will be automatically converted to 1:1. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^height | integer |  | The height of the image after aspect ratio adjustment. |
| ^uri | string |  | The URI to identify the image in API requests and responses. Pass this value when creating or editing a product to associate the image with the product. |
| ^url | string |  | The URL to access and view the image. Use this URL in product descriptions by embedding it within an HTML `<img>` tag. |
| ^use_case | string |  | The usage scenario specified during upload. Possible values: - MAIN_IMAGE - ATTRIBUTE_IMAGE - DESCRIPTION_IMAGE - CERTIFICATION_IMAGE - SIZE_CHART_IMAGE |
| ^width | integer |  | The width of the image after aspect ratio adjustment. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## InventorySearch

Retrieve inventory information for multiple products or SKUs.
**Note**: 
- Searches can be based on either product IDs or SKU IDs, not both at the same time.
- Passing Product IDs returns the inventory information of all SKUs under the specified products.
- Passing SKU IDs returns the inventory information for the specified SKUs.

**Path:** `/product/202309/inventory/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/inventory-search-202309

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
| product_ids | array<string> |  | A list of product IDs used to search for inventory information. Max IDs: 100 |
| sku_ids | array<string> |  | A list of SKU IDs used to search for inventory information. Max IDs: 600 **Note**: If both `sku_ids` and `product_ids` are passed, `sku_ids` will take precedence. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^inventory | array<object> |  | Inventory information for the requested products or SKUs. |
| ^^product_id | string |  | The ID of the requested product. |
| ^^skus | array<object> |  | The list of requested SKUs. |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^^total_available_inventory_distribution | object |  | The distribution of the total available inventory for the SKU across different channels. |
| ^^^^campaign_inventory | array<object> |  | Inventory that is allocated to a specific campaign. |
| ^^^^creator_inventory | array<object> |  | Inventory that is allocated to TikTok creators. |
| ^^^^in_shop_inventory | object |  | The remaining inventory available for the shop after deducting those allocated for campaigns and creators. |
| ^^^total_available_quantity | integer |  | The total number of units available for ordering across all warehouses. It is the sum of the `warehouse_inventory.available_quantity` values in all warehouses. |
| ^^^total_committed_quantity | integer |  | The total number of units reserved by existing customer orders across all warehouses (and therefore not available for ordering). It is the sum of the `warehouse_inventory.committed_quantity` values in all warehouses. |
| ^^^warehouse_inventory | array<object> |  | SKU warehouse inventory information. |
| ^^^^available_quantity | integer |  | The total number of units available for ordering in this warehouse. This is equivalent to the `inventory.quantity` value returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| ^^^^committed_quantity | integer |  | The total number of units reserved by existing customer orders in this warehouse (and therefore not available for ordering). |
| ^^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve details of the warehouse from the  [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckListingPrerequisites

Use this API to get the product rules of the shop and whether the prerequisites for listing product are met.

**Path:** `/product/202309/prerequisites`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/check-listing-prerequisites-202309

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
| ^shop | object |  | Listing Prerequisites related to the shop. |
| ^^bank_account | string |  | Listing Prerequisites check: Whether the shop has configured a bank account. If it is not prepared, return a check failure and the product will not be sent to audition. Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^contact_info | string |  | Listing Prerequisites check: Whether the shop has provided contact info. If it is not prepared, return a check failure and the product will not be created. Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^gne | object |  | Listing Prerequisites related to the GNE(Governance and Experience) strategy. |
| ^^^epr | string |  | Listing Prerequisites check: Whether the shop has configured extended producer responsibility(EPR) registration numbers. If it is not prepared, return a check failure and do not allow listing product. Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^^product_quantity_limit | string |  | Check if the number of product listings exceeds the limit. Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^logistics | object |  | Listing Prerequisites check related to logistics. |
| ^^^delivery_option | string |  | Shop logistics service. If the warehouse has no logistics services available, the warehouse cannot be used to create products. Detailed explanation of JSON return results - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^^pickup_warehouse | string |  | Shop pickup warehouse, shops without pickup warehouse can not create products Detailed explanation of JSON return results - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met |
| ^^^return_warehouse | string |  | Listing Prerequisites check if the shop's return warehouse meets the listing requirements Detailed explanation of JSON return results - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| ^^^shipping_template | string |  | Listing Prerequisites check if the shop's shipping template meets the listing requirements. If sellers set TikTok Shipping, the SHIPPING_TEMPLATE will always return "is_failed:false". Detailed explanation of JSON return results - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met |
| ^^status | string |  | Listing Prerequisites check: Whether the shop status allows normal publishing. If the shop status is abnormal, return a check failure and do not allow publishing" Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met |
| ^^tax_info | string |  | Listing Prerequisites check: Whether the shop has configured tax-related information. In some regions, if it is not prepared, return a check failure and do not allow listing product. In the US, if it is not prepared, return a check failure and the product will not be sent to audition. Detailed explanation of JSON return results： - "check_result" returns the result of the prerequisite check. - If "is_failed" is true, it indicates that the requirements for listing have not been met, and the detailed failure reasons will be returned through the "fail_reasons" field. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateProduct

Create and list products intended for sale exclusively in local shops.
You can create products in `AVAILABLE` categories. (US sellers can also create products in INVITE_ONLY categories). After creation, it will be sent for audit review by TikTok Shop. Use the [Product status change](https://partner.tiktokshop.com/docv2/page/650956aff1fd3102b90b6261) webhook to keep track of the review status.
**Note**: 
- This API is applicable for all sellers.
- Global sellers who have migrated to use the local replication listing method can use this API to create products. Otherwise, they can continue to use the [Create Global Product API](6509de61bace3e02b7489cba) to create global products.
- Before calling this API, we recommend that you prepare the necessary information by following the [usage flow for your region](650b23eef1fd3102b93d2326).
- There may be a limit to the number of products you can list per day. We recommend prioritizing the creation of key products first to ensure they get published. Refer to TikTok Shop Academy for details on the limit.
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.

**Path:** `/product/202309/products`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-product-202309

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. Use the [Get Categories API](https://partner.tiktokshop.com/docv2/page/6509c89d0fcef602bf1acd9b) to obtain the available categories. **Note**: - Refer to TikTok Shop Academy for information on product category restrictions. - For the US market, if you are creating products in `INVITE_ONLY` categories, you must submit a separate application through the Qualification Center on TikTok Shop Seller Center to gain access. Otherwise, even if the product audit is passed, the product will not be listed and made available to buyers. (The product status will be `PENDING` and the audit status will be `PRE_APPROVED`) - For the Indonesia market, to list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US and SEA regions: `v2`, represents the 7-level category tree. **Important**: For US and SEA shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| delivery_option_ids | array<string> |  | This field is returned for seller accounts in the following regions only: - ID - MX - MY - PH - SG - TH - VN For all other regions, this field is NOT used and will NOT be processed if passed for create, edit, or partial edit operations. The custom delivery option IDs to apply to this product if you want to override the default warehouse delivery options. To retrieve the available option IDs, call [Get Warehouse Delivery Options](650aa46ebace3e02b75d9afa) with `scope=PRODUCT`. **Note**: Leave this field blank to inherit the default delivery options configured for the warehouse. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| idempotency_key | string |  | A unique key to recognize a request and prevent duplicate processing of the same request, especially in cases of connection issues. Ensure this key is unique within the shop for each request to avoid accidental duplicates. It can be used to track requests across the shop. Max length: 128 characters **Note**: We recommend that you generate v4 UUIDs for use as keys. |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| is_not_for_sale | boolean |  | A flag indicating whether the product is not for sale and only available through Gift with Purchase (GWP) promotions. Such products won't appear in searches or recommendations True: Not for sale False: For sale |
| is_pre_owned | boolean |  | A flag to indicate if the product is pre-owned. Applicable only if TOKOPEDIA is the sole listing platform. **Note**: To list pre-owned products on the TikTok Shop platform, please specify the ID of one of the designated pre-owned product categories (e.g. pre-owned luxury bags, luggage, and accessories) in `category_id`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| minimum_order_quantity | integer |  | The minimum order quantity for the product. Valid range: [1, 20] Applicable only for the Indonesia market and selected sellers in other SEA markets. Contact your account manager for more information about gaining access to this field. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other  regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| primary_combined_product_id | string |  | If this product is associated with a virtual bundle, this value is the ID of the primary product in the bundle. **Note**: Required only for virtual bundle products. |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of a built-in product attribute value, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| save_mode | string |  | Indicates how the product should be saved. Possible values: - AS_DRAFT: Save the product as a draft for future editing. - LISTING: Immediately list the product in the shop. Default: LISTING |
| shipping_insurance_requirement | string |  | The shipping insurance purchase requirement imposed on buyers for the product. Possible values: - REQUIRED: Shipping insurance is mandatory and buyers can't opt out. - OPTIONAL: Buyers can choose to purchase shipping insurance through the platform. - NOT_SUPPORTED: Shipping insurance is not supported for the product. Default: OPTIONAL Applicable only if the listing platforms include TOKOPEDIA. |
| shipping_template_id | string |  | Identifier of the shipping template that will be bound to the product |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, JP, MX, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^combined_skus | array<object> |  | If this SKU belongs to a virtual bundle, this object contains the list of individual SKUs that form the bundle (e.g. gift basket, starter pack). |
| ^^product_id | string |  | The ID of the source product included in the virtual bundle. |
| ^^sku_count | integer |  | The quantity of the source SKU included in the virtual bundle. |
| ^^sku_id | string |  | The ID of the source SKU included in the virtual bundle. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **IMPORTANT**: This object and its values can only be modified when the product is in DRAFT status. Once submitted for review, changes are not allowed. Please define the values carefully. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. |
| ^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Omit this object if the product is a regular item. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. |
| ^price | object |  | SKU pricing information. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable only for global sellers. -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You can omit this object if there is only 1 SKU. Otherwise, this is **required**. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of a built-in sales attribute, retrieved from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^name | string |  | A self-defined custom sales attribute name if the built-in attributes do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of a built-in sales attribute value, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^product_id | string |  | The product ID generated by TikTok Shop. |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^warnings | array<object> |  | Warning information that the API caller needs to pay special attention to. |
| ^^message | string |  | A warning message for any critical problems/blockers. Please respond in a timely manner. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeleteProducts

Delete non-frozen products that you no longer need.
**For the Indonesia market**: You can only delete products that are not frozen on all listing platforms. If the product is frozen on any platform, it cannot be deleted.

**Path:** `/product/202309/products`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/delete-products-202309

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
| product_ids | array<string> |  | The product IDs to delete. Max number of IDs: 20. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^product_id | string |  | The ID of the product that could not be deleted. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ActivateProduct

Activate hidden products that are in the `Seller_deactivated` or `Platform_deactivated` status and display them in the TikTok Shop catalog. 
After submitting the activation request, the products will be sent to TikTok Shop for auditing and their status will change to `Pending`. If a product passes the audit, its status will change back to `Activate`. You can use the [Product status change webhook](https://partner.tiktokshop.com/docv2/page/650956aff1fd3102b90b6261) to monitor the audit status.

**Path:** `/product/202309/products/activate`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/activate-product-202309

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
| listing_platforms | array<string> |  | The listing platforms where the product will be activated. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| product_ids | array<string> |  | The product IDs to activate. Max number of IDs: 20 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^extra_errors | array<object> |  | A list of further nested errors or issues related to the main error. |
| ^^^^code | integer |  | The secondary error code. |
| ^^^^message | string |  | The secondary error message. |
| ^^^product_id | string |  | The ID of the product that could not be activated. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeactivateProducts

Deactivate products that are in the `Activate` status and hide them from buyers. The status changes to `Seller_deactivated` after deactivation.
In the event there's some issue with a product (e.g. out of stock), you can deactivate the product and hide it temporarily from buyers. When the issues are resolved, you can activate the product again by using the [Activate Product API](https://partner.tiktokshop.com/docv2/page/650306ff5a12ff0294eab4a9).

**Path:** `/product/202309/products/deactivate`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/deactivate-products-202309

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
| listing_platforms | array<string> |  | The listing platforms where the product will be deactivated. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| product_ids | array<string> |  | The product IDs to deactivate. Max number of IDs: 20. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^product_id | string |  | The ID of the product that could not be deactivated. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckProductListing

Identify any issues with your product properties in advance to ensure your product is ready for listing.
Every product must meet TikTok Shop requirements before it can be listed. Before listing, you can submit all relevant product information to this API to check whether a listing meets these requirements. You'll receive a list of issues to resolve before listing. This process helps reduce the risk of failure when creating products.
**Note**: 
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.

**Path:** `/product/202309/products/listing_check`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/check-product-listing-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| is_diagnosis_required | boolean |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use [Diagnose and Optimize Product](677c9523f7765c0308b3d68d) API instead to get listing quality related information.) A flag to indicate whether to return the listing quality information (US only) and optimization diagnosis results for the product. If this is set to `false`, the response body will exclude the `listing_quality` and `diagnoses` objects. Default: true |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. Use the [Get Categories API](https://partner.tiktokshop.com/docv2/page/6509c89d0fcef602bf1acd9b) to obtain the available categories. **Note**: - Refer to TikTok Shop Academy for information on product category restrictions. - For the US market, if you are creating products in `INVITE_ONLY` categories, you must submit a separate application through the Qualification Center on TikTok Shop Seller Center to gain access. Otherwise, even if the product audit is passed, the product will not be listed and made available to buyers. (The product status will be `PENDING` and the audit status will be `PRE_APPROVED`) - For the Indonesia market, to list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| delivery_option_ids | array<string> |  | This field is returned for seller accounts in the following regions only: - ID - MX - MY - PH - SG - TH - VN For all other regions, this field is NOT used and will NOT be processed if passed for create, edit, or partial edit operations. The custom delivery option IDs to apply to this product if you want to override the default warehouse delivery options. To retrieve the available option IDs, call [Get Warehouse Delivery Options](650aa46ebace3e02b75d9afa) with `scope=PRODUCT`. **Note**: Leave this field blank to inherit the default delivery options configured for the warehouse. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| is_pre_owned | boolean |  | A flag to indicate if the product is pre-owned. Applicable only if TOKOPEDIA is the sole listing platform. **Note**: To list pre-owned products on the TikTok Shop platform, please specify the ID of one of the designated pre-owned product categories (e.g. pre-owned luxury bags, luggage, and accessories) in `category_id`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| minimum_order_quantity | integer |  | The minimum order quantity for the product. Valid range: [1, 20] Applicable only for the Indonesia market and selected sellers in other SEA markets. Contact your account manager for more information about gaining access to this field. |
| option | object |  | option |
| ^gne_async_check_session_id | string |  | Asynchronous Verification ID: When "Asynchronous Acquisition of Product Information Verification Result = Yes", the asynchronous verification ID needs to be provided, and the verification result of abnormal product information will be obtained based on this ID subsequently |
| ^need_trigger_gne_async_check | boolean |  | Asynchronous Product Information Verification: If you need to obtain the product information verification result asynchronously, select this field |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other  regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| primary_combined_product_id | string |  | If this product is associated with a virtual bundle, this value is the ID of the primary product in the bundle. **Note**: Required only for virtual bundle products. |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of a built-in product attribute value, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| shipping_insurance_requirement | string |  | The shipping insurance purchase requirement imposed on buyers for the product. Possible values: - REQUIRED: Shipping insurance is mandatory and buyers can't opt out. - OPTIONAL: Buyers can choose to purchase shipping insurance through the platform. - NOT_SUPPORTED: Shipping insurance is not supported for the product. Default: OPTIONAL Applicable only if the listing platforms include TOKOPEDIA. |
| shipping_template_id | string |  | Identifier of the shipping template that will be bound to the product |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, JP, MX, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^combined_skus | array<object> |  | If this SKU belongs to a virtual bundle, this object contains the list of individual SKUs that form the bundle (e.g. gift basket, starter pack). |
| ^^product_id | string |  | The ID of the source product included in the virtual bundle. |
| ^^sku_count | integer |  | The quantity of the source SKU included in the virtual bundle. |
| ^^sku_id | string |  | The ID of the source SKU included in the virtual bundle. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected local sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. |
| ^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for US local sellers. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Omit this object if the product is a regular item. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a release date. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a duration. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a duration. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a duration. |
| ^price | object |  | SKU pricing information. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable only for global sellers. -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You can omit this object if there is only 1 SKU. Otherwise, this is **required**. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of a built-in sales attribute, retrieved from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^name | string |  | A self-defined custom sales attribute name if the built-in attributes do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of a built-in sales attribute value, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^check_result | string |  | The result of the product diagnosis (PASS, FAILED). |
| ^diagnoses | array<object> |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use [Diagnose and Optimize Product](677c9523f7765c0308b3d68d) API instead to get product diagnosis related information.) Product optimization diagnosis information. |
| ^^diagnosis_results | array<object> |  | The diagnosis results. |
| ^^^code | string |  | A machine-readable code that represents an identified issue. Refer to [Listing quality diagnosis](https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd) for the full list of identified issues and the corresponding recommendations. |
| ^^^how_to_solve | string |  | The recommendation for resolving the identified issue, returned in the default locale language of the shop. Refer to [Listing quality diagnosis](https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd) for the full list of recommendations. |
| ^^^quality_tier | string |  | The listing quality tier you can reach by implementing the recommendation. Possible values: - FAIR - GOOD **Note**: - To reach a higher tier, you must implement all recommendations from the destination tier and all preceding tiers. For example, a product will reach the "GOOD" tier once all "FAIR" and "GOOD" recommendations are addressed or implemented. - Available only for the US market. |
| ^^field | string |  | The product field being diagnosed. Possible values: - TITLE: Product title - DESCRIPTION: Product description - IMAGE: Product image displayed in the image gallery - ATTRIBUTE: Product attribute - SIZE_CHART: Product size chart |
| ^^suggestions | object |  | Improvement suggestions. |
| ^^^images | array<object> |  | The optimized main image. Only the first image in the main image set will be optimized. |
| ^^^^height | integer |  | The image height after optimization. |
| ^^^^optimized_uri | string |  | The URI of the image after optimization. |
| ^^^^optimized_url | string |  | The URL of the image after optimization. |
| ^^^^uri | string |  | The original URI of the image. |
| ^^^^url | string |  | The original URL of the image. |
| ^^^^width | integer |  | The image width after optimization. |
| ^^^seo_words | array<object> |  | The SEO keyword suggestions if `diagnoses.field` is "TITLE". |
| ^^^^text | string |  | The suggested SEO keyword text. |
| ^^^smart_texts | array<object> |  | The intelligent text suggestions for titles and descriptions. |
| ^^^^text | string |  | The suggested intelligent text. |
| ^fail_reasons | array<object> |  | A list of failure reasons if `check_result` is FAILED. |
| ^^code | integer |  | A machine-readable code that represents the failure reason. This is equivalent to the error codes shown when creating a product. For the full list of codes, refer to [Create Product > Error Code](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a?#Error_Code). |
| ^^message | string |  | A detailed reason for the failure. |
| ^listing_quality | object |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use the [Diagnose and Optimize Product](677c9523f7765c0308b3d68d) API instead to get listing quality related information.） Product listing quality information. |
| ^^current_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| ^^remaining_recommendations | integer |  | The remaining number of recommendations (see `diagnosis_results`) that must be implemented for the product to reach the highest tier. **Note**: - To reach the highest tier, you must implement all recommendations listed in `diagnosis_results`. - Available only for the US market. |
| ^pre_check_results | array<object> |  | Product Information Verification Result. |
| ^^pre_check_details | array<object> |  | Information Verification Details. |
| ^^^long_reason | string |  | Detailed reason: Detailed problem description of product verification results |
| ^^^related_fields | array<string> |  | Problem Module: From which module does the problem originate, e.g., PRE_CHECK_FIELD_TITLE, PRE_CHECK_FIELD_IMAGES |
| ^^^short_reason | string |  | Reason for streamlining: Simple problem description of product verification results |
| ^^pre_check_item | string |  | Product information verification type: The types of issues returned by product information verification. |
| ^warnings | object |  | Warning information that the API caller needs to pay special attention to. |
| ^^message | string |  | A warning message for any critical problems/blockers. Please respond in a timely manner. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RecoverProducts

Recover products that are in the `Deleted` status. The status changes to `Seller_deactivated` after recovery.

**Path:** `/product/202309/products/recover`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/recover-products-202309

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
| product_ids | array<string> |  | The product IDs to recover. Max number of IDs: 20. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^product_id | string |  | The ID of the product that could not be recovered. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchProducts

Retrieve a list of products that meet the specified conditions. 
This API will only return the key product properties. You can pass a returned product ID to the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda) to obtain more details about the product.

**Path:** `/product/202309/products/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-products-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| category_version | string |  | Filter products by the category tree version. Possible values based on region: - US: `v2`, represents the 7-level category tree. - Other regions: `v1`, represents the 3-level category tree. Default: Return all products from both `v1` and `v2` category trees. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | Filter products to show only those that are created on or after the specified date and time. Unix timestamp. Note: The "create_time_ge" and "create_time_le" together constitute the creation time filter condition. - If "create_time_ge" is filled but "create_time_le" is empty, "create_time_le" will default to the current time. - If "create_time_le" is filled but "create_time_ge" is empty, "create_time_ge" will default to the earliest shop time. |
| create_time_le | integer |  | Filter products to show only those that are created on or before the specified date and time. Unix timestamp. Refer to notes in "create_time_ge" for more usage information. |
| seller_skus | array<string> |  | Filter products by these seller SKU codes. |
| status | string |  | Filter products by their status. Default: ALL Possible values: - ALL - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| update_time_ge | integer |  | Filter products to show only those that are updated on or after the specified date and time. Unix timestamp. Note: The fields "update_time_ge" and "update_time_le" together define the update time filter condition. - If "update_time_ge" is filled but "update_time_le" is empty, "update_time_le" will default to the current time. - If "update_time_le" is filled but "update_time_ge" is empty, "update_time_ge" will default to the earliest shop time. |
| update_time_le | integer |  | Filter products to show only those that are updated on or before the specified date and time. Unix timestamp. Refer to notes in `update_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^products | array<object> |  | The list of products that meet the query conditions. |
| ^^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^^id | string |  | The product ID generated by TikTok Shop. |
| ^^product_sync_fail_reasons | array<string> |  | The reasons why synchronizing of global product information to local products failed. Applicable only for cross-border sellers. |
| ^^recommended_categories | array<object> |  | Recommended categories for the product based on the product title, description, and images. |
| ^^^id | string |  | The ID of the recommended category. |
| ^^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^sales_regions | array<string> |  | The regions where the product is sold. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MX: Mexico - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^^^inventory | array<object> |  | SKU inventory information. |
| ^^^^quantity | integer |  | The total SKU quantity available in the warehouse. |
| ^^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve details of the warehouse from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^^^price | object |  | SKU pricing information. |
| ^^^^currency | string |  | The currency of the SKU price. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^sale_price | string |  | The SKU's selling price, inclusive of tax. Applicable only for cross-border sellers from China. |
| ^^^^tax_exclusive_price | string |  | The SKU's selling price, exclusive of tax. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^status | string |  | The status of the product. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| ^^title | string |  | The product title. |
| ^^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^total_count | integer |  | The total number of products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetProduct

Retrieve all properties of a product, except those in the `FREEZE` or `DELETED` status.

**Path:** `/product/202309/products/{product_id}`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| return_under_review_version | boolean |  | A flag to indicate what product information to retrieve if a live product (`ACTIVATE` status) is edited and resent for TikTok Shop review. - True: Retrieves the latest version of the product information that is currently under review. - False: Retrieves a snapshot of the product information that is live and online (before the edit). Default: False |
| return_draft_version | boolean |  | A flag to indicate what product information to retrieve if a product has a draft in TikTok Shop. - True: Retrieves the draft version of the product information. - False: Retrieves the latest product information. Default: False **Note**: - Applicable only if the product is in the `DRAFT`, `ACTIVATE`, `SELLER_DEACTIVATED`, or `PLATFORM_DEACTIVATED` status. - This field and `return_under_review_version` are mutually exclusive. Specify only one to receive results. |
| locale | string |  | The locale or language. |
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
| ^audit | object |  | Product audit information. **Note**: Applicable only to products listed on TikTok Shop. Not applicable for products listed only on Tokopedia. |
| ^^pre_approved_reasons | array<string> |  | The reason why the product is pre-approved. Applicable only if `audit.status=PRE_APPROVED`, otherwise returns an empty array. Possible values: - KYC_PENDING: The seller's onboarding (KYC - Know Your Customer information) is incomplete or awaiting processing. - RESTRICTED_CATEGORY_PENDING: The product is in a restricted category, and category approval is still pending. To request access, submit an application through the Qualification Center on TikTok Shop Seller Center. Applicable only for the US market. |
| ^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - FAILED: The product failed the audit, or the audit was cancelled. - PRE_APPROVED: The product has passed the audit but is not yet listed due to pending prerequisites. Refer to `pre_approved_reasons` for the prerequisites. - APPROVED: The product passed the audit and has been listed on the platform. |
| ^audit_failed_reasons | array<object> |  | TikTok Shop audit failure information. |
| ^^listing_platform | string |  | The platform for listing the product. Possible values: - TIKTOK_SHOP - TOKOPEDIA |
| ^^position | string |  | The audit failure reason name. |
| ^^reasons | array<string> |  | A brief reason for failing TikTok Shop audit. |
| ^^suggestions | array<string> |  | A detailed explanation of the reason for failure. |
| ^brand | object |  | Product brand information. |
| ^^id | string |  | The ID of the brand of this product. |
| ^^name | string |  | The brand name of this product. |
| ^category_chains | array<object> |  | Product category tree information. |
| ^^id | string |  | The ID of the category of this product. |
| ^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. **Note**: You can only create or edit products that belong to a leaf category. |
| ^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^parent_id | string |  | The parent category ID. For the root category, the parent ID is `0`. |
| ^certifications | array<object> |  | The list of certifications for your product. |
| ^^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. |
| ^^files | array<object> |  | A list of certification related files. |
| ^^^format | string |  | The format of the certification file. |
| ^^^id | string |  | The ID of the certification file. |
| ^^^name | string |  | The name of the certification file. |
| ^^^urls | array<string> |  | The URLs to view the certification files. |
| ^^id | string |  | The ID to identify the type of certification required for the product. |
| ^^images | array<object> |  | A list of certification related images. |
| ^^^height | integer |  | The image height. Unit: px |
| ^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^uri | string |  | The URI of the image. |
| ^^^urls | array<string> |  | The URLs to view the images. |
| ^^^width | integer |  | The image width. Unit: px |
| ^^title | string |  | The title of the certification type. |
| ^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^delivery_options | array<object> |  | The custom delivery options applied to this product, overriding the default warehouse delivery option. **Note**: This field is not supported in post-live drafts, therefore the values here will always reflect those in the base version, even if you set `return_draft_version=true`. |
| ^^id | string |  | The delivery option ID. |
| ^^is_available | boolean |  | A flag indicating whether the delivery option is available for this product. |
| ^^name | string |  | The delivery option name. |
| ^description | string |  | The product description in HTML format. |
| ^external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. |
| ^global_product_association | object |  | The global product association established through global product publishing or manual binding. **Note**: - Applicable for global sellers and intra-EU sellers. - Not applicable for EU sellers who synchronized products from other markets using the Global Product Replicate (GPR) tool. Refer to `global_listing_policy` instead to find the associated source products. |
| ^^global_product_id | string |  | The global product ID in TikTok Shop. |
| ^^sku_mappings | array<object> |  | The list of sku mappings between the global and local products. |
| ^^^global_sku_id | string |  | The global SKU ID in TikTok Shop. |
| ^^^local_sku_id | string |  | The local SKU ID in TikTok Shop. |
| ^^^sales_attribute_mappings | array<object> |  | The list of sales attribute mappings between the global and local SKUs. |
| ^^^^global_attribute_id | string |  | The global sales attribute ID. |
| ^^^^global_value_id | string |  | The global sales attribute value ID. |
| ^^^^local_attribute_id | string |  | The local sales attribute ID. |
| ^^^^local_value_id | string |  | The local sales attribute value ID. |
| ^has_draft | boolean |  | A flag to indicate if the product has a draft. - true: It has a draft. - false: It does not have a draft. |
| ^id | string |  | The product ID generated by TikTok Shop. |
| ^integrated_platform_statuses | array<object> |  | The current status of the product on platforms that are natively integrated with TikTok Shop (e.g. TOKOPEDIA). **Note**: For Indonesia sellers, if you did not set the listing platform as `TOKOPEDIA` when creating or editing a product, this will be omitted. |
| ^^platform | string |  | The integrated platform name. Possible values: - TOKOPEDIA |
| ^^status | string |  | The product status in the integrated platform. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| ^is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN |
| ^is_not_for_sale | boolean |  | A flag indicating whether the product is not for sale and only available through Gift with Purchase (GWP) promotions. Such products won't appear in searches or recommendations True: Not for sale False: For sale |
| ^is_pre_owned | boolean |  | A flag to indicate if the product is pre-owned. Applicable only if TOKOPEDIA is the sole listing platform. **Note**: Pre-owned products on the TikTok Shop platform are identified by the `category_id`, which must belong to one of the designated pre-owned product categories (e.g. pre-owned luxury bags, luggage, and accessories). |
| ^is_replicated | boolean |  | A flag to indicate if the product contains a replica (created through local replication) in other local markets. |
| ^listing_quality_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| ^main_images | array<object> |  | A list of images to display in the product image gallery. |
| ^^height | integer |  | The image height. Unit: px |
| ^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^uri | string |  | The URI of the image. |
| ^^urls | array<string> |  | The URLs to view the images. |
| ^^width | integer |  | The image width. Unit: px |
| ^manufacturer_ids | array<string> |  | The list of manufacturer IDs. Pass this value to the `manufacturer_id` field in the [Search Manufacturers API](67066a580dcee902fa03ccf9) to obtain more information about a manufacturer. **Note**: Applicable only for the EU market in certain categories |
| ^minimum_order_quantity | integer |  | The minimum order quantity for the product. Valid range: [1, 20] Applicable only for the Indonesia market and selected sellers in other SEA markets. Contact your account manager for more information about gaining access to this field. |
| ^package_dimensions | object |  | The dimensions of the product package |
| ^^height | string |  | The package height. |
| ^^length | string |  | The package length. |
| ^^unit | string |  | The unit for the package dimensions. |
| ^^width | string |  | The package width. |
| ^package_weight | object |  | The weight of the product package. |
| ^^unit | string |  | The unit for the package weight. Possible values: - `KILOGRAM` - `POUND` |
| ^^value | string |  | The package weight. |
| ^prescription_requirement | object |  | Prescription related information for the product. **Note**: Applicable only for Tokopedia. This object is returned for all pharmacy products, and omitted for non-pharmacy products. |
| ^^needs_prescription | boolean |  | A flag to indicate whether a prescription is required to purchase this pharmacy product. |
| ^primary_combined_product_id | string |  | If the product is a virtual bundle, this value is the ID of the primary product in the bundle. The value is omitted if the product is not a virtual bundle. |
| ^product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. |
| ^^id | string |  | The ID of the product attribute. |
| ^^name | string |  | The product attribute name. |
| ^^values | array<object> |  | A list of selectable values for the product attribute. |
| ^^^id | string |  | The product attribute value ID. |
| ^^^name | string |  | The product attribute value name. |
| ^product_families | array<object> |  | The **live** product family that this product belongs to. A product family is a virtual group of products that share common characteristics (such as flavor, version, or size), allowing them to appear as selectable variations on the product page. **Note**: - Applicable only for US local sellers. - Omitted if this product does not belong to any product family. |
| ^^id | string |  | The product family ID. |
| ^^products | array<object> |  | A list of products that belong to the family. |
| ^^^id | string |  | The product ID. |
| ^product_status | string |  | The product status in TikTok Shop unrelated to its audit status. Possible values: - INITIAL - DRAFT - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED **Note**: For Indonesia sellers, if you did not set the listing platform as `TIKTOK_SHOP` when creating or editing a product, this will be omitted. |
| ^product_types | array<string> |  | The product type. Possible values: - COMBINED_PRODUCT: Indicates this is a virtual bundle product. - IN_COMBINED_PRODUCT: Indicates this product is part of a virtual bundle. - GPR_TARGET_PRODUCT: Indicates this product is synchronized to global listings. Applicable only for the EU market. |
| ^recommended_categories | array<object> |  | Recommended categories for the product based on the product title, description, and images. |
| ^^id | string |  | The ID of the recommended category. |
| ^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^responsible_person_ids | array<string> |  | The list of responsible person IDs. Pass this value to the `responsible_person_id` field in the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1) to obtain more information about a responsible person. **Note**: Applicable only for the EU market in certain categories |
| ^shipping_insurance_requirement | string |  | The shipping insurance purchase requirement imposed on buyers for the product. Possible values: - REQUIRED: Shipping insurance is mandatory and buyers can't opt out. - OPTIONAL: Buyers can choose to purchase shipping insurance through the platform. - NOT_SUPPORTED: Shipping insurance is not supported for the product. Default: OPTIONAL Applicable only if the listing platforms include TOKOPEDIA. |
| ^shipping_template_id | string |  | Identifier of the shipping template that was bound to the product |
| ^size_chart | object |  | The measurement details of the product to help buyers find the right size. |
| ^^image | object |  | An image of the size chart. |
| ^^^height | integer |  | The image height. Unit: px |
| ^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^uri | string |  | The URI of the image. |
| ^^^urls | array<string> |  | The URLs to view the images. |
| ^^^width | integer |  | The image width. Unit: px |
| ^^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^^id | string |  | The size chart template ID. |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^combined_skus | array<object> |  | If this SKU belongs to a virtual bundle, this object contains the list of individual SKUs that form the bundle (e.g. gift basket, starter pack). |
| ^^^brand | object |  | Brand information of the source product included in the virtual bundle. |
| ^^^^id | string |  | The ID of the brand of  the source product included in the virtual bundle. |
| ^^^^name | string |  | The brand name of the source product included in the virtual bundle. |
| ^^^categories | array<object> |  | The category tree information of the source product included in the virtual bundle. |
| ^^^^id | string |  | The ID of the category of the source product included in the virtual bundle. |
| ^^^^is_leaf | boolean |  | A flag to indicate if the category is a leaf category. |
| ^^^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^^^parent_id | string |  | The parent category ID of the source product included in the virtual bundle. |
| ^^^combined_listing_not_live_reasons | array<string> |  | The reasons linked to the source product included in the virtual bundle that are keeping the virtual bundle status from being live. Possible values: - SUB_PRODUCT_DEACTIVATE: Indicate the source product has been deactivated. - SUB_PRODUCT_DELETE: Indicate the source product has been deleted. - SUB_PRODUCT_FROZEN: Indicate the source product has been frozen. - SUB_SKU_DELETE: Indicate the source SKU has been deleted. - SUB_PRODUCT_CATEGORY_FIRST_LEVEL_ERROR: Indicate the level one category of the virtual bundle does not match that of the source product. - SUB_PRODUCT_CATEGORY_OVER_RESTRICTION:  Indicate the level one category of the source product is not in the set of restricted categories. |
| ^^^inventory | array<object> |  | Source SKU inventory details. |
| ^^^^quantity | integer |  | The total quantity available in the warehouse of the source SKU. |
| ^^^^warehouse_id | string |  | The ID of the warehouse where the source SKU is stored. Retrieve details of the warehouse from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/get-warehouse-list-202309). |
| ^^^price | object |  | Source SKU pricing information. |
| ^^^^currency | string |  | The currency. Possible values based on the region: - BRL:  Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^sale_price | string |  | All sellers The source SKU's local display price shown on the product page before any discounts. |
| ^^^^tax_exclusive_price | string |  | Global sellers The source SKU's local pre-tax price. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. Note: Tax-exclusive pricing does not apply to JP and US shops using China warehouses, therefore this value is the same as sale_price. |
| ^^^product_id | string |  | The ID of the source product included in the virtual bundle. |
| ^^^product_main_image | object |  | The main image of the source product included in the virtual bundle. |
| ^^^^height | integer |  | The image height. Unit: px |
| ^^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^^uri | string |  | The URI of the image. |
| ^^^^urls | array<string> |  | The URLs to view the images. |
| ^^^^width | integer |  | The image width. Unit: px |
| ^^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define the source SKU. |
| ^^^^id | string |  | The sales attribute ID. |
| ^^^^name | string |  | The sales attribute name. |
| ^^^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color) of the source product. This appears in the product options gallery on TikTok Shop. |
| ^^^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the source product for that attribute value. These appear in the product options gallery on TikTok Shop. Applicable only for the US market. |
| ^^^^value_id | string |  | The sales attribute value ID. |
| ^^^^value_name | string |  | The sales attribute value name. |
| ^^^seller_sku | string |  | An internal code/name for managing the source SKU, not visible to buyers. |
| ^^^sku_count | integer |  | The quantity of the source SKU included in the virtual bundle. |
| ^^^sku_id | string |  | The ID of the source SKU included in the virtual bundle. |
| ^^^title | string |  | The title of the source product included in the virtual bundle. |
| ^^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^amount | string |  | The price amount. |
| ^^^currency | string |  | The currency. Possible values: USD |
| ^^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^external_urls | array<string> |  | A list of URLs for third-party product listing pages where consumers can place orders. |
| ^^extra_identifier_codes | array<string> |  | A list of up to 10 additional identifier codes if the SKU belongs to a virtual bundle (containing multiple individual SKUs). **Note**: Applicable only for the EU market. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^global_listing_policy | object |  | Global Product Replicate (GPR) related information if the product is a target for synchronization. Applicable only for the EU market. |
| ^^^inventory_type | string |  | The type of inventory to synchronize. Possible values: - SHARED: Inventory Area Sharing - EXCLUSIVE: Inventory Exclusive |
| ^^^price_sync | boolean |  | A flag indicating whether the product price is synchronized. |
| ^^^replicate_source | object |  | The source global listing product to synchronize from. |
| ^^^^product_id | string |  | The ID of the source product. |
| ^^^^shop_id | string |  | The shop ID of the source product. |
| ^^^^sku_id | string |  | The SKU ID of the source product. |
| ^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. |
| ^^^code | string |  | The identifier code. |
| ^^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^^inventory | array<object> |  | SKU inventory details. **Note**: This field is not supported in post-live drafts. Therefore, the values here will always reflect those in the base version, even if you set `return_draft_version=true`. |
| ^^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve details of the warehouse from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^^list_price | object |  | The SKU's list price information that has been verified to be legitimate by the audit team. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: - This field will be empty or display the last verified price if the submitted price fails verification. - This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^amount | string |  | The price amount. |
| ^^^currency | string |  | The currency. Possible values: USD |
| ^^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. If this is not returned, it indicates that the product is a regular non-presale item. |
| ^^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. |
| ^^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. |
| ^^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. |
| ^^price | object |  | SKU pricing information. |
| ^^^currency | string |  | The currency. Possible values based on the region: - BRL:  Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^sale_price | string |  | **All sellers** The SKU's **local display price** shown on the product page before any discounts. |
| ^^^tax_exclusive_price | string |  | **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. **Note**: Tax-exclusive pricing does not apply to JP and US shops using China warehouses, therefore this value is the same as `sale_price`. |
| ^^^unit_price | string |  | The unit price of the SKU. You can display the unit price to facilitate easier price comparisons across different products and packaging sizes. Applicable only for the EU market. **Note**: - This value is available only if you have defined the elements used to calculate this price when creating the product. - Unit price = Selling price/(SKU unit count/base unit count) |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. |
| ^^^name | string |  | The sales attribute name. |
| ^^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. |
| ^^^^height | integer |  | The image height. Unit: px |
| ^^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^^uri | string |  | The URI of the image. |
| ^^^^urls | array<string> |  | The URLs to view the images. |
| ^^^^width | integer |  | The image width. Unit: px |
| ^^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. Applicable only for the US market. |
| ^^^^height | integer |  | The image height. Unit: px |
| ^^^^thumb_urls | array<string> |  | The URLs to view the image thumbnails. |
| ^^^^uri | string |  | The URI of the image. |
| ^^^^urls | array<string> |  | The URLs to view the images. |
| ^^^^width | integer |  | The image width. Unit: px |
| ^^^value_id | string |  | The sales attribute value ID. |
| ^^^value_name | string |  | The sales attribute value name. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^status_info | object |  | Status information of the SKU. |
| ^^^deactivation_source | string |  | The deactivation source of the SKU with `DEACTIVATED` status. Possible values: - SELLER: Indicates that the seller deactivated the SKU - PLATFORM: Indicates that the platform de-activated the SKU due to violation reasons - COMBO_RELATION: Indicates that the platform de-activated the bundle-SKU due to the deactivation of sub-SKU. |
| ^^^status | string |  | The SKU status in TikTok Shop. Possible values: - NORMAL - DEACTIVATED |
| ^status | string |  | The product status in TikTok Shop. This status incorporates both the product status and the audit status. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED **Note**: For Indonesia sellers, if you did not set the listing platform as `TIKTOK_SHOP` when creating or editing a product, this will be omitted. |
| ^subscribe_info | object |  | All the Save and Subscribe promotion info associated with the given product. |
| ^^subscribe_discount_details | array<object> |  | All of the Save and Subscribe discount details. |
| ^^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^^discount_value | integer |  | The value of the discount. A value of 10, would indicate a 10% discount. |
| ^^subscribe_promotion_config | array<object> |  | A subscription configuration specific to the seller. It outlines the different types of promotions and associated constraints that are available for use. |
| ^^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^^discount_options | array<integer> |  | The discount options available to the seller for the given discount level. |
| ^^^max_discount | integer |  | The maximum discount a seller can set for the associated discount level. |
| ^^^min_discount | integer |  | The minimum discount a seller can set for the associated discount level. |
| ^^subscribe_status | string |  | An enum outlining whether the given product has an active Subscribe and Save promotion: - ENABLED - NOT_ENABLED |
| ^^support_subscribe | boolean |  | A flag outlining whether the seller and given product support Subscribe and Save promotions. |
| ^title | string |  | The product title. |
| ^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^video | object |  | Product video information. |
| ^^cover_url | string |  | The URL to view the video cover image. |
| ^^format | string |  | The video format. |
| ^^height | integer |  | The video height. Unit: px |
| ^^id | string |  | The video ID. |
| ^^size | integer |  | The video's original file size. Unit: MB |
| ^^url | string |  | The URL to view the video. |
| ^^width | integer |  | The video width. Unit: px |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EditProduct

Edit all properties (e.g. description, brand, images) of an existing product that is not in the `FREEZE` or `DELETED` state.
After editing the product, the latest product content (referred to as v2) will be resent for audit review. If the audit passes, v2 is published to the shop, otherwise, the existing product stays live and remains unchanged (keeping v1). However, edits to the `price` or `inventory` fields do not require a reaudit and will be immediately published on the platform. Use the [Product status change](https://partner.tiktokshop.com/docv2/page/650956aff1fd3102b90b6261) webhook to keep track of the review status.
**Note**: 
- This API is applicable only for **active sellers/shops** that have completed the KYC onboarding process.
- There may be a limit to the number of products you can relist per day. We recommend prioritizing key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- All inputs, including blanks, in the request payload will overwrite existing values. To retain an existing value, make sure to include it in your request. Exceptions to this rule are the `price` and `inventory` fields, which will remain unchanged if they are omitted from the request. Therefore, **it is strongly recommended to retrieve the latest product data using [Get Product](6509d85b4a0bb702c057fdda) and submit the complete data when editing**. This ensures accuracy and helps avoid errors or unintentional data loss due to missing fields.
- If you wish to edit only certain properties, you can use the [Partial Edit Product API](650a98d74a0bb702c06c3289), [Update Inventory API](6503068fc20ad60284b38858), or the [Update Price API](650307de5a12ff0294eac8b0).
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.
**For global sellers**:
If you're using the local replication listing method, note the following sync rules:
- To sync any changes to other markets, please provide the `seller_sku` and complete `replicated_products` data. 
- Note that **category changes** and **sales attribute changes** (in sales attribute id/name) must be synced to other markets. The API call will fail if you don't provide these details.
**For Tokopedia sellers**:
Note that a product can have **only one active version** across all platforms at any time. If a product is live on both platforms, audit results for the latest version are handled as follows:
- **Mixed audit results**: If the product passes audit on one platform but fails on another, on the successful platform, the product will stay live and be updated with content from the latest version (v2), while on the failed platform, the product will be deactivated and hidden entirely.
- **Audit failure on all platforms**: If the product fails audit on all platforms, the existing product stays live and remains unchanged (keeping v1).

**Path:** `/product/202309/products/{product_id}`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID generated by TikTok Shop. |

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. Use the [Get Categories API](https://partner.tiktokshop.com/docv2/page/6509c89d0fcef602bf1acd9b) to obtain the available categories. **Note**: - Refer to TikTok Shop Academy for information on product category restrictions. - For the US market, if you change a product's category to an `INVITE_ONLY` category, you must submit a separate application through the Qualification Center on TikTok Shop Seller Center to gain access. Otherwise, even if the product audit is passed, the product will not be listed and made available to buyers. (The product status will be `PENDING` and the audit status will be `PRE_APPROVED`) - For the Indonesia market, to list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US and SEA regions: `v2`, represents the 7-level category tree. **Important**: For US and SEA shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| delivery_option_ids | array<string> |  | This field is returned for seller accounts in the following regions only: - ID - MX - MY - PH - SG - TH - VN For all other regions, this field is NOT used and will NOT be processed if passed for create, edit, or partial edit operations. The custom delivery option IDs to apply to this product if you want to override the default warehouse delivery options. To retrieve the available option IDs, call [Get Warehouse Delivery Options](https://partner.tiktokshop.com/docv2/page/650aa46ebace3e02b75d9afa) with `scope=PRODUCT`. **Note**: - Leave this field blank to inherit the default delivery options configured for the warehouse. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| is_pre_owned | boolean |  | A flag to indicate if the product is pre-owned. Applicable only if TOKOPEDIA is the sole listing platform. **Note**: To list pre-owned products on the TikTok Shop platform, please specify the ID of one of the designated pre-owned product categories (e.g. pre-owned luxury bags, luggage, and accessories) in `category_id`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. **IMPORTANT**: This field controls the product's visibility on the listing platforms. - If the product is live on both platforms but the request contains only 1 platform, the product will be deactivated and hidden from the omitted platform. - If the product is live on 1 platform but the request contains a different platform, the product will be deactivated and hidden from the omitted platform. - If you omit this array, the product will be sent for audit on the currently active platforms or on the platforms specified in the previous request. - If you want to deactivate the product on both platforms, use the Deactivate Product API. |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| minimum_order_quantity | integer |  | The minimum order quantity for the product. Valid range: [1, 20] Applicable only for the Indonesia market and selected sellers in other SEA markets. Contact your account manager for more information about gaining access to this field. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom product attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters |
| replicated_products | array<object> |  | The list of local market replicas to which updates should be synced. As this is a full edit endpoint, all fields will be synced. Note that **category changes** and **sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` above and complete the details in this object. The API call will fail if you don't provide these details. |
| ^region | string |  | The market where you want to sync the changes to. The market must already contain a replica. Use the Get Global Replicated Products to check the markets that contain a replica. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^skus | array<object> |  | The SKUs to be synced to the specified market. **Note**: - You must pass in all existing SKUs. Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and provide the seller_sku. |
| ^^id | string |  | The SKU ID generated by TikTok Shop. Provide this for existing SKUs. |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 999,999] |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](650aa418defece02be6e66b6) or Get Inventory Rules API. |
| ^^price | object |  | The SKU's **local display price** shown on the product page before any discounts. |
| ^^^currency | string |  | The currency. You must specify the local currency in the target market. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japanese - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^sale_price | string |  | The SKU's local display price shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^seller_sku | string |  | The seller_sku value of the source product above. Provide this for new SKUs. - Valid length: 1-50 characters - Format: Text without spaces |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| save_mode | string |  | Indicates how the product should be saved. Possible values: - AS_DRAFT: Save the product as a draft for future editing. - LISTING: Immediately list the product in the shop. Default: LISTING **Note**: - Saving as draft is not supported in the following cases: - The product status is `DELETED`. - The product status is `PENDING` or `FREEZE` on any listing platform. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, `inventory` and `delivery_option_ids` fields are not supported and will not be saved. |
| shipping_insurance_requirement | string |  | The shipping insurance purchase requirement imposed on buyers for the product. Possible values: - REQUIRED: Shipping insurance is mandatory and buyers can't opt out. - OPTIONAL: Buyers can choose to purchase shipping insurance through the platform. - NOT_SUPPORTED: Shipping insurance is not supported for the product. Default: OPTIONAL Applicable only if the listing platforms include TOKOPEDIA. |
| shipping_template_id | string |  | Identifier of the shipping template that will be bound to the product |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, MX, JP, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^combined_skus | array<object> |  | If this SKU belongs to a virtual bundle, this object contains the list of individual SKUs that form the bundle (e.g. gift basket, starter pack). |
| ^^product_id | string |  | The ID of the source product included in the virtual bundle. |
| ^^sku_count | integer |  | The quantity of the source SKU included in the virtual bundle. |
| ^^sku_id | string |  | The ID of the source SKU included in the virtual bundle. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected local sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. **Note**: - If you omit this object array in the API request, the existing information will remain unchanged. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for US local sellers. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **General usage rules**: - Omit this object to retain the current presale settings. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, and JP** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, and JP** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. **ALL** - `NONE`: To convert the product to a regular (non-presale) product. |
| ^price | object |  | SKU pricing information. **Note**: If you omit this object in the API request, the existing information will remain unchanged. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. - **Note**: Not applicable for JP and US shops using China warehouses, please use `price.sale_price` instead. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable only for global sellers. -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom attribute ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom sales attribute name if the existing attributes do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom sales attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| subscribe_info_edit | object |  | All the editable Save and Subscribe promotion info associated with the given product. |
| ^discount_details | array<object> |  | All of the Save and Subscribe discount details. |
| ^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^discount_value | integer |  | The value of the discount. A value of 10, would indicate a 10% discount. |
| ^subscribe_status | string |  | An enum outlining whether the given product has an active Subscribe and Save promotion: - ENABLED - NOT_ENABLED This field is required if the subscription is being created or modified. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^audit | object |  | Product audit information. **Note**: Applicable only to products listed on TikTok Shop. Not applicable for products listed only on Tokopedia. |
| ^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - APPROVED: If you only edited the `price` or `inventory` fields of an approved product, the product remains approved and the new information is immediately published on the platform. |
| ^product_id | string |  | The product ID generated by TikTok Shop. |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^warnings | array<object> |  | Warning information that the API caller needs to pay special attention to. |
| ^^message | string |  | A warning message for any critical problems/blockers. Please respond in a timely manner. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateInventory

Update the inventory quantity of SKUs belonging to a product. The SKU ID must belong to a product that is **not** in `FREEZE` or `DELETED` status.

**Path:** `/product/202309/products/{product_id}/inventory/update`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-inventory-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID generated by TikTok Shop. |

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
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - The SKU ID must belong to a product that is not in `FREEZE` or `DELETED` status. - If you are updating multiple SKUs, all the SKU IDs must belong to the same product. |
| ^inventory | array<object> |  | SKU inventory information. **Note**: You must include all warehouse IDs assigned to this SKU, along with the respective quantity. Do not omit any or add unrelated warehouses. |
| ^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Any existing `backorder_quantity` will persist if no update is provided during API call. |
| ^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve this value from the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). **Note**: Optional if there is only 1 warehouse. Otherwise, please provide this ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^extra_errors | array<object> |  | A list of secondary errors or issues related to the main error. |
| ^^^^code | integer |  | The secondary error code. |
| ^^^^message | string |  | The secondary error message. |
| ^^^^warehouse_id | string |  | The ID of the warehouse  where the error occurred. |
| ^^^sku_id | string |  | The ID of the SKU where the error occurred. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditProduct

Edit some properties (e.g. description, images, attributes) of a product that is not in the `FREEZE` or `DELETED` state.
After editing the product, the latest product content (referred to as v2) will be resent for audit review. If the audit passes, v2 is published to the shop, otherwise, the existing product stays live and remains unchanged (keeping v1). However, edits to the `price` or `inventory` fields do not require a reaudit and will be immediately published on the platform. Use the [Product status change](650956aff1fd3102b90b6261) webhook to keep track of the review status.
**Note**: 
- This API is applicable for all sellers.
- There may be a limit to the number of products you can relist per day. We recommend prioritizing key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- If a draft or audit-review version exists, unedited fields will retain their values over those of the base (live) version.
- **Updates are handled per top-level property**, so all non-empty fields within an updated object must be supplied to prevent overwriting with blanks. For top-level properties (e.g. `description`, `brand_id`) that are not nested in an object, you can update them individually. Omitting these properties in the request will leave them unchanged. If you need to edit any nested property within an object, you must provide values for all nested properties of that object. Any omitted nested properties will be overwritten with blanks.
- If new mandatory product attributes were added by TikTok Shop after the creation of your product, ensure that you provide these attributes too.
**For global sellers**:
If you're using the local replication listing method, note the following sync rules:
**Sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` and complete `replicated_products` data. The API call will fail if you don't provide these details.
**New SKUs* (new sales attribute value id/name) are optional to sync to other markets. To sync, please provide the `seller_sku` and complete `replicated_products` data.
**General changes** are optional to sync to other markets. To sync, you only need to provide `replicated_products.region`.
**For Tokopedia sellers**:
Note that a product can have **only one active version** across all platforms at any time. If a product is live on both platforms, audit results for the latest version are handled as follows:
- **Mixed audit results**: If the product passes audit on one platform but fails on another, on the successful platform, the product will stay live and be updated with content from the latest version (v2), while on the failed platform, the product will be deactivated and hidden entirely.
- **Audit failure on all platforms**: If the product fails audit on all platforms, the existing product stays live and remains unchanged (keeping v1).

**Path:** `/product/202309/products/{product_id}/partial_edit`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. **IMPORTANT**: This field controls the product's visibility on the listing platforms. - If the product is live on both platforms but the request contains only 1 platform, the product will be deactivated and hidden from the omitted platform. - If the product is live on 1 platform but the request contains a different platform, the product will be deactivated and hidden from the omitted platform. - If you want to deactivate the product on both platforms, use the Deactivate Product API. |
| main_images | array<object> |  | A list of images to display in the product image gallery. -  Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom product attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom product attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters. |
| replicated_products | array<object> |  | The list of local market replicas to which updates should be synced. As this is a partial edit endpoint, only updated fields will be synced. **Compulsory sync** - **Sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` above and complete the details in this object. The API call will fail if you don't provide these details. **Optional sync** - **New SKUs* (new sales attribute value id/name) are optional to sync to other markets. To sync, please provide the `seller_sku` above and complete the details in this object. - **General changes** are optional to sync to other markets. To sync, you only need to provide `replicated_products.region`. |
| ^region | string |  | The market where you want to sync the changes to. The market must already contain a replica. Use the Get Global Replicated Products to check the markets that contain a replica. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^skus | array<object> |  | The SKUs to be synced to the specified market. Specify this **only if** you are adding SKUs or changing the sales attribute id/name. **Note**: - You must pass in all existing SKUs. Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and provide the seller_sku. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^id | string |  | The SKU ID generated by TikTok Shop. Provide this for existing SKUs |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 999,999] |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](650aa418defece02be6e66b6) or Get Inventory Rules API. |
| ^^price | object |  | The SKU's **local display price** shown on the product page before any discounts |
| ^^^currency | string |  | The currency. You must specify the local currency in the target market. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japanese - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^sale_price | string |  | The SKU's local display price shown on the product page before any discounts. Refer to Product Pricing for the allowed price ranges in each market. |
| ^^seller_sku | string |  | The seller_sku value of the source product above. - Valid length: 1-50 characters - Format: Text without spaces |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| save_mode | string |  | Indicates how the product should be saved. Possible values: - AS_DRAFT: Save the product as a draft for future editing. - LISTING: Immediately list the product in the shop. Default: LISTING **Note**: - Saving as draft is not supported in the following cases: - The product status is `DELETED`. - The product status is `PENDING` or `FREEZE` on any listing platform. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, `inventory` and `delivery_option_ids` fields are **not supported** and will not be saved. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, JP, MX, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. **Note**: If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, and JP** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, and JP** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. |
| ^price | object |  | SKU pricing information. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable for all global sellers. - Required for JP and US shops using China warehouses. Optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom attribute ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom sales attribute name if the existing attributes do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom sales attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| subscribe_info_edit | object |  | All of the Save and Subscribe discount details. |
| ^discount_details | array<object> |  | All of the Save and Subscribe discount details. |
| ^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^discount_value | integer |  | The value of the discount. A value of 10, would indicate a 10% discount. |
| ^subscribe_status | string |  | An enum outlining whether the given product has an active Subscribe and Save promotion: - ENABLED - NOT_ENABLED This field is required if the subscription is being created or modified. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^audit | object |  | Product audit information. **Note**: Applicable only to products listed on TikTok Shop. Not applicable for products listed only on Tokopedia. |
| ^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - APPROVED: If you only edited the `price` or `inventory` fields of an approved product, the product remains approved and the edits are immediately published on the platform. |
| ^product_id | string |  | The product ID generated by TikTok Shop. |
| ^replicated_products | array<object> |  | Returns a list of information used for sku id mapping. |
| ^^product_id | string |  | Product id |
| ^^region | string |  | Region |
| ^^skus | array<object> |  | Data containing client sku id and generated sku id |
| ^^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. Provide this for existing SKUs |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdatePrice

Update the price of multiple SKUs belonging to a product in the `ACTIVATE` status and not included in any ongoing promotions.
**Note**: The `data` response field is always empty as there is no additional response data.

**Path:** `/product/202309/products/{product_id}/prices/update`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-price-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID generated by TikTok Shop. |

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
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - The SKU ID must belong to a product with the `ACTIVATE` status. - If you are updating multiple SKUs, all the SKU IDs must belong to the same product. |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^price | object |  | SKU pricing information. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. - **Note**: Not applicable for JP and US shops using China warehouses, please use `price.sale_price` instead. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable only for global sellers. -  Required for the JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchGlobalProducts

Retrieve a list of global products that meet the specified conditions. 
This API will only return the key product properties. You can pass a returned global product ID to the [Get Global Product API](https://partner.tiktokshop.com/docv2/page/6509e2b0bace3e02b7490c96) to obtain more details about the product.

**Path:** `/product/202312/global_products/search`
**Method:** `POST`
**Version:** 202312
**Docs:** https://partner.tiktokshop.com/docv2/page/search-global-products-202312

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | Filter global products to show only those that are created on or after the specified date and time. Unix timestamp. **Note**: The "create_time_ge" and "create_time_le" together constitute the creation time filter condition. - If "create_time_ge" is filled but "create_time_le" is empty, "create_time_le" will default to the current time. - If "create_time_le" is filled but "create_time_ge" is empty, "create_time_ge" will default to the earliest shop time. |
| create_time_le | integer |  | Filter global products to show only those that are created on or before the specified date and time. Unix timestamp. Refer to notes in "create_time_ge" for more usage information. |
| seller_skus | array<string> |  | Filter global products by these seller SKU codes. |
| status | string |  | Filter global products by their status. Possible values: - PUBLISHED - UNPUBLISHED - DRAFT - DELETED |
| update_time_ge | integer |  | Filter global products to show only those that are updated on or after the specified date and time. Unix timestamp. **Note**: The fields "update_time_ge" and "update_time_le" together define the update time filter condition. - If "update_time_ge" is filled but "update_time_le" is empty, "update_time_le" will default to the current time. - If "update_time_le" is filled but "update_time_ge" is empty, "update_time_ge" will default to the earliest shop time. |
| update_time_le | integer |  | Filter global products to show only those that are updated on or before the specified date and time. Unix timestamp. Refer to notes in `update_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^global_products | array<object> |  | The list of global products that meet the query conditions. |
| ^^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^^id | string |  | The global product ID in TikTok Shop. |
| ^^skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^id | string |  | The global SKU ID in TikTok Shop. One product can contain multiple SKU IDs. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^status | string |  | The status of the product. Possible values: - PUBLISHED - UNPUBLISHED - DRAFT - DELETED |
| ^^title | string |  | The product title. |
| ^^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The total number of global products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckListingPrerequisites

Check if a TikTok shop is ready to list products.
Each shop needs to satisfy a series of TikTok Shop requirements before you can start listing products. Before you proceed to list products, use this API to check if your shop has satisfied all requirements.
**Tip**: We recommend that you run this check before any bulk updates to avoid listing issues. For example, sellers may change the delivery option to "Shipped by seller" but fail to add a shipping template, thus blocking the shop from listing products. In this case, the API would return `is_failed=true` for the `SHIPPING_TEMPLATE` check item and you can prompt the seller to fix the problem.

**Path:** `/product/202312/prerequisites`
**Method:** `GET`
**Version:** 202312
**Docs:** https://partner.tiktokshop.com/docv2/page/check-listing-prerequisites-202312

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
| ^check_results | array<object> |  | A list of results from checking whether a shop satisfies TikTok Shop requirements. |
| ^^check_item | string |  | A requirement that the shop needs to satisfy. Possible values: - SHOP_STATUS - SHOP_TAX - PICKUP_WAREHOUSE - RETURN_WAREHOUSE - DELIVERY_OPTION - SHIPPING_TEMPLATE - PRODUCT_QUANTITY_LIMIT - EXTENDED_PRODUCER_RESPONSIBILITY - BANk_ACCOUNT - CONTACT_INFO |
| ^^fail_reasons | array<string> |  | The specific reasons for failing a certain `check_item`. |
| ^^is_failed | boolean |  | A flag indicating whether the shop has failed a `check_item`. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchProducts

Retrieve a list of products that meet the specified conditions. 
This API will only return the key product properties. You can pass a returned product ID to the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda) to obtain more details about the product.

**Path:** `/product/202312/products/search`
**Method:** `POST`
**Version:** 202312
**Docs:** https://partner.tiktokshop.com/docv2/page/search-products-202312

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
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
| audit_status | array<string> |  | Filter products by their audit status for TikTok Shop. Possible values: - AUDITING: The product is currently being audited. - FAILED: The product failed the audit, or the audit was cancelled. - APPROVED: The product passed the audit and has been listed on the platform. |
| category_version | string |  | Filter products by the category tree version. Possible values based on region: - US: `v2`, represents the 7-level category tree. - Other regions: `v1`, represents the 3-level category tree. Default: Return all products from both `v1` and `v2` category trees. |
| create_time_ge | integer |  | Filter products to show only those that are created on or after the specified date and time. Unix timestamp. **Note**: `create_time_ge` and `create_time_le` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_le` is empty, `create_time_le` will default to the current time. - If `create_time_le` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_le | integer |  | Filter products to show only those that are created on or before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |
| listing_platforms | array<string> |  | Filter products by the listing platforms. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: Return all products regardless of their listing platform. Applicable only for sellers that migrated from Tokopedia. **Note**: - You must also specify a `status` value other than `ALL` when filtering by listing platforms. Returning all statuses is not supported. - If you pass in one platform, the search will return products that are listed on that platform, including those that are listed on both platforms. - If you pass in `["TIKTOK_SHOP", "TOKOPEDIA"]`, only products listed on both platforms will be returned, not those listed on just one. |
| listing_quality_tier | string |  | Filter products by their listing quality tier. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| seller_skus | array<string> |  | Filter products by these seller SKU codes. |
| sku_ids | array<string> |  | Filter products by SKU IDs. Max count: 10 |
| status | string |  | Filter products by their status. Default: ALL Possible values: - ALL - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| update_time_ge | integer |  | Filter products to show only those that are updated on or after the specified date and time. Unix timestamp. **Note**: `update_time_ge` and `update_time_le` together define the update time filter condition. - If `update_time_ge` is filled but `update_time_le` is empty, `update_time_le` will default to the current time. - If `update_time_le` is filled but `update_time_ge` is empty, `update_time_ge` will default to the earliest shop time. |
| update_time_le | integer |  | Filter products to show only those that are updated on or before the specified date and time. Unix timestamp. Refer to notes in `update_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^products | array<object> |  | The list of products that meet the query conditions. |
| ^^audit | object |  | Product audit information for TikTok Shop. |
| ^^^pre_approved_reasons | array<string> |  | The reason why the product is pre-approved. Applicable only if `audit.status=PRE_APPROVED`, otherwise returns an empty array. Possible values: - KYC_PENDING: The seller's onboarding (KYC - Know Your Customer information) is incomplete or awaiting processing. - RESTRICTED_CATEGORY_PENDING: The product is in a restricted category, and category approval is still pending. To request access, submit an application through the Qualification Center on TikTok Shop Seller Center. Applicable only for the US market. |
| ^^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - FAILED: The product failed the audit, or the audit was cancelled. - PRE_APPROVED: The product has passed the audit but is not yet listed due to pending prerequisites. Refer to `pre_approved_reasons` for the prerequisites. - APPROVED: The product passed the audit and has been listed on the platform. |
| ^^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^^id | string |  | The product ID generated by TikTok Shop. |
| ^^integrated_platform_statuses | array<object> |  | The current status of the product on platforms that are natively integrated with TikTok Shop (e.g. TOKOPEDIA). **Note**: For Indonesia sellers, if you did not set the listing platform as `TOKOPEDIA` when creating or editing a product, this will be omitted. |
| ^^^platform | string |  | The integrated platform name. Possible values: - TOKOPEDIA |
| ^^^status | string |  | The product status in the integrated platform. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| ^^is_not_for_sale | boolean |  | A flag indicating whether the product is not for sale. True: Not for sale. False: For sale. |
| ^^listing_quality_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| ^^product_sync_fail_reasons | array<string> |  | The reasons why synchronizing of global product information to local products failed. Only applicable for cross-border sellers. |
| ^^recommended_categories | array<object> |  | Recommended categories for the product based on the product title, description, and images. |
| ^^^id | string |  | The ID of the recommended category. |
| ^^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^sales_regions | array<string> |  | The regions where the product is sold. Possible values: - BR: Brazil - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MX: Mexico - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^^amount | string |  | The price amount. |
| ^^^^currency | string |  | The currency. Possible values: USD |
| ^^^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^^^inventory | array<object> |  | SKU inventory information. |
| ^^^^quantity | integer |  | The total SKU quantity available in the warehouse. |
| ^^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve details of the warehouse from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^^^list_price | object |  | The SKU's list price information that has been verified to be legitimate by the audit team. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: - This field will be empty or display the last verified price if the submitted price fails verification. - This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^^amount | string |  | The price amount. |
| ^^^^currency | string |  | The currency. Possible values: USD |
| ^^^price | object |  | SKU pricing information. |
| ^^^^currency | string |  | The currency. Possible values: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. |
| ^^^^tax_exclusive_price | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. **Note**: Tax-exclusive pricing does not apply to the JP market, therefore this value is the same as `sale_price`. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^status | string |  | The product status in TikTok Shop. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED **Note**: For Indonesia sellers, if you did not set the listing platform as `TIKTOK_SHOP` when creating or editing a product, this will be omitted. |
| ^^title | string |  | The product title. |
| ^^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^total_count | integer |  | The total number of products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ListingSchemas

The interface returns the field requirements for creating a product. By providing the leaf category ID, you can obtain the field information and input methods for the product creation requirements.

**Path:** `/product/202401/listing_schemas`
**Method:** `GET`
**Version:** 202401
**Docs:** https://partner.tiktokshop.com/docv2/page/listing-schemas-202401

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_ids | array<integer> | Y | The interface returns the field requirements for creating a product. By providing the leaf category ID, you can obtain the field information and input methods for the product creation requirements. |
| locale | string |  | Category information will be returned in the corresponding language based on the specified locale. If no locale is provided, the default locale of the store will be used. The currently supported locales include: en-GB, en-US, id-ID, ms-MY, th-TH, vi-VN, zh-CN. Use BCP-47 language codes, such as 'en-US' or 'id'. For more details, please refer to http://www.unicode.org/reports/tr35/#Unicode_locale_identifier. |
| category_version | string |  | The version id of the category tree.The new version id is "v2" and will return data from our new 7-level category tree.The old version id is "v1" and will return data from the current 3-level category tree.The old version of category data will be given by default. |

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
| ^errors | array<object> |  | The list of errors that occurred from executing the mutation. |
| ^^code | integer |  | Listing schema failed status code |
| ^^detail | object |  | Detailed error reasons |
| ^^^category_id | integer |  | The category that failed to be fetched |
| ^^message | string |  | Listing schema failed status message |
| ^listing_schemas | array<object> |  | The schema information of listing product. |
| ^^category_id | integer |  | The category id |
| ^^fileds | array<object> |  | The description of the fields in the schema explains the capabilities, rules, and other properties of the fields. |
| ^^^complex_values | array<object> |  | List of complex subfield values |
| ^^^^id | string |  | Subfield ID |
| ^^^^name | string |  | Subfield name |
| ^^^^options | array<object> |  | The list of field options. For optional fields, return all the available options. |
| ^^^^rules | array<object> |  | Rule list of the field, expressing the product listing rules of field. |
| ^^^id | string |  | The id of the listing fields. The fields include: title,category, brand, product_attributes, sku.sale_attributes, sku.identifier_code, package_dimensions. |
| ^^^name | string |  | The fields display name. |
| ^^^options | array<object> |  | The list of field options. For optional fields, return all the available options. |
| ^^^^id | string |  | The id of option |
| ^^^^name | string |  | The name of option |
| ^^^rules | array<object> |  | The rules of the schema's fields are used to describe the requirements of the product. |
| ^^^^type | string |  | The type of rule, with detailed explanation, such as: - VALUE_TYPE(required field): The field values for the following data types need to be satisfied, including: Types: string (text type), For example: Title, SellerSKU, custom properties integer (integer type), For example: Inventory amount. date (date type), For example: Creation time, update time, etc. uri (media resource ID),For example: Main image ID html (text supporting HTML markup syntax) For example: Product description - REQUIRED(required field): Is the field a required field. - SUPPORTED(optional field): Is the field a supported field. - DISABLE(required field): The rule description field is a deprecated field. - MAX_LENGTH/ MIN_LENGTH(optional field):The maximum/minimum length generally refers to the character length limit. - MAX_VALUE/MIN_VALUE(optional field): The maximum/minimum value generally refers to the numerical limit. - MAX_INPUT_NUM/MIN_INPUT_NUM(optional field): The maximum/minimum number of selections generally refers to the number of options that can be selected in a multiple-choice scenario. - MAX_TARGE_TSIZE/MIN_TARGE_TSIZE(optional field):The maximum/minimum target file size generally refers to the size of the resource. - REGX(optional field)：Regular expression matching refers to input rules for input classes. - TIP(optional field):Provide an explanation for filling in the rule description field. - SAMPLE(optional field):Provide an example for filling in the rule description field. - CUSTOM(optional field):Explain whether the rule supports customization for fields. By default, customization is not supported. - MULTI_INPUT(optional field):Explain whether the rule supports multiple inputs for fields. By default, it is single input. - AVAILABLE(optional field)：The rule is used to express whether it is in an available state. For example, the category is available. - AUTHORIZED(optional field)：The rule is used to express whether it is in an authorized state, for example, scheduled category authorization. |
| ^^^^value | string |  | The values of the rules |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckGlobalProductListing

Creating global products will have some prerequisites for sellers to complete. Use this APl to check whether the seller is ready to publish products. Notice: To use this API, you need to request all the listing global product  required fields to check whether the product information meets the listing requirements.

**Path:** `/product/202404/global_products/listing_check`
**Method:** `POST`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/check-global-product-listing-202404

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_id | string |  | You can get all brand information through the "Get Global Brands" API. The Get Global Brands API will return the available status of the brand. Notice: The unauthorized brand information is only used for statistical purposes and won't be displayed to customers. |
| category_id | string |  | The global product category must be a Leaf Category, which is the lowest level of category. Leaf Categories are a category which has no sub categories under it. If you do not use a Leaf Category, your Create Global Product call will be rejected. You can get all category information through the "Get Global Categories" API. |
| certifications | array<object> |  | Based on the category your product belongs to, your product may require product certification. You can obtain the requirements for each category via the "Get Global Category Rule" API. Refers to certain types of products that require prior approval from TikTok Shop to be sold. Sellers who wish to sell restricted products may be required to pass a category approval process before selling such products. i.e US market in Restricted and Unsupported Products Guidelines |
| ^files | array<object> |  | Specific category certification file information. |
| ^^format | string |  | Specific category certification documents, with the requirement that the file type should be in PDF format. |
| ^^id | string |  | You can only use the response parameters of the Upload File API as the request parameters. |
| ^^name | string |  | This is the name of the file for certification. The suffix of the file needs to be included. |
| ^id | string |  | This is the certification ID. You can get this id using the "Get Global Category Rule"API. |
| ^images | array<object> |  | Specific category certification image information. |
| ^^uri | string |  | You can only use the response parameters of the Upload Image API as this request parameter. |
| description | string |  | HTML rich text of a product description to describe your product information in detail. Prerequisites: - Must conform to html syntax - Currently, it only supports html tags <p> <img> <ul> <ol> <li> <br> <strong> <b> <i> <em> <u>, other HTML tags will be filtered out and will not take effect. - Tags can not be nested - This field character limit needs to be within 10000 characters. - It is recommended to avoid using Chinese because the copy will be displayed to local users. - The img tag needs to include the src, width, and height attributes, and the image dimensions can not exceed 4000 - Only Tiktok Shop image URLs are allowed, no external URLs. - <strong> <b> <i> <em> <u> <br> should be used within  <p> and <li> Tips - Please provide a clear and comprehensive product description preferably longer than 300 characters, and adding images to the description will help customers make purchasing decisions. - We recommend publishing 3 to 5 selling points. Different selling points are described in segments and a single selling point is within 250 characters to increase the readability of consumers. - We recommend adding auxiliary illustration images under each selling point, and the recommended image resolution is 1200* 1600px, which is convenient for consumers to understand the product more intuitively and accurately. |
| main_images | array<object> |  | You can only use the response parameters of the "Upload Image" API as the request parameters. Prerequisites - Upload 1 to 9 images in png, jpg or jpeg format with file size not more than 5 MB. - The order of image arraylist will become the sequence of images. - The resolution of the image should not be lower than 300*300px, and not higher than 4000px*4000px - Use a language acceptable to the marketplace if need text. Tips - The main body of the product is clear. Please display your product as comprehensively as possible, and it is recommended that there be no less than 5 images. - We recommend using a white background image as the first image,notamosaic containing psoriasis elements: text, logos, borders, color blocks, watermarks or other graphics. |
| ^uri | string |  | The image URI returned by the "Upload Image" API. |
| manufacturer | object |  | You can fill in the Manufacturer Information using this object, including the following fields |
| ^address | string |  | The address of the manufacturer. - Must be filled with name, phone number and email to be valid |
| ^email | string |  | The email address of the manufacturer. - Must be a valid email address - Must be filled with name, address and phone number to be valid |
| ^name | string |  | The name of the manufacturer. - Must be filled with address, phone number and email to be valid |
| ^phone_number | string |  | The phone number of the manufacturer. - Must start with "+" - Must be a valid country code - Must have a " " or "-" between the country code and the local phone number - Must have a valid local phone number - Must be filled with name, address and email to be valid |
| package_dimensions | object |  | The dimensions of the global product package may affect the shipping cost and logistics accessibility. Please fill in the accurate information Tips - Enter the product dimensions after it is packaged to calculate the shipping fee based on the dimensions (i.e. volume weight). - If there is a difference between the dimension entered and the actual dimension, you may be required to make up the difference. |
| ^height | string |  | The package height must be a non-negative integer. |
| ^length | string |  | The package length must be a non-negative integer. |
| ^unit | string |  | The unit for the weight of the global product package must be in metric CENTIMETER, and it should remain in metric units when published in various markets. |
| ^width | string |  | The package width must be a non-negative integer. |
| package_weight | object |  | The weight of the global product package must be in metric KILOGRAM. Product weight will affect the calculation of freight. It must be within the limited scope of the carriage. Tips - Enter the weight by weighing the product after it is packaged. - If there is a difference between the weight entered and the actual weight, you may be required to make up the difference. - If the estimated fee based on the weight is greater than the fee based on the dimensions, the product's weight will be used. - TikTok weight calculation: weight * price per unit of weight |
| ^unit | string |  | The unit for the weight of the global product package must be in metric KILOGRAM, and it should remain in metric units when published in various markets. |
| ^value | string |  | The package weight must be a positive number. |
| product_attributes | array<object> |  | What are the product attributes of Tiktok Shop? Product attributes are the characteristics or properties of a product that can help buyers make informed purchasing decisions. Product attributes describe the attributes or functionalities of a product, enabling buyers to understand potential safety risks associated with specific product features and usage. Product attributes must be complete, accurate, and consistent with the product's name, description, and images on the listing page. How to Use? You can obtain information about product attributes through the "Get Global Attributes" API. |
| ^id | string |  | Only support the input of the product attribute id that is provided by the platform (from "Get Global Attributes" API). |
| ^values | array<object> |  | You can fill in the product attribute value information corresponding to the product attribute id. Optionally fill in either the product attribute value ID or the product attribute value name. If both are filled, the product attribute value ID will be prioritized. |
| ^^id | string |  | Only support the input of the product attribute value id that is provided by the platform (from "Get Global Attributes" API). |
| ^^name | string |  | This field is for you to fill in the custom attribute value. Here are some conditions of the field: 1. Only English characters and numbers are supported 2. The maximum character is 500. 3. This field support submits multiple nonrepeated attribute values Example: Product Attribute ID : 100111 "Material" Product Attribute Values: "Steel, Twill" |
| size_chart | object |  | What is the size chart on Tiktok Shop？ A size chart is a guide that helps individuals find the right size by providing measurements and corresponding sizes for different clothing or products. How to use It？ - Whether the size chart is required and related to the category, and you can obtain relevant information through the "Get Global Category Rule" API. - You can choose to pass in the size chart image or the pre-generated size chart template ID. If both are filled, the size chart template ID will be prioritized. |
| ^image | object |  | The image of size chart |
| ^^uri | string |  | You can use the "Upload Image" API to upload the size chart image, and then use the image URI returned by the "Upload Image" API as the size chart id. |
| ^template | object |  | The size chart template generated by the size chart tool. This feature can be accessed by going to Seller Center -> Batch Tools -> Manage Template. |
| ^^id | string |  | Size chart template ID |
| skus | array<object> |  | The product skus contain sales attributes, inventory, price, identifier code and other information. |
| ^global_quantity | integer |  | This is inventory information for Global SKU. The global product inventory is the sum of the inventory of each country's shop. How to Use？ When a product is first published to a local shop, the shop's product inventory will be automatically calculated. You can also manually modify the inventory of each shop. Once a product is published, the global product inventory cannot be directly changed. However, you can change the total inventory of the global product by modifying the inventory of the individual country/region shop. |
| ^identifier_code | object |  | If the SKU has a unique identifier code, it can be filled in here. |
| ^^code | string |  | Different SKUs are not allowed to use the same identifier code. The rules for the identifier code are as follows: -  GTIN: 14 digits, numbers only; - EAN: 8, 13, 14 digits, numbers only; - UPC: 12 digits, numbers only; - ISBN: 13 digits, and the last digit supports input X (uppercase) - The GTIN code you enter should be registered with GS1. |
| ^^type | string |  | Code type value: GTIN、EAN、UPC、ISBN (please input one of them into this field) |
| ^inventory | array<object> |  | In a multi-warehouse scenario, it is necessary to set the inventory values for each global warehouse. If inventory is set, global_quantity will not take effect" Prerequisites: Sellers need to enable multi-warehouse permission in the global settings. |
| ^^global_warehouse_id | string |  | Global warehouse ID. You can obtain global entity warehouses through the interface "Get Gloabal Warehouse List", Specifying a global warehouse is only required in multi-warehouse scenarios. |
| ^^quantity | integer |  | The quantity value of stock must be a non-negative number, and the upper limit of inventory value set at one time is 99999. |
| ^price | object |  | This price is for the SKU of a global product. When a global product is published to local shops in various countries, its global product price is converted into the local store price. The conversion formula is as follows: shop sale price=(global product price * market exchange rate+cross-border freight) * (1+VAT tax rate)/(1- order commission rate - payment procedures) |
| ^^amount | string |  | The price can not exceed 99999999.99, up to 2 digits after the decimal point. |
| ^^currency | string |  | This price currency is for the SKU of a global product. |
| ^sales_attributes | array<object> |  | What are the sales attributes of Tiktok Shop? SKU(Stock Keeping Unit) contains sales attributes. Each SKU represents a specific product variant, and product variants are typically composed of multiple sales attributes. Optionally fill in either the sales attribute ID or the sales attribute name. If both are filled, the ID will be prioritized. How to Use? You can obtain information about sales attributes through the "Get Attributes" API. The sales attribute information of SKU can not be duplicated. If the structure is empty, it means that the product has no sales attribute. Tips - Capitalize the first letter of each word (except conjunctions, articles, prepositions) to customize the variation name. - Set the most important variation as the first, and add SKU pictures, and add corresponding product pictures under different SKUs, instead of using the same picture. |
| ^^id | string |  | You can obtain the built-in sales attribute IDs through the Get Global Attributes API. |
| ^^name | string |  | You can use custom sales attributes instead of using platform-provided sales attribute ids. If you do not specify a sales attribute ID and instead input a string to define a sales attribute (for example, inputting the name as "Battery Type"), the system will generate a new unique attribute ID for you. Prerequisites: - It is recommended to avoid using Chinese. - Custom sales attribute names can not contain sensitive characters. - The character length of sales attribute names can not exceed 20 characters. - The number of sales attribute names can not exceed 3. |
| ^^sku_img | object |  | You can add an image to a sales attribute value, and the image will be displayed to the buyer. |
| ^^^uri | string |  | The image uri returned by the "Upload Image" API. If a product has variants that share more than one sales attribute, such as size and color,  you can only choose one of the sales attribute to link an image. Example: - SKU Color-RED(Image 1) Size-XL(No image associated) (allowed) - SKU Color-RED(Image 1) Size-XL(Image 2) (not allowed) |
| ^^value_id | string |  | When creating a new sales attribute value, there is no need to input the value_id. After submitting the custom_value request, the seller will receive the value_id assigned by the platform (which can be viewed in the response body). You can obtain the built-in sales attribute value IDs through the Get Global Attributes API. |
| ^^value_name | string |  | When creating new sales attribute values, merchants are required to input custom sales attribute values. - Only English characters and numbers are supported - Different variants cannot share the same value for a given attribute combination Example: - SKU1 Color -RED; SKU2 Color - RED (not allowed) - SKU1 Color-RED Size-XL; SKU2 Color-RED Size-M(allowed) |
| ^seller_sku | string |  | You can use seller_sku to identify and manage SKUs, and seller_sku will not be displayed to buyers. The character length can not exceed 50 characters. |
| ^sku_unit_count | string |  | The number of unit count of the SKU. The range is from 0.01 - 99999.99 |
| title | string |  | The name of a global product. Prerequisites: - Only English characters and numbers are supported - The product name must include at least 1 character and no more than 255 characters. |
| video | object |  | You can fill in the video information related to the product, and this video will be displayed to the buyer. Tips - The recommended ratio is 1:1 and recommended resolution is above HD 720p. - We recommend the video duration is within 20s, and the longest should not exceed 60s. - Try highlighting 1-2 core selling points for your product. This will be displayed in the product details section. |
| ^id | string |  | Please follow these steps if you need to upload a video here: - Please upload the video file using the "Upload File" API. - Please get the response information (file id from the "UploadFile" API) and use this information to fill in the field. - If you upload a video, it should have an aspect ratio between 9:16 to 16:9. The file can be no bigger than 20MB. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^check_result | string |  | Return the result of product pre-validation. including：PASS、FAILED |
| ^fail_reasons | array<object> |  | If check_result is FAILED, fail_reasons will list the specific items that did not pass the inspection. |
| ^^message | string |  | Failed detail reason |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## OptimizedImages

Optimize images used in your TikTok Shop by changing the background to white.
This is especially useful for images displayed in the product image gallery as it enhances product visibility. 
**Note**: 
- The images to be optimized must first be uploaded to TikTok Shop through the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). You will not be able to optimize any images that are not hosted by TikTok Shop.
- Images that were previously optimized will not be processed again.
- The optimization is processed asynchronously and typically completes within a few seconds. Therefore, the `optimize_status` returned in the first API request for an image is always `PROCESSING`, indicating that optimization is underway. Please call the API again after a few seconds to get the final optimization status.

**Path:** `/product/202404/images/optimize`
**Method:** `POST`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/optimized-images-202404

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
| images | array<object> |  | The list of images to be optimized. Use the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) to upload the images first and obtain the corresponding image URIs. Max count: 200 |
| ^optimization_mode | array<string> |  | The optimization type. Possible values: - WHITE_BACKGROUND: Change the background to white. |
| ^uri | string |  | The URI of the image. Retrieve the URI from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^images | array<object> |  | The list of images to be optimized. |
| ^^height | integer |  | The expected image height after optimization. |
| ^^optimize_status | string |  | The optimization status. Possible values: - SUCCESS: The image has been successfully optimized. - IGNORE: The image was previously optimized, so no further action was taken. - PROCESSING: The optimization is in progress, and typically completes within a few seconds. Call this API again to obtain the final optimization status. |
| ^^optimized_uri | string |  | The URI of the image after optimization. Pass this value when creating or editing a product to associate the image with the product. Applicable only if `optimize_status`is `SUCCESS`. |
| ^^optimized_url | string |  | The URL of the image after optimization. Use this URL in product descriptions by embedding it within an HTML `<img>` tag. Applicable only if `optimize_status`is `SUCCESS`. |
| ^^original_uri | string |  | The original URI of the image to be optimized. |
| ^^original_url | string |  | The original URL of the image to be optimized. |
| ^^width | integer |  | The expected image width after optimization. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ProductInformationIssueDiagnosis

Diagnose multiple existing live (status: `ACTIVATE`) products to obtain information that helps you to improve the product content, enhancing product visibility and customer trust. The returned information includes:
- Listing quality information (available only for the US market).
- Issues with the current product details and the overall recommendations
- Auto-generated optimization suggestions targeted for specific product fields, including the title, description, and image.
**Note**: This API focuses solely on optimizing product visibility and does not evaluate whether your product meets listing requirements. Quality issues identified by this API do not block your product from being listed. To verify listing requirements, use the [Check Product Listing API](650a0ee8f1fd3102b91c6493).

**Path:** `/product/202405/products/diagnoses`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/product-information-issue-diagnosis-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> | Y | The list of product IDs that you want to diagnose. **Note**: - Max number of IDs: 200 - The product must be live (status: `ACTIVATE`) |
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
| ^products | array<object> |  | The list of requested products and the corresponding diagnosis results. |
| ^^diagnoses | array<object> |  | Product diagnosis and optimization information. |
| ^^^diagnosis_results | array<object> |  | The results of diagnosing the specified field. |
| ^^^^code | string |  | A machine-readable code that represents an identified issue. Refer to [Listing quality diagnosis](https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd) for the full list of diagnosed issues and the corresponding recommendations. |
| ^^^^how_to_solve | string |  | The recommendation for resolving the identified issue, returned in the default locale language of the shop. Refer to [Listing quality diagnosis](https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd) for the full list of recommendations. |
| ^^^^quality_tier | string |  | The listing quality tier you can reach by implementing the recommendation. Possible values: - FAIR - GOOD **Note**: - To reach a higher tier, you must implement all recommendations from the destination tier and all preceding tiers. For example, a product will reach the "GOOD" tier once all "FAIR" and "GOOD" recommendations are addressed or implemented. - Available only for the US market. |
| ^^^field | string |  | The product field being diagnosed. Possible values: - TITLE: Product title - DESCRIPTION: Product description - IMAGE: Product image (`main_images` in the product entity) - ATTRIBUTE: Product attribute - SIZE_CHART: Product size chart |
| ^^^suggestion | object |  | Optimization suggestions that are auto-generated by the system to improve the effectiveness of the specified field. |
| ^^^^images | array<object> |  | The optimized image. Only the first image in the `main_images` set will be optimized. |
| ^^^^seo_words | array<object> |  | The SEO keyword suggestions for product titles. |
| ^^^^smart_texts | array<object> |  | The list of optimized product title or description. |
| ^^id | string |  | The product ID. |
| ^^listing_quality | object |  | Product listing quality information. |
| ^^^current_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| ^^^remaining_recommendations | integer |  | The remaining number of recommendations (see `diagnosis_results`) that must be implemented for the product to reach the highest tier. **Note**: - To reach the highest tier, you must implement all recommendations listed in `diagnosis_results`. - Available only for the US market. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetProductsSEOWords

Obtain SEO suggestions for product titles of live products (status: `ACTIVATE`) to enhance product visibility.
Applicable only for the US, UK, and SEA markets.

**Path:** `/product/202405/products/seo_words`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-products-seowords-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> | Y | The product IDs for which you want to obtain SEO suggestions. - Max IDs: 20 - The product must be live (`ACTIVATE` status) |
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
| ^products | array<object> |  | The list of requested products and the corresponding suggestions. |
| ^^id | string |  | The product ID. |
| ^^seo_words | array<object> |  | The list of SEO keyword suggestions for the product title. |
| ^^^text | string |  | The suggested SEO keyword. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetRecommendedProductTitleAndDescription

Obtain AI-optimized product titles and descriptions for live products (status: `ACTIVATE`).

**Path:** `/product/202405/products/suggestions`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-recommended-product-title-and-description-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> | Y | The product IDs for which you want to optimize the information. - Max IDs: 20 - The product must be live (status: `ACTIVATE`) |
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
| ^products | array<object> |  | The list of requested products and the corresponding suggestions. |
| ^^id | string |  | The product ID. |
| ^^suggestions | array<object> |  | The suggestions for each product field. |
| ^^^field | string |  | The applicable product field. Possible values: - TITLE - DESCRIPTION |
| ^^^items | array<object> |  | The list of optimized text. |
| ^^^^text | string |  | The optimized text. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ListingSchemas

The interface returns the field requirements for creating a product. By providing the leaf category ID, you can obtain the field information and input methods for the product creation requirements.

**Path:** `/product/202407/listing_schemas`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/listing-schemas-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_ids | array<integer> | Y | The interface returns the field requirements for creating a product. By providing the leaf category ID, you can obtain the field information and input methods for the product creation requirements. |
| locale | string |  | Category information will be returned in the corresponding language based on the specified locale. If no locale is provided, the default locale of the store will be used. The currently supported locales include: en-GB, en-US, id-ID, ms-MY, th-TH, vi-VN, zh-CN. Use BCP-47 language codes, such as 'en-US' or 'id'. For more details, please refer to http://www.unicode.org/reports/tr35/#Unicode_locale_identifier. |
| category_version | string |  | The version id of the category tree.The new version id is "v2" and will return data from our new 7-level category tree.The old version id is "v1" and will return data from the current 3-level category tree.The old version of category data will be given by default. |

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
| ^errors | array<object> |  | The list of errors that occurred from executing the mutation. |
| ^^code | integer |  | Listing schema failed status code |
| ^^detail | object |  | Detailed error reasons |
| ^^^category_id | integer |  | The category that failed to be fetched |
| ^^message | string |  | Listing schema failed status message |
| ^listing_schemas | array<object> |  | The schema information of listing product. |
| ^^category_id | integer |  | The category id |
| ^^fields | array<object> |  | The description of the fields in the schema explains the capabilities, rules, and other properties of the fields. |
| ^^^complex_values | array<object> |  | List of complex subfield values |
| ^^^^id | string |  | Subfield ID |
| ^^^^name | string |  | Subfield name |
| ^^^^options | array<object> |  | The list of field options. For optional fields, return all the available options. |
| ^^^^rules | array<object> |  | Rule list of the field, expressing the product listing rules of field. |
| ^^^id | string |  | The id of the listing fields. The fields include: title,category, brand, product_attributes, sku.sale_attributes, sku.identifier_code, package_dimensions. |
| ^^^name | string |  | The fields display name. |
| ^^^options | array<object> |  | The list of field options. For optional fields, return all the available options. |
| ^^^^id | string |  | The id of option |
| ^^^^name | string |  | The name of option |
| ^^^rules | array<object> |  | The rules of the schema's fields are used to describe the requirements of the product. |
| ^^^^type | string |  | The type of rule, with detailed explanation, such as: - VALUE_TYPE(required field): The field values for the following data types need to be satisfied, including: Types: string (text type), For example: Title, SellerSKU, custom properties integer (integer type), For example: Inventory amount. date (date type), For example: Creation time, update time, etc. uri (media resource ID),For example: Main image ID html (text supporting HTML markup syntax) For example: Product description - REQUIRED(required field): Is the field a required field. - SUPPORTED(optional field): Is the field a supported field. - DISABLE(required field): The rule description field is a deprecated field. - MAX_LENGTH/ MIN_LENGTH(optional field):The maximum/minimum length generally refers to the character length limit. - MAX_VALUE/MIN_VALUE(optional field): The maximum/minimum value generally refers to the numerical limit. - MAX_INPUT_NUM/MIN_INPUT_NUM(optional field): The maximum/minimum number of selections generally refers to the number of options that can be selected in a multiple-choice scenario. - MAX_TARGE_TSIZE/MIN_TARGE_TSIZE(optional field):The maximum/minimum target file size generally refers to the size of the resource. - REGX(optional field)：Regular expression matching refers to input rules for input classes. - TIP(optional field):Provide an explanation for filling in the rule description field. - SAMPLE(optional field):Provide an example for filling in the rule description field. - CUSTOM(optional field):Explain whether the rule supports customization for fields. By default, customization is not supported. - MULTI_INPUT(optional field):Explain whether the rule supports multiple inputs for fields. By default, it is single input. - AVAILABLE(optional field)：The rule is used to express whether it is in an available state. For example, the category is available. - AUTHORIZED(optional field)：The rule is used to express whether it is in an authorized state, for example, scheduled category authorization. |
| ^^^^value | string |  | The values of the rules |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateCategoryUpgradeTask

Create a task to upgrade live products (status: `ACTIVATE`) from a 3-level to a 7-level category tree.
The task runs for up to 2 hours, depending on the number of products. If the upgrade is incomplete after 2 hours, call the API again. To figure out which products' categories have not been upgraded, call the [Search Product API](https://partner.tiktokshop.com/docv2/page/65854ffb8f559302d8a6acda) and set "category_version" to "v1".
**Note**: You must wait at least 24 hours after a product goes live to successfully upgrade its category. If you call this API on the same day a new product goes live, the system will be unable to detect it.

**Path:** `/product/202407/products/category_upgrade_task`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/create-category-upgrade-task-202407

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

## SearchSizeCharts

Retrieve size charts that a seller has created.

**Path:** `/product/202407/sizecharts/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/search-size-charts-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| locales | array<string> |  | The BCP-47 locale codes for displaying the size charts. Default: The default locale of your shop. Possible values: - de-DE - en-GB - en-IE - en-US - es-ES - es-MX - fr-FR - id-ID - it-IT - ja-JP - ms-MY - pt-BR - th-TH - vi-VN - zh-CN |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| ids | array<string> |  | Filter size charts by size chart template IDs. Max: 50 IDs |
| keyword | string |  | Filter size charts by size chart template name or by key words in the template name. If both `ids` and `keyword` are provided, `ids` takes priority. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^size_chart | array<object> |  | The list of size charts that meet the query conditions. |
| ^^images | array<object> |  | The list of images included in a size chart. |
| ^^^locale | string |  | The language of the size chart image. |
| ^^^uri | string |  | The URI to identify the image in API requests and responses. |
| ^^^url | string |  | The URL to access and view the image. |
| ^^template_id | string |  | The size chart template ID. |
| ^^template_name | string |  | The size chart template name. |
| ^total_count | integer |  | The number of size charts that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadCandidateProducts

Upload products from an external ecommerce platform as candidate products to evaluate if they match any available product opportunities. (A product opportunity refers to potential market demands or gaps where your products could succeed.)

Run this API before creating an actual product in TikTok Shop to identify market potential and improve sales outcomes. After uploading candidate products, matching with opportunities will occur asynchronously. You can keep track of any updates through the [Opportunity Matching Status Change webhook] or the [Search Candidate Products API]. Opportunity matching will end on the day stated in `opportunity_matching_end_time`.

**Path:** `/product/202409/candidate_products/batch`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-candidate-products-202409

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
| candidate_products | array<object> |  | Candidate product information, obtained from an existing product in an external ecommerce platform. Upload up to 10 candidate products at a time. |
| ^description | string |  | The product description. Max length: 6000 |
| ^external_category_name | string |  | The category of the product in the external e-commerce platform. Max length: 100 |
| ^external_product_id | string |  | An external product identifier used in the external e-commerce platform. Max length: 64 |
| ^images | array<object> |  | A list of main images for the product. Max: 25 |
| ^^uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| ^opportunity_matching_end_time | integer |  | The time by which the system will stop matching opportunities for this product. Unix timestamp. Default: 60 days from the upload time Latest allowable time: 60 days from the upload time |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. Max:600 |
| ^^price | object |  | SKU pricing information. |
| ^^^amount | string |  | The SKU's selling price. Valid range: [0.01, 7,600] |
| ^^^currency | string |  | The currency of the SKU price. Possible values: "USD" |
| ^^sales_attributes | array<object> |  | A list of attributes (e.g. size, color, length) that define each variant of a product. Max: 10 |
| ^^^name | string |  | The sales attribute name. Max length: 50 |
| ^^^sku_images | array<object> |  | A list of images to display for the SKU. Max count: 25 |
| ^^^^uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| ^^^value | string |  | The sales attribute value. Max length: 50 |
| ^title | string |  | The product title. Max length: 100 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^external_product_id | string |  | The external product id of the candidate product where the error occurred. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditCandidateProducts

Edit a subset of candidate product properties.
- Note: 
Updates are handled per top-level property under `product_candidates`, so all non-empty fields within an updated object must be supplied to prevent overwriting with blanks.
  - For top-level properties (e.g. `title`, `description`) that are not nested in an object, you can update them individually. Omitting these properties in the request will leave them unchanged.
  - If you need to edit any nested property within an object, you must provide values for all nested properties of that object. If any nested properties are omitted, they will be overwritten with blanks. For example, if you want to update `price.amount`, you must also include the `currency` property to avoid data loss for that property. When editing an array, all previously defined array entries will be cleared and replaced by the new values provided in the request.

**Path:** `/product/202409/candidate_products/partial_edit/batch`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-candidate-products-202409

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
| candidate_products | array<object> |  | Candidate product information, obtained from an existing product in an external e-commerce platform. Edit up to 10 candidate products at a time. |
| ^description | string |  | The product description. Max length: 6000 |
| ^external_category_name | string |  | The category of the product in the external e-commerce platform. Max length: 100 |
| ^external_product_id | string |  | An external product identifier used in the external e-commerce platform. Max length: 64 |
| ^images | array<object> |  | A list of main images for the product. Max count: 25 |
| ^^uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| ^opportunity_matching_end_time | integer |  | The time by which the system will stop matching opportunities for this candidate product. Unix timestamp. Default: 60 days from the upload time Latest allowable time: 60 days from the upload time |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. Max SKUs count: 600 |
| ^^price | object |  | SKU pricing information. |
| ^^^amount | string |  | The SKU's selling price. Valid range: [0.01, 7,600] |
| ^^^currency | string |  | The currency of the SKU price. Possible values: "USD" |
| ^^sales_attributes | array<object> |  | A list of attributes (e.g. size, color, length) that define each variant of a product. Max count: 10 |
| ^^^name | string |  | The sales attribute name. Max length: 50 |
| ^^^sku_images | array<object> |  | A list of images to display for the SKU. Max count: 25 |
| ^^^^uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| ^^^value | string |  | The sales attribute value. Max length: 50 |
| ^title | string |  | The product title. Max length: 100 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The main error code. |
| ^^detail | object |  | The details of the main error. |
| ^^^external_product_id | string |  | The external product id of the candidate product where the error occurred. |
| ^^message | string |  | The main error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCandidateProducts

Retrieve a list of candidate products and the corresponding matched opportunity IDs.

**Path:** `/product/202409/candidate_products/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-candidate-products-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page.  Valid range: [1-100] |
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
| external_product_ids | array<string> |  | Filter candidate products by the external_product_id. Max IDs: 10 |
| opportunity_matching_statuses | array<string> |  | Filter candidate products by the opportunity matching statuses. Possible values: - PENDING: Waiting for opportunity matching. - MATCHED: There are one or more matched opportunities. - NOT_MATCHED: There are no matches. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^candidate_products | array<object> |  | Candidate product information. |
| ^^create_time | integer |  | The time when the candidate product is created. Unix timestamp. |
| ^^description | string |  | The product description. |
| ^^external_category_name | string |  | The category of the product in the external ecommerce platform. |
| ^^external_product_id | string |  | An external product identifier used in the external ecommerce platform. |
| ^^images | array<object> |  | A list of main images for the product. |
| ^^^uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22). |
| ^^opportunity_ids | array<string> |  | A list of IDs for the matched opportunities. |
| ^^opportunity_matching_end_time | integer |  | The time by which the system will stop matching opportunities for this candidate product. Unix timestamp. Default: 60 days from the upload time Latest allowable time: 60 days from the upload time |
| ^^opportunity_matching_status | string |  | Th status of opportunity matching. Possible values: - PENDING: Waiting for opportunity matching. - MATCHED: There are one or more matched opportunities. - NOT_MATCHED: There are no matches. |
| ^^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^price | object |  | SKU pricing information. |
| ^^^^amount | string |  | The SKU's selling price. |
| ^^^^currency | string |  | The currency of the SKU price. |
| ^^^sales_attributes | array<object> |  | A list of attributes (e.g. size, color, length) that define each variant of a product. |
| ^^^^name | string |  | The sales attribute name. |
| ^^^^sku_images | array<object> |  | A list of images to display for the SKU. |
| ^^^^value | string |  | The sales attribute . |
| ^^title | string |  | The product title. |
| ^^update_time | integer |  | The time when the candidate product is last updated. Unix timestamp. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of candidate products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateManufacturer

Add a manufacturer for a seller. The provided information will be automatically translated into all EU languages supported by TikTok Shop.
- Use the [Search Manufacturers API](67066a580dcee902fa03ccf9) to obtain the translations.
- Use the [Partial Edit Manufacturer API](67066a55c55b3a03044eea29) to edit the translations, if necessary.
- When creating a product, pass the returned `manufacturer_id` to associate the product with the manufacturer.
Target seller: Local sellers operating in EU countries

**Path:** `/product/202409/compliance/manufacturers`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/create-manufacturer-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| address | string |  | The postal address of the manufacturer. Max length: 500 characters |
| email | string |  | The email address of the manufacturer. |
| locale | string |  | The BCP-47 locale code representing the language used for specifying the manufacturer information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT Default: The locale of the seller's registered business address. **Note**: The information provided will be automatically translated into all EU languages supported by TikTok Shop. Ensure the locale matches the language used in field values to avoid inaccurate translations. |
| name | string |  | The manufacturer name. Max length: 255 characters |
| phone_number | object |  | The phone number of the manufacturer. |
| ^availability | string |  | Indicates the availability of the phone number. Possible values: - `AVAILABLE`: The phone number is available and required. - `UNAVAILABLE`: No phone number is available. Default: AVAILABLE |
| ^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Max digits: 4 Required if `availability=AVAILABLE`. |
| ^local_number | string |  | The local number. Length: 7 - 20 digits Required if `availability=AVAILABLE`. |
| registered_trade_name | string |  | The registered trade name of the manufacturer. Max length: 200 characters |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^manufacturer_id | string |  | A unique ID that identifies the manufacturer in TikTok Shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchManufacturers

Retrieve a list of manufacturers based on their ID or keywords.
When creating a product, pass the returned `manufacturer_id` to associate the product with the manufacturer.
Target seller: Local sellers operating in EU countries

**Path:** `/product/202409/compliance/manufacturers/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-manufacturers-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Filter results to show those that contain this keyword. Search scope: name, registered trade name, local_number, email Max length: 200 characters **Note**: Provide either the `manufacturer_ids` or `keyword`; if both are provided, `manufacturer_ids` will take priority. |
| manufacturer_ids | array<string> |  | Filter results by these manufacturer IDs. Max IDs: The value of `page_size` |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^manufacturers | array<object> |  | The list of manufacturers that meet the query conditions. |
| ^^address | string |  | The postal address of the manufacturer. Max length: 500 characters |
| ^^email | string |  | The email address of the manufacturer. |
| ^^id | string |  | The manufacturer ID in TikTok Shop. |
| ^^name | string |  | The manufacturer name. Max length: 255 characters |
| ^^phone_number | object |  | The phone number of the manufacturer. |
| ^^^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Max digits: 4 |
| ^^^local_number | string |  | The local number. Length: 7 - 20 digits |
| ^^registered_trade_name | string |  | The registered trade name of the manufacturer. Max length: 200 characters |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of manufacturers that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditManufacturer

Edit the details of a manufacturer in the EU languages supported by TikTok Shop. Include the locale code to edit the responsible person's information in a particular language.
Target seller: Local sellers operating in EU countries
**Note**:
- Updates are handled per top-level property, so all non-empty fields within an updated object must be supplied to prevent overwriting with blanks.
- For top-level properties (e.g. `name`, `email`) that are not nested in an object, you can update them individually. Omitting these properties in the request will leave them unchanged.
- If you need to edit any nested property within an object, you must provide values for all nested properties of that object. Any omitted nested properties will be overwritten with blanks. For example, if you want to update `phone_number.local_number`, you must also include the `country_code` property to avoid data loss for that property.

**Path:** `/product/202409/compliance/manufacturers/{manufacturer_id}/partial_edit`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-manufacturer-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| manufacturer_id | string | Y | The manufacturer ID in TikTok Shop. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| address | string |  | The postal address of the manufacturer. Max length: 500 characters |
| email | string |  | The email address of the manufacturer. |
| locale | string |  | The BCP-47 locale code representing the language used for specifying the responsible person information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT Default: The locale of the seller's registered business address. **Note**: The information provided will be automatically translated into all EU languages supported by TikTok Shop. Ensure the locale matches the language used in field values to avoid inaccurate translations. |
| name | string |  | The manufacturer name. Max length: 255 characters |
| phone_number | object |  | The phone number of the manufacturer. |
| ^availability | string |  | Indicates the availability of the phone number. Possible values: - `AVAILABLE`: The phone number is available and required. - `UNAVAILABLE`: No phone number is available. Default: AVAILABLE |
| ^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Max digits: 4 Required if `availability=AVAILABLE`. |
| ^local_number | string |  | The local number. Length: 7 - 20 digits Required if `availability=AVAILABLE`. |
| registered_trade_name | string |  | The registered trade name of the manufacturer. Max length: 200 characters |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateResponsiblePerson

Add a new EU responsible person who ensures a seller's products comply with EU regulations. The provided information will be automatically translated into all EU languages supported by TikTok Shop.
- Use the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1) to obtain the translations.
- Use the [Partial Edit Responsible Person API](67066a5587019802fdce19b3) to edit the translations, if necessary.
- When creating a product, pass the returned `responsible_person_id` to associate the product with the responsible person.

Target seller: Local sellers operating in EU countries

**Path:** `/product/202409/compliance/responsible_persons`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/create-responsible-person-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| address | object |  | The residential address of the responsible person. |
| ^city | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The city name. Max length: 500 characters |
| ^country | string |  | The two letter ISO 3166 country code representing the country of the address. It must be an EU country. |
| ^district | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The district name. Max length: 500 characters |
| ^postal_code | string |  | The postal code. Max length: 500 characters |
| ^province | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The province, state, or region name. Max length: 500 characters |
| ^street_address_line1 | string |  | The detailed street address of the location, including the building number, street name, district, city, province, and any relevant details. Max length: 500 characters |
| ^street_address_line2 | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) An optional secondary line for additional address details, if necessary. Max length: 500 characters |
| email | string |  | The email address of the responsible person. |
| locale | string |  | The BCP-47 locale code representing the language used for specifying the responsible person information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT Default: The locale of the seller's registered business address. **Note**: The information provided will be automatically translated into all EU languages supported by TikTok Shop. Ensure the locale matches the language used in field values to avoid inaccurate translations. |
| name | string |  | The responsible person name. Max length: 200 characters |
| phone_number | object |  | The phone number of the responsible person. |
| ^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Only EU country codes are allowed. Max digits: 4 |
| ^local_number | string |  | The local number. Length: 7 - 11 digits |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^responsible_person_id | string |  | A unique ID that identifies the responsible person in TikTok Shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchResponsiblePersons

Retrieve a list of responsible persons based on their ID or keywords.
When creating a product, pass the returned `responsible_person_id` to associate the product with the responsible person.
Target seller: Local sellers operating in EU countries

**Path:** `/product/202409/compliance/responsible_persons/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-responsible-persons-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Filter results to show those that contain this keyword. Search scope: name, local_number, email Max length: 200 characters **Note**: Provide either the `responsible_person_ids` or `keyword`; if both are provided, `responsible_person_ids` will take priority. |
| responsible_person_ids | array<string> |  | Filter results by these responsible person IDs. Max IDs: The value of `page_size` |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^responsible_persons | array<object> |  | The list of responsible persons that meet the query conditions. |
| ^^address | object |  | The residential address of the responsible person. |
| ^^^city | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the city name.) The city name. Max length: 500 characters |
| ^^^country | string |  | The country name. It must be an EU country. Max length: 500 characters |
| ^^^district | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the district name.) The district name. Max length: 500 characters |
| ^^^postal_code | string |  | The postal code. Max length: 500 characters |
| ^^^province | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the province name.) The province, state, or region name. Max length: 500 characters |
| ^^^street_address_line1 | string |  | The detailed street address of the location, including the building number, street name, district, city, province, and any relevant details. Max length: 500 characters |
| ^^^street_address_line2 | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the relevant details.) An optional secondary line for additional address details, if necessary. Max length: 500 characters" |
| ^^email | string |  | The email address of the responsible person. |
| ^^id | string |  | The responsible person ID in TikTok Shop. |
| ^^name | string |  | The responsible person name. Max length: 200 characters |
| ^^phone_number | object |  | The phone number of the responsible person. |
| ^^^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Only EU country codes are allowed. Max digits: 4 |
| ^^^local_number | string |  | The local number. Length: 7 - 11 digits |
| ^total_count | integer |  | The number of responsible persons that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditResponsiblePerson

Edit the details of an EU responsible person in the EU languages supported by TikTok Shop. Include the locale code to edit the responsible person's information in a particular language.
Target seller: Local sellers operating in EU countries
**Note**:
- Updates are handled per top-level property, so all non-empty fields within an updated object must be supplied to prevent overwriting with blanks.
- For top-level properties (e.g. `name`, `email`) that are not nested in an object, you can update them individually. Omitting these properties in the request will leave them unchanged.
- If you need to edit any nested property within an object, you must provide values for all nested properties of that object. Any omitted nested properties will be overwritten with blanks. For example, if you want to update `phone_number.local_number`, you must also include the `country_code` property to avoid data loss for that property.

**Path:** `/product/202409/compliance/responsible_persons/{responsible_person_id}/partial_edit`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-responsible-person-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| responsible_person_id | string | Y | The responsible person ID in TikTok Shop. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| address | object |  | The residential address of the responsible person. |
| ^city | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The city name. Max length: 500 characters |
| ^country | string |  | The two letter ISO 3166 country code representing the country of the address. It must be an EU country. |
| ^district | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The district name. Max length: 500 characters |
| ^postal_code | string |  | The postal code. Max length: 500 characters |
| ^province | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) The province, state, or region name. Max length: 500 characters |
| ^street_address_line1 | string |  | The detailed street address of the location, including the building number, street name, district, city, province, and any relevant details. Max length: 500 characters |
| ^street_address_line2 | string |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. If provided, its value will be merged into `street_address_line1`. It is recommended to specify `street_address_line1` directly.) An optional secondary line for additional address details, if necessary. Max length: 500 characters |
| email | string |  | The email address of the responsible person. |
| locale | string |  | The BCP-47 locale code representing the language used for specifying the responsible person information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT Default: The locale of the seller's registered business address. **Note**: The information provided will be automatically translated into all EU languages supported by TikTok Shop. Ensure the locale matches the language used in field values to avoid inaccurate translations. |
| name | string |  | The responsible person name. Max length: 200 characters |
| phone_number | object |  | The phone number of the responsible person. |
| ^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Only EU country codes are allowed. Max digits: 4 |
| ^local_number | string |  | The local number. Length: 7 - 11 digits |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchOpportunities

Retrieve details of product opportunities based on the `opportunity_ids` returned from [Search Candidate Products API].

**Path:** `/product/202409/opportunities/search`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/search-opportunities-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
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
| opportunity_ids | array<string> |  | Filter opportunities by opportunity_ids. Max IDs: 10 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^opportunities | array<object> |  | Product opportunity information. |
| ^^benefits | array<string> |  | A description of the call-to-action for the seller and the corresponding benefits for participating. **Examples**: - "Register the same product to win increased visibility in Shop Tab" - "Register the same product attributes to win the chance of Price Bidding" |
| ^^create_time | integer |  | The time when the opportunity is created. Unix timestamp. |
| ^^id | string |  | The opportunity ID. |
| ^^tags | array<string> |  | A tag used to categorize the market potential or demands. Possible values: - TIKTOKSHOP_HOT_SELLING: The product is a top-selling item on TikTok Shop. - POPULAR_IN_TIKTOKSHOP: The product is popular on TikTok Shop. - POPULAR_IN_MARKETPLACES: The product is popular across various marketplaces. |
| ^^type | string |  | The type of opportunity, indicating the level at which the opportunity applies. It also defines the requirements when submitting a product for entry into an opportunity. Possible values: - PRODUCT: The opportunity applies to popular products. The product you submit for entry must be the exact same product as the one featured in the opportunity. - LEAF_CATEGORY: The opportunity applies to popular leaf categories. The product you submit for entry must belong to the same leaf category as the one featured in the opportunity. |
| ^^update_time | integer |  | The time when the opportunity is last updated. Unix timestamp. |
| ^total_count | integer |  | The number of opportunities that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ApplyOpportunities

Apply to enroll a product in multiple opportunities.
After using the [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a) to create TikTok Shop products that meet the matched opportunity requirements, you can apply for opportunities related to your product. All applications are subject to approval by TikTok Shop.

**Path:** `/product/202409/products/{product_id}/opportunities`
**Method:** `PUT`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/apply-opportunities-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

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
| opportunity_ids | array<string> |  | The IDs of the opportunities that you want to enroll your product in. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^opportunity_applications | array<object> |  | The opportunity application information. Each application is defined by 1 product ID and 1 opportunity ID. |
| ^^id | string |  | The opportunity application ID. |
| ^^opportunity_id | string |  | The opportunity ID. |
| ^^product_id | string |  | The product ID in TikTok Shop. |
| ^^status | string |  | The approval status for the application. Possible values: - REVIEWING - APPROVED - REJECTED |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DiagnoseandOptimizeProduct

Diagnose products to obtain information that helps you to improve the product content, enhancing product visibility and customer trust. The returned information includes:
- Listing quality information (available only for the US market).
- Issues with the current product details and the overall recommendations
- Auto-generated optimization suggestions targeted for specific product fields, including the title, description, and image.
This API enables you to diagnose both live products (status: `ACTIVATE`)  and brand-new products not yet listed in TikTok Shop.
- To diagnose a **live product**, provide the `product_id` and `category_id` and leave all other product details blank.
- To diagnose a **brand-new product** not yet listed in TikTok Shop, omit the `product_id` and provide the product details as necessary.
- To diagnose a **product similar to an existing one**, provide the `product_id` and `category_id`, along with any new details. The diagnosis will combine the existing product's information with the new details you provide. For example, if you provide a new `title`, the diagnosis will use the new title instead of the existing one while keeping the other values from the product ID.
**Note**: 
- To diagnose multiple live products, use the [Product Information Issue Diagnosis API](665048f380b6b302e73917d9).
- This API focuses solely on optimizing product visibility and does not evaluate whether your product meets listing requirements. Quality issues identified by this API do not block your product from being listed. To verify listing requirements, use the [Check Product Listing API](650a0ee8f1fd3102b91c6493).

**Path:** `/product/202411/products/diagnose_optimize`
**Method:** `POST`
**Version:** 202411
**Docs:** https://partner.tiktokshop.com/docv2/page/diagnoseand-optimize-product-202411

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. Use the [Get Categories API](https://partner.tiktokshop.com/docv2/page/6509c89d0fcef602bf1acd9b) to find out if a category is a leaf category in a particular `category_version`. **Note**: - For the US market, refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. - For the Indonesia market, to list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Images must use TikTok Shop image URLs, not exceed 4000px, and include `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| main_images | array<object> |  | A list of images to display in the product image gallery. Use the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) to upload the images first and obtain the corresponding image URI. **Note**: - Max number of image URIs: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Retrieve the URI from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) or the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97). |
| optimization_fields | array<string> |  | The fields for which you want to generate specific optimization suggestions. Possible values: - TITLE: Product title - DESCRIPTION: Product description (suggestions for this may take more than 10 seconds to generate) - IMAGE: Product image displayed in the image gallery - ALL: Suggestions are generated for all the above fields - NONE: No suggestions will be provided. Default: NONE |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Note**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. Retrieve the product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of a built-in product attribute value, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 500 characters |
| product_id | string |  | The product ID of an existing product in TikTok Shop. - Omit this if you are diagnosing a brand-new product not yet listed in TikTok Shop. - Provide this ID if the product is similar to an existing one, and you want the diagnosis to consider both the existing product's details and the new information in this request. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. - If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. |
| ^^uri | string |  | The URI of the size chart image. Use the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) to upload the image first and obtain the corresponding image URI. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^diagnoses | array<object> |  | Product diagnosis and optimization information. |
| ^^diagnosis_results | array<object> |  | The results of diagnosing the specified field. |
| ^^^code | string |  | A machine-readable code that represents an identified issue. Refer to [Listing quality diagnosis](https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd) for the full list of identified issues and the corresponding recommendations. |
| ^^^how_to_solve | string |  | The recommendation for resolving the identified issue, returned in the default locale language of the shop. Refer to [Listing quality diagnosis]((https://partner.tiktokshop.com/docv2/page/66eb8f5c6f2da702e96a49dd)) for the full list of recommendations. |
| ^^^quality_tier | string |  | The listing quality tier you can reach by implementing the recommendation. Possible values: - FAIR - GOOD **Note**: - To reach a higher tier, you must implement all recommendations from the destination tier and all preceding tiers. For example, a product will reach the "GOOD" tier once all "FAIR" and "GOOD" recommendations are addressed or implemented. - Available only for the US market. |
| ^^field | string |  | The product field being diagnosed. Possible values: - TITLE: Product title - DESCRIPTION: Product description - IMAGE: Product image displayed in the image gallery - ATTRIBUTE: Product attribute - SIZE_CHART: Product size chart |
| ^^suggestion | object |  | Optimization suggestions that are auto-generated by the system to improve the effectiveness of the specified field. **Note**: This will not be returned if the value for `optimization_fields` is blank or `NONE`. |
| ^^^images | array<object> |  | The optimized main image. Only the first image in the main image set will be optimized. |
| ^^^^height | integer |  | The image height after optimization. |
| ^^^^optimized_uri | string |  | The URI of the image after optimization. |
| ^^^^optimized_url | string |  | The URL of the image after optimization. |
| ^^^^uri | string |  | The original URI of the image. |
| ^^^^url | string |  | The original URL of the image. |
| ^^^^width | integer |  | The image width after optimization. |
| ^^^seo_words | array<object> |  | The SEO keyword suggestions if `diagnoses.field` is "TITLE". |
| ^^^^text | string |  | The suggested SEO keyword text. |
| ^^^smart_texts | array<object> |  | The intelligent text suggestions for titles and descriptions. |
| ^^^^text | string |  | The suggested intelligent text. |
| ^listing_quality | object |  | Product listing quality information. |
| ^^current_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **NOTE**: Available only for the US market. |
| ^^remaining_recommendations | integer |  | The remaining number of recommendations (see `diagnosis_results`) that must be implemented for the product to advance to the highest tier. **Note**: - To advance to the highest tier, you must implement all recommendations listed in `diagnosis_results`. - Available only for the US market. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateAttributeRecommendationRequest

Submit product information from an external ecommerce platform to initiate the process for identifying suitable product attributes in TikTok Shop. Use this API when syncing your product catalog from an external OMS system into TTS.
After submitting the product information, attribute recommendation generation will occur asynchronously. You can obtain the final recommended product attributes through the [Product attribute recommendation generated] webhook.

**Path:** `/product/202501/attribute_recommendation_request`
**Method:** `POST`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/create-attribute-recommendation-request-202501

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
| external_product | object |  | External product information, obtained from an existing product in an external ecommerce platform. |
| ^description | string |  | The product description. Max length: 10,000 |
| ^external_product_id | string |  | An external product identifier used in the external ecommerce platform. Max length: 999 |
| ^images | array<object> |  | A list of images that are displayed in the product image gallery. Max: 9 |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22) with `use_case=MAIN_IMAGE`. |
| ^is_existing_product | boolean |  | A flag indicating whether the product is an existing product or a newly created product in the external platform (e.g. Shopify). - true: It is an existing product - false: It is a new product Default: false |
| ^other_product_data | string |  | A serialized string containing additional or extended product information (e.g. metafields) on the external platform not covered by standard fields. Max length: 20,000 |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. Max count: 300 |
| ^^sales_attributes | array<object> |  | A list of attributes (e.g. size, color, length) that define each variant of a product. Max count: 3 |
| ^^^name | string |  | The sales attribute name. Max length: 20 |
| ^^^sku_images | array<object> |  | A list of images to display for the SKU. Max count: 9 |
| ^^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^^value | string |  | The sales attribute value. Max length: 50 |
| ^title | string |  | The product title. Max length: 300 |
| ^tts_category_id | string |  | The category of the product in TikTok Shop. Use the [Recommend Category](6509bae1f1fd3102b91379d4) API to get recommended category based on your product information. |
| ^vendor_name | string |  | The vendor name of the product in the external ecommerce platform. This will be used as the manufacturer name in TikTok Shop. Max length: 255 |
| ^version | string |  | A unique identifier representing the current state of the product information. For example, this can be a Unix timestamp in milliseconds. This value should change whenever the product data is updated, allowing the system to distinguish different updates to the same product over time. Max length: 13 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchManufacturers

Retrieve a list of manufacturers in the EU languages supported by TikTok Shop based on their IDs or keyword.
When creating a product, pass the returned `manufacturer_id` to associate the product with the manufacturer.
Target seller: Local sellers operating in EU countries

**Path:** `/product/202501/compliance/manufacturers/search`
**Method:** `POST`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/search-manufacturers-202501

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Filter results to show those that contain this keyword. Search scope: name, registered trade name, local_number, email Max length: 200 characters **Note**: Provide either the `manufacturer_ids` or `keyword`; if both are provided, `manufacturer_ids` will take priority. |
| locales | array<string> |  | The BCP-47 locale codes for displaying the manufacturer information. Default: The locale of the seller's registered business address. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| manufacturer_ids | array<string> |  | Filter results by these manufacturer IDs. Max IDs: The value of `page_size` |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^manufacturers | array<object> |  | The list of manufacturers that meet the query conditions. |
| ^^id | string |  | The manufacturer ID in TikTok Shop. |
| ^^regional_profiles | array<object> |  | A list of contact details for the manufacturer, presented in different languages for each supported EU country. |
| ^^^address | string |  | The postal address of the manufacturer. Max length: 500 characters |
| ^^^email | string |  | The email address of the manufacturer. |
| ^^^locale | string |  | The BCP-47 locale code representing the language used for specifying the manufacturer information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| ^^^name | string |  | The manufacturer name. Max length: 255 characters |
| ^^^phone_number | object |  | The phone number of the manufacturer. |
| ^^^^availability | string |  | Indicates the availability of the phone number. Possible values: - `AVAILABLE`: The phone number is available and required. - `UNAVAILABLE`: No phone number is available. |
| ^^^^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Max digits: 4 Required if `availability=AVAILABLE`. |
| ^^^^local_number | string |  | The local number. Length: 7 - 20 digits Required if `availability=AVAILABLE`. |
| ^^^registered_trade_name | string |  | The registered trade name of the manufacturer. Max length: 200 characters |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of manufacturers that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchResponsiblePersons

Retrieve a list of responsible persons in the EU languages supported by TikTok Shop based on their ID or keywords.
When creating a product, pass the returned `responsible_person_id` to associate the product with the responsible person.
Target seller: Local sellers operating in EU countries

**Path:** `/product/202501/compliance/responsible_persons/search`
**Method:** `POST`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/search-responsible-persons-202501

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| keyword | string |  | Filter results to show those that contain this keyword. Search scope: name, local_number, email Max length: 200 characters **Note**: Provide either the `responsible_person_ids` or `keyword`; if both are provided, `responsible_person_ids` will take priority. |
| locales | array<string> |  | The BCP-47 locale codes for displaying the responsible person information. Default: The locale of the seller's registered business address. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| responsible_person_ids | array<string> |  | Filter results by these responsible person IDs. Max IDs: The value of `page_size` |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^responsible_persons | array<object> |  | The list of responsible persons that meet the query conditions. |
| ^^id | string |  | The responsible person ID in TikTok Shop. |
| ^^regional_profiles | array<object> |  | A list of contact details for the responsible person, presented in different languages for each supported EU country. |
| ^^^address | object |  | The residential address of the responsible person. |
| ^^^^city | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the city name.) The city name. Max length: 500 characters |
| ^^^^country | string |  | The two letter ISO 3166 country code representing the country of the address. It must be an EU country. |
| ^^^^district | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the district name.) The district name. Max length: 500 characters |
| ^^^^postal_code | string |  | The postal code. Max length: 500 characters |
| ^^^^province | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the province name.) The province, state, or region name. Max length: 500 characters |
| ^^^^street_address_line1 | string |  | The detailed street address of the location, including the building number, street name, district, city, province, and any relevant details. Max length: 500 characters |
| ^^^^street_address_line2 | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `street_address_line1` instead for the relevant details.) An optional secondary line for additional address details, if necessary. Max length: 500 characters |
| ^^^email | string |  | The email address of the responsible person. |
| ^^^locale | string |  | The BCP-47 locale code representing the language used for specifying the responsible person information. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| ^^^name | string |  | The responsible person name. Max length: 200 characters |
| ^^^phone_number | object |  | The phone number of the responsible person. |
| ^^^^country_code | string |  | The country code of the phone number, prefixed by a plus `+` symbol. E.g. +353 for Ireland. Only EU country codes are allowed. Max digits: 4 |
| ^^^^local_number | string |  | The local number. Length: 7 - 11 digits |
| ^total_count | integer |  | The number of responsible persons that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchProducts

Retrieve a list of products that meet the specified conditions. 
This API will only return the key product properties. You can pass a returned product ID to the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda) to obtain more details about the product.

**Path:** `/product/202502/products/search`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/search-products-202502

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-100] |
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
| audit_status | array<string> |  | Filter products by their audit status for TikTok Shop. Possible values: - AUDITING: Returns products where the base version or a post-live edit is currently being audited. - FAILED: Returns products where the base version or a post-live edit has failed audit, or had the audit cancelled. - APPROVED: Returns products that passed the audit and has been listed on the platform. |
| category_version | string |  | Filter products by the category tree version. Possible values based on region: - US: `v2`, represents the 7-level category tree. - Other regions: `v1`, represents the 3-level category tree. Default: Return all products from both `v1` and `v2` category trees. |
| create_time_ge | integer |  | Filter products to show only those that are created on or after the specified date and time. Unix timestamp. **Note**: `create_time_ge` and `create_time_le` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_le` is empty, `create_time_le` will default to the current time. - If `create_time_le` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_le | integer |  | Filter products to show only those that are created on or before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |
| listing_platforms | array<string> |  | Filter products by the listing platforms. Possible values: - TOKOPEDIA - TIKTOK_SHOP Default: Return all products regardless of their listing platform. Applicable only for sellers that migrated from Tokopedia. **Note**: - You must also specify a `status` value other than `ALL` when filtering by listing platforms. Returning all statuses is not supported. - If you pass in one platform, the search will return products that are listed on that platform, including those that are listed on both platforms. - If you pass in `["TIKTOK_SHOP", "TOKOPEDIA"]`, only products listed on both platforms will be returned, not those listed on just one. |
| listing_quality_tiers | array<string> |  | Filter products by their listing quality tier. Possible values: - POOR - FAIR - GOOD Default: Returns all **Note**: Available only for the US market. |
| return_draft_version | boolean |  | Filter products to show only those that have a draft. - true: Returns products in their draft version only. Excludes those without a draft. - false: Returns all products regardless of whether they have a draft. Default: false **Note**: Applicable only if the product status filter is `ALL`, `DRAFT`, `ACTIVATE`, `SELLER_DEACTIVATED`, or `PLATFORM_DEACTIVATED`. |
| seller_skus | array<string> |  | Filter products by these seller SKU codes. |
| sku_ids | array<string> |  | Filter products by SKU IDs. Max count: 10 |
| sns_filter | string |  | Filter products by their Subscribe and Save (SNS) status. Possible values: - CONFIGURED - ELIGIBLE |
| status | string |  | Filter products based on the product's base version. In other words, this filter does not apply to post-live drafts or edits. For example, `status=DRAFT` returns only unpublished products in the DRAFT state, not live products with an active draft. Possible values: - ALL - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED Default: ALL |
| update_time_ge | integer |  | Filter products to show only those that are updated on or after the specified date and time. Unix timestamp. **Note**: `update_time_ge` and `update_time_le` together define the update time filter condition. - If `update_time_ge` is filled but `update_time_le` is empty, `update_time_le` will default to the current time. - If `update_time_le` is filled but `update_time_ge` is empty, `update_time_ge` will default to the earliest shop time. |
| update_time_le | integer |  | Filter products to show only those that are updated on or before the specified date and time. Unix timestamp. Refer to notes in `update_time_ge` for more usage information. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^products | array<object> |  | The list of products that meet the query conditions. |
| ^^audit | object |  | Product audit information for TikTok Shop. |
| ^^^pre_approved_reasons | array<string> |  | The reason why the product is pre-approved. Applicable only if `audit.status=PRE_APPROVED`, otherwise returns an empty array. Possible values: - KYC_PENDING: The seller's onboarding (KYC - Know Your Customer information) is incomplete or awaiting processing. - RESTRICTED_CATEGORY_PENDING: The product is in a restricted category, and category approval is still pending. To request access, submit an application through the Qualification Center on TikTok Shop Seller Center. Applicable only for the US market. |
| ^^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit as it is still in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - FAILED: The product failed the audit, or the audit was cancelled. - PRE_APPROVED: The product has passed the audit but is not yet listed due to pending prerequisites. - APPROVED: The product passed the audit and has been listed on the platform. |
| ^^create_time | integer |  | The time when the product is created. Unix timestamp. |
| ^^has_draft | boolean |  | A flag to indicate if the product has a draft. - true: It has a draft. - false: It does not have a draft. Use Get Product with `return_draft_version=true` to obtain full details of the draft. |
| ^^id | string |  | The product ID generated by TikTok Shop. |
| ^^integrated_platform_statuses | array<object> |  | The current status of the product on platforms that are natively integrated with TikTok Shop (e.g. TOKOPEDIA). **Note**: For Indonesia sellers, if you did not set the listing platform as `TOKOPEDIA` when creating or editing a product, this will be omitted. |
| ^^^platform | string |  | The integrated platform name. Possible values: - TOKOPEDIA |
| ^^^status | string |  | The product status in the integrated platform. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED |
| ^^is_not_for_sale | boolean |  | A flag indicating whether the product is not for sale. True: Not for sale. False: For sale. |
| ^^listing_quality_tier | string |  | The current quality tier of this product listing. The quality tier of a product listing depends on the quality of the content in its product fields such as the title, image, attributes etc. Possible values: - POOR - FAIR - GOOD **Note**: Available only for the US market. |
| ^^product_families | array<object> |  | The **live** product family that this product belongs to. A product family is a virtual group of products that share common characteristics (such as flavor, version, or size), allowing them to appear as selectable variations on the product page. **Note**: - Applicable only for US local sellers. - Omitted if this product does not belong to any product family. |
| ^^^id | string |  | The product family ID. |
| ^^^products | array<object> |  | A list of products that belong to the family. |
| ^^^^id | string |  | The product ID. |
| ^^product_sync_fail_reasons | array<string> |  | The reasons why synchronizing of global product information to local products failed. Only applicable for cross-border sellers. |
| ^^recommended_categories | array<object> |  | Recommended categories for the product based on the product title, description, and images. |
| ^^^id | string |  | The ID of the recommended category. |
| ^^^local_name | string |  | The name of the category in the country where the shop operates. |
| ^^sales_regions | array<string> |  | The regions where the product is sold. Possible values: - BR: Brazil - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MX: Mexico - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^^amount | string |  | The price amount. |
| ^^^^currency | string |  | The currency. Possible values: USD |
| ^^^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^^^inventory | array<object> |  | SKU inventory information. **Note**: This field is not supported in post-live drafts, therefore the values here will always reflect those in the base version, even if you set `return_draft_version=true`. |
| ^^^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve details of the warehouse from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^^^list_price | object |  | The SKU's list price information that has been verified to be legitimate by the audit team. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: - This field will be empty or display the last verified price if the submitted price fails verification. - This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^^^amount | string |  | The price amount. |
| ^^^^currency | string |  | The currency. Possible values: USD |
| ^^^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. If this is not returned, it indicates that the product is a regular non-presale item. |
| ^^^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. |
| ^^^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a release date. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a duration. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a duration. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a duration. |
| ^^^price | object |  | SKU pricing information. |
| ^^^^currency | string |  | The currency. Possible values: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. |
| ^^^^tax_exclusive_price | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. **Note**: Tax-exclusive pricing does not apply to the JP market, therefore this value is the same as `sale_price`. |
| ^^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^^^status_info | object |  | Status information of the SKU. |
| ^^^^deactivation_source | string |  | The deactivation source of the SKU with `DEACTIVATED` status. Possible values: - SELLER: Indicates that the seller deactivated the SKU - PLATFORM: Indicates that the platform de-activated the SKU due to violation reasons - COMBO_RELATION: Indicates that the platform de-activated the combined-SKU due to the deactivation of sub-SKU. |
| ^^^^status | string |  | The SKU status in TikTok Shop. Possible values: - NORMAL - DEACTIVATED |
| ^^status | string |  | The product status in TikTok Shop. Possible values: - DRAFT - PENDING - FAILED - ACTIVATE - SELLER_DEACTIVATED - PLATFORM_DEACTIVATED - FREEZE - DELETED **Note**: For Indonesia sellers, if you did not set the listing platform as `TIKTOK_SHOP` when creating or editing a product, this will be omitted. |
| ^^title | string |  | The product title. |
| ^^update_time | integer |  | The time when the product is last updated. Unix timestamp. |
| ^total_count | integer |  | The total number of products that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EnableStrikethroughPrices

Enable the display of list price as strikethrough price on your product page. 
To build trust with customers, all list prices must be verified before they can be displayed as strikethrough prices. Use this API to submit pricing information from external ecommerce platforms to TikTok Shop for verification of the list price provided during product creation or editing. If verified to be legitimate, the list price will be displayed as the strikethrough price on the product page whenever applicable (e.g., when a discount is applied).
**Note**: The submitted pricing information will expire 90 days after the submission date. You will need to resubmit new information if you want to keep displaying the strikethrough price.

**Path:** `/product/202502/products/{product_id}/strikethrough_prices/enable`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/enable-strikethrough-prices-202502

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

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
| external_product_id | string |  | An external product identifier used on an external ecommerce platform. This must match the `external_product_id` used when creating the product. Retrieve it from [Get Product](6509d85b4a0bb702c057fdda). Max length: 999 characters |
| skus | array<object> |  | The list of SKUs for which you want to submit external pricing information for verification. |
| ^external_retail_price | object |  | The SKU retail price information on an external ecommerce platform. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency used. Possible values: USD |
| ^external_sku_id | string |  | An external SKU identifier used on an external ecommerce platform. This must match the `external_sku_id` used when creating the product. Retrieve it from [Get Product](6509d85b4a0bb702c057fdda). Max length: 999 characters |
| ^external_transaction_price | object |  | The actual highest transaction price recorded for the SKU in the past 90 days on an external ecommerce platform. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: The value must be equal to or greater than the list price specified during product creation or editing. |
| ^^currency | string |  | The currency used. Possible values: USD |
| ^^image | object |  | An image to prove the authenticity of the highest transaction price. This can be a screenshot of the order or invoice that contains the highest transaction price. Please ensure any customer information is masked. |
| ^^^uri | string |  | The URI of the image. Use the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) to upload the image as a `CERTIFICATION_IMAGE` and obtain the corresponding URI. |
| ^^transaction_time | integer |  | The time at which the highest transaction price was recorded in the past 90 days. Unix timestamp. |
| ^id | string |  | The SKU ID generated by TikTok Shop. **Note**: If you are updating multiple SKUs, all the SKU IDs must belong to the same product. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | string |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^sku_id | string |  | The TikTok Shop SKU ID where the error occurred. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## BindLocalProducts

Manually bind a [global product](65854fa5a46cdd02bcbd0a18) to [local products](65854ffb8f559302d8a6acda) in different EU countries. Use this API if you already have existing local products in different countries and would like to manage them centrally through a global product.
**Note**: 
- You can only bind a global product to one product per EU country.
- Once binding is completed, you will not be able to change or remove the binding, therefore please exercise caution during binding.
- The values of the following fields must be the same in both the global product and local product for binding to be successful: Category, Brand, Product images, SKU details, Number of SKUs, Dimensions, Weight, Seller SKU, GTIN, Size chart, Unit price, Video, Warehouse setup, Sale mode.
Target seller: Sellers operating in multiple EU countries

**Path:** `/product/202503/global_products/{global_product_id}/bind_local_products`
**Method:** `POST`
**Version:** 202503
**Docs:** https://partner.tiktokshop.com/docv2/page/bind-local-products-202503

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | The global product ID. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| local_products | array<object> |  | The list of local products that you want to bind to the global product. Max count: Equivalent to the number of EU countries supported by TikTok Shop **Note**: You can only bind a global product to one local product per EU country. |
| ^id | string |  | The local product ID in TikTok Shop. Retrieve this ID from [Search Products](65854ffb8f559302d8a6acda). **Note**: Ensure you provide the correct IDs as the binding can't be changed or removed. |
| ^inventory_add_type | string |  | The inventory value calculation method in the SHARED inventory model - ADD  calculate the sum of the inventory values of the shared inventory as the total inventory value - SET use inventory value as the total inventory value |
| ^inventory_mode | string |  | The inventory mode you want to setup - SHARED  all skus in the request will share the inventory count - EXCLUSIVE all skus in the request will has exclusive inventory count |
| ^skus | array<object> |  | The list of sku mappings between the global and local products. **Note**: You must include and map all existing SKUs of the product, otherwise binding will fail. |
| ^^global_sku_id | string |  | The global SKU ID in TikTok Shop. Retrieve this ID from [Search Global Products](65854fa5a46cdd02bcbd0a18). |
| ^^id | string |  | The local SKU ID in TikTok Shop. Retrieve this ID from [Search Products](65854ffb8f559302d8a6acda). |
| ^^inventory | array<object> |  | SKU inventory information. |
| ^^^quantity | integer |  | The total SKU quantity available in the warehouse. |
| ^^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. |
| ^^sales_attributes | array<object> |  | The mappings of sales attributes between global and local SKUs. **Note**: You must include and map all existing attributes of the product, otherwise binding will fail. |
| ^^^global_id | string |  | The global sales attribute ID. Retrieve this ID from [Get Global Product](6509e2b0bace3e02b7490c96). |
| ^^^global_value_id | string |  | The global sales attribute value ID. Retrieve this ID from [Get Global Product](6509e2b0bace3e02b7490c96). |
| ^^^id | string |  | The local sales attribute ID. Retrieve this ID from [Get Product](6509d85b4a0bb702c057fdda). |
| ^^^value_id | string |  | The local sales attribute value ID. Retrieve this ID from [Get Product](6509d85b4a0bb702c057fdda) |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^bind_results | array<object> |  | The binding result for each requested local product. |
| ^^fail_reasons | array<object> |  | The list of errors that occurred. |
| ^^^code | integer |  | A machine-readable code that represents the failure reason. This is equivalent to the error codes shown when binding local product to global product |
| ^^^message | string |  | The error messages. |
| ^^local_product_id | string |  | The local product ID in TikTok Shop. |
| ^^region | string |  | The market where the local product is listed. Possible values: - DE: Germany - ES: Spain - FR: France - IE: Ireland - IT: Italy |
| ^^status | string |  | The status of binding the global product to the local product. Possible values: - SUCCESS: The global product was successfully bound to the local product. To double check, refer to `products` in [Get Global Product](6509e2b0bace3e02b7490c96). - FAILED: The binding of the global product to the local product was unsuccessful. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateImageTranslationTasks

Initiates a translation task for one or more images. This asynchronous API queues the images for processing in the specified target language. 
Applicable only for sellers that sell across EU.
Use the [Image Translation Completed webhook](684f8d9bcc4e44049347a12e) to monitor the translation progress, or pass the task ID to the [Get Image Translation Tasks API](684f8b2d535a9d048f234564) to retrieve the status and the translated images.
**Note**: 
- Please wait 5 minutes after task creation before calling the Get endpoint, and retry at intervals over 10 seconds to avoid rate limiting.
- Each task corresponds to the translation of 1 image into 1 target language.
- You can create up to 20 tasks per call and 500 tasks per day. Any tasks beyond the daily limit will be rejected.

**Path:** `/product/202505/images/translation_tasks`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/create-image-translation-tasks-202505

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
| images | array<object> |  | The list of images to translate. Use the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) to upload the images first and obtain the corresponding image URIs. **Note**: The total number of image and target language combinations must not exceed 20. For example, you can submit 10 images with 2 target languages each, but you can't submit 10 images with 5 target languages each. |
| ^image_uri | string |  | The URI of the image, retrieved from the [Upload Product Image API](https://partner.tiktokshop.com/docv2/page/6509df95defece02be598a22) **Recommendation**: Specify up to 5 images to avoid exceeding the task limit per call. |
| ^target_languages | array<string> |  | The target languages to translate the image into. You can specify multiple target languages for each image. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT **Recommendation**: Specify up to 4 languages to avoid exceeding the task limit per call. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^translation_tasks | array<object> |  | The list of translation tasks created for the requested images. Each task corresponds to the translation of 1 image into 1 target language. So if you specified 2 target languages for an image, 2 tasks will be created. |
| ^^id | string |  | The ID to identify the image translation task. Pass this ID to the [Get Image Translation Tasks API](684f8b2d535a9d048f234564) to retrieve the task status and the translated image URIs. |
| ^^image_uri | string |  | The URI of the image to translate. |
| ^^target_language | string |  | The target languages to translate the image into. You can specify multiple target languages for each image. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCombinedListingRecommendations

Retrieve the list of combined listing recommendations for products in a shop. 
Use this to explore potential groupings of similar products that can be combined into a listing based on shared attributes like style, color, or flavor.

**Path:** `/product/202506/combined_listing_recommendations/search`
**Method:** `POST`
**Version:** 202506
**Docs:** https://partner.tiktokshop.com/docv2/page/search-combined-listing-recommendations-202506

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The number of results to be returned per page. Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | Filter the results to show only those that are recommended for these product IDs. Max count: 20 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^combined_listing_recommendations | array<object> |  | The list of combined listing recommendations that meet the query conditions. |
| ^^option_name | string |  | The suggested option name. It reflects the shared attribute (e.g. color, flavor, size) used to logically group the products into a combined listing. |
| ^^products | array<object> |  | A list of products recommended for inclusion in this package. Each product represents a value for the suggested option. |
| ^^^id | string |  | The product ID in TikTok Shop. |
| ^^^option_value | string |  | The suggested option value that the product represents (e.g. "Red" for the "Color" option). |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of items that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadExternalProduct

Upload product information from an external ecommerce platform to analyze listing data and generate insights for TikTok Shop, such as the recommended product groupings.

**Path:** `/product/202506/external_products`
**Method:** `POST`
**Version:** 202506
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-external-product-202506

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
| external_product | object |  | External product information, obtained from an existing product in an external ecommerce platform. |
| ^create_time | integer |  | The time when the product is created. Unix timestamp (seconds). |
| ^description | string |  | The product description. Max length: 10,000 |
| ^external_category_name | string |  | The category of the product in the external ecommerce platform. Max length: 100 |
| ^external_product_id | string |  | An external product identifier used in the external ecommerce platform. Max length: 999 |
| ^external_shop_id | string |  | The shop ID on the external ecommerce platform. Max length: 999 |
| ^first_image | object |  | The first image that is displayed in the product image gallery. |
| ^^url | string |  | The external image URL. |
| ^images | array<object> |  | A list of images that are displayed in the product image gallery. Max count: 25 |
| ^^url | string |  | The external image URL. |
| ^publish_time | integer |  | The time when the product is published. Unix timestamp (seconds). |
| ^region | string |  | The region where the product is sold. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. Max count: 300 |
| ^^create_time | integer |  | The time when the SKU is created. Unix timestamp (seconds). |
| ^^external_list_price | string |  | The original price of the SKU on the external ecommerce platform (e.g. compare_at_price in Shopify), with up to 2 decimal places. Valid range: [0.01, 7600] |
| ^^external_sku_id | string |  | The SKU ID. |
| ^^image | object |  | An image to display for the SKU. |
| ^^^url | string |  | The external image URL. |
| ^^inventory_quantity | integer |  | SKU stock information. Valid range: [1, 99,999] |
| ^^price | string |  | SKU pricing information. |
| ^^selected_options | array<object> |  | A list of name-value pairs that define the specific configuration of this product variant (e.g. color, size) |
| ^^^name | string |  | The option name. Max length: 50 |
| ^^^value | string |  | The option value. Max length: 50 |
| ^^status | string |  | The SKU status. |
| ^^taxable | boolean |  | A flag to indicate whether the SKU is subject to sales tax. |
| ^^title | string |  | The SKU title. |
| ^^update_time | integer |  | The time when the SKU is updated. Unix timestamp (seconds). |
| ^^weight | object |  | SKU weight information. |
| ^^^unit | string |  | The unit for the SKU weight. Possible values: |
| ^^^value | string |  | The SKU weight, which must be a positive number with up to X decimal places. |
| ^status | string |  | The product status. Default: ALL Possible values: - ALL - DRAFT - ACTIVE - ARCHIVED - SUSPENDED - PENDING_SUSPENSION |
| ^title | string |  | The product title. Max length: 300 |
| ^update_time | integer |  | The time when the product is updated. Unix timestamp (seconds). |
| ^vendor_name | string |  | The vendor name. This information is equivalent to the manufacturer name in TikTok Shop. Max length: 255 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetImageTranslationTasks

Retrieves the image translation task status and translated images for one or more previously submitted images.
**Note**: Please wait 5 minutes after [task creation](684f8b2d6e0b37048b2448b4) before calling this API, and retry at intervals over 10 seconds to avoid rate limiting.
Applicable only for sellers that sell across EU.

**Path:** `/product/202506/images/translation_tasks`
**Method:** `GET`
**Version:** 202506
**Docs:** https://partner.tiktokshop.com/docv2/page/get-image-translation-tasks-202506

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| translation_task_ids | array<string> |  | The image translation task IDs for retrieving translation results. Max count: 20 |
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
| ^translation_tasks | array<object> |  | The requested translation tasks and the corresponding results. Each task corresponds to the translation of 1 image into 1 target language. |
| ^^fail_reason | string |  | The reason why the translation task failed. Possible values: - Invalid image URI. - Internal processing error, please try calling this endpoint again. - This image can't be translated. Try a different image. |
| ^^id | string |  | The ID to identify the image translation task. |
| ^^original_image | object |  | The original image to be translated. |
| ^^^uri | string |  | The URI of the original image. |
| ^^^url | string |  | The URL of the original image. |
| ^^status | string |  | The translation result. Possible values: - PROCESSING: Translation is underway and has not yet completed. - COMPLETED: Translation has completed and results are ready. - FAILED: Translation did not complete due to an error. |
| ^^target_language | string |  | The target language to translate the image into. Possible values: - de-DE - en-IE - es-ES - fr-FR - it-IT |
| ^^translated_image | object |  | The translated image. |
| ^^^uri | string |  | The URI of the translated image. |
| ^^^url | string |  | The URL of the translated image. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalListingRules

Retrieves the global listing rules for a local shop that belongs to a global seller. E.g. The supported listing methods or the inventory allocation rules. The rules differ by the markets they serve.
**Note**: Applicable only for global sellers.

**Path:** `/product/202507/global_listing_rules`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-listing-rules-202507

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
| ^inventory_rules | array<object> |  | A list of inventory allocation rules for all warehouses linked to the shop. |
| ^^allocation_mode | string |  | The inventory allocation mode used for this warehouse in the local market. `SHARED` – Inventory is pooled across all covered markets. An inventory deduction in one market reflects across all. `DYNAMIC` – Inventory is divided proportionally among covered markets. An inventory deduction in one market affects only that market. `MANUAL` – Inventory is configured independently by sellers for each market. An inventory deduction in one market affects only that market. |
| ^^associated_warehouses | array<object> |  | The list of markets where inventory from this warehouse is shared or dynamically allocated. **Note**: Applicable only for `SHARED` and `DYNAMIC` management modes. |
| ^^^region | string |  | The country where the warehouse is located. |
| ^^^warehouse_id | string |  | The associated warehouse ID. |
| ^^local_warehouse_id | string |  | The warehouse ID associated with the shop. |
| ^listing_methods | array<string> |  | The methods at which sellers can list products in this shop. Possible values: - GLOBAL_PUBLISHING: Create a global product, then publish it to target local markets. - LOCAL_REPLICATION: Create local product, then replicate it to other target local markets. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ReplicateProduct

Description of [POST]/product/:version/Replicate_Product

**Path:** `/product/202507/products/{product_id}/global_replicate`
**Method:** `POST`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/replicate-product-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

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
| replicate_target | array<object> |  | Target markets for replicating the local product. |
| ^region | string |  | The new market where you want to replicate the product. |
| ^skus | array<object> |  | The SKUs to be published in the specified market. - Max SKUs for EU, JP, UK, US: 300 - Max SKUs for other regions: 100 Note: SKUs of all source country must be included. |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. This field is only required if the inventory allocation mode for the warehouse is MANUAL. Otherwise, it is optional. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 999,999] |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](650aa418defece02be6e66b6) or Get Inventory Rules API. |
| ^^price | object |  | The SKU's **local display price** shown on the product page before any discounts. |
| ^^^currency | string |  | The currency. You must specify the local currency in the target market. |
| ^^^sale_price | string |  | The SKU's local display price shown on the product page before any discounts. Refer to Product Pricing for the allowed price ranges in each market. |
| ^^source_sku_id | string |  | The ID of the SKU being replicated |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^region | string |  | The target region where the error occurred. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalReplicatedProducts

Retrieves the globally associated replicas in other markets if the product has been replicated through local replication.
Applicable only for global sellers.

**Path:** `/product/202507/products/{product_id}/replicated_products`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-replicated-products-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The ID of the product. |

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
| ^replicated_products | array<object> |  | The globally associated replicas in other markets if the product has been replicated through local replication. |
| ^^product_id | string |  | The ID of the product. |
| ^^product_status | string |  | The status of the product. |
| ^^region | string |  | The market where the product is listed. |
| ^^shop_id | string |  | The TikTok Shop ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ImportExternalProductInfo

Use this API to import external product(shopfy/amazon)raw data and directly connect to ISV

**Path:** `/product/202508/import_external`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/import-external-product-info-202508

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | An external product data file, each with a corresponding product raw information and id. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^import_result | object |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| ^^code | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| ^^message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditGlobalProduct

Description of [POST]/product/:version/Partial_Edit_Global_Product

**Path:** `/product/202509/global_products/{global_product_id}/partial_edit`
**Method:** `PUT`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-global-product-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| global_product_id | string | Y | The global product ID generated by TikTok Shop. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_id | string |  | The ID of the brand of this product. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. - It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. - It must be a main category (`categories.permission_statuses=AVAILABLE` in [Get Global Categories API](650a03f8f1fd3102b91b338a)). **Note**: Refer to TikTok Shop Academy for information on product category restrictions. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US: `v2`, represents the 7-level category tree. **Important**: If the seller account contains an active US shop, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_global_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer | object |  | (**Deprecated**: This field is deprecated and will be removed in a future API version. Use `manufacturer_ids` instead.) The product manufacturer's details. |
| ^address | string |  | The address of the manufacturer. |
| ^email | string |  | The email address of the manufacturer. |
| ^name | string |  | The name of the manufacturer. |
| ^phone_number | string |  | The phone number of the manufacturer, prefixed by a plus `+` symbol. There must be a space or hyphen between the country code and the local phone number. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies may lead to additional shipping fees. |
| ^height | string |  | The package height. A positive whole number. |
| ^length | string |  | The package length. A positive whole number. |
| ^unit | string |  | The unit for the package dimensions. Only `CENTIMETER` is supported. |
| ^width | string |  | The package width. A positive whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that the measurements are accurate. Any discrepancies may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Only `KILOGRAM` is supported. |
| ^value | string |  | The package weight, which must be a positive number with up to 3 decimal places. |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Global Attributes API](650a0483c16ffe02b8dfc80a). |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). |
| ^values | array<object> |  | A list of selectable values for the product attribute. Max count: 300 for US; 100 for other regions. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom product attribute value ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters - Supports only alphabets and numbers. |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). Default: The IDs provided when the global product was created. **Note**: Applicable only for the EU market in certain categories. Use the [Get Global Category Rules API](650a056df1fd3102b91b5b8e) to check the requirements. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Global Category Rules API](https://partner.tiktokshop.com/docv2/page/650a056df1fd3102b91b5b8e) to check the requirements. - If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for EU, JP, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^global_quantity | integer |  | The total SKU inventory quantity across all shops globally. The inventory for each local shop is automatically calculated when a product is first published. After publishing, this global quantity cannot be manually changed. You can only modify the inventory quantity in each local shop. |
| ^id | string |  | The global SKU ID in TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information per warehouse. If multi-warehouse is enabled in Seller Center, you must provide the inventory details for each warehouse. Max count: 50 **Note**: `global_quantity` will not take effect if inventory details are provided for each warehouse. |
| ^^global_warehouse_id | string |  | The ID of the global warehouse where the SKU is stored. Retrieve the list of global warehouses available for the seller from the [Get Global Seller Warehouse API](https://partner.tiktokshop.com/docv2/page/650aa3f0defece02be6e5ffb). |
| ^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 99,999] |
| ^price | object |  | The SKU's **global uniform pre-tax** price that serves as the baseline for calculating the local prices across different markets. **Note**: - Upon publishing, this price will be automatically converted to the local pre-tax price and local display price based on market-specific exchange rates and applicable charges such as shipping costs, taxes, and other fees. - The auto-conversion will exclude JP and US shops using China warehouses. For these shops, please use `sale_prices` instead. |
| ^^amount | string |  | The price amount. Max: 99,999,999.99 |
| ^^currency | string |  | The currency. Possible values: - `USD`: Applicable for global sellers - `EUR`: Applicable for intra-EU sellers |
| ^sale_prices | array<object> |  | The SKU's **local display price** shown on the product page before any discounts. **Note**: -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^^amount | string |  | The price amount. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^region | string |  | The market where you want to sync the sale price. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom attribute ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^name | string |  | A self-defined custom sales attribute name if the built-in attributes do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | An image to display for the SKU. You can attach images to only 1 type of sales attribute, and you must attach an image for each value of the chosen attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the Color sales attribute or the Size sales attribute. If you choose to attach images for Color, you must attach 2 images, one for each color. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a) or a custom sales attribute value ID returned after calling [Create Global Product API(https://partner.tiktokshop.com/docv2/page/6509de61bace3e02b7489cba). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after listing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. - Supports only alphabets and numbers. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Global Attributes API](https://partner.tiktokshop.com/docv2/page/650a0483c16ffe02b8dfc80a). The unit price would then be returned in the [Get Global Product API](https://partner.tiktokshop.com/docv2/page/6509e2b0bace3e02b7490c96). |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - MX:[1,300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^global_skus | array<object> |  | A list of global Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_global_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the global SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^id | string |  | The global SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^publish_results | array<object> |  | Results of syncing the changes in the edited product to markets where it is published. |
| ^^fail_reasons | array<object> |  | The list of errors that occurred. |
| ^^^message | string |  | The error message. |
| ^^region | string |  | The market where the product is published Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MX: Mexico - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^^status | string |  | The status of syncing the product to the market. Possible values: - SUCCESS: The global product was successfully synchronized to the local shop, submitted for listing, and is now under review. - FAILED: Synchronization of the global product to the local shop was unsuccessful. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## EditProduct

Edit all properties (e.g. description, brand, images) of an existing product that is not in the `FREEZE` or `DELETED` state.
After editing the product, the latest product content (referred to as v2) will be resent for audit review. If the audit passes, v2 is published to the shop, otherwise, the existing product stays live and remains unchanged (keeping v1). However, edits to the `price` or `inventory` fields do not require a reaudit and will be immediately published on the platform. Use the [Product status change](https://partner.tiktokshop.com/docv2/page/650956aff1fd3102b90b6261) webhook to keep track of the review status.
**Note**: 
- This API is applicable only for **active sellers/shops** that have completed the KYC onboarding process.
- There may be a limit to the number of products you can relist per day. We recommend prioritizing key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- All inputs, including blanks, in the request payload will overwrite existing values. To retain an existing value, make sure to include it in your request. Exceptions to this rule are the `price` and `inventory` fields, which will remain unchanged if they are omitted from the request. Therefore, **it is strongly recommended to retrieve the latest product data using [Get Product](6509d85b4a0bb702c057fdda) and submit the complete data when editing**. This ensures accuracy and helps avoid errors or unintentional data loss due to missing fields.
- If you wish to edit only certain properties, you can use the [Partial Edit Product API](650a98d74a0bb702c06c3289), [Update Inventory API](6503068fc20ad60284b38858), or the [Update Price API](650307de5a12ff0294eac8b0).
- The language used in the product content must align with the target market's language (e.g. don't use Chinese), otherwise the listing will fail or be rejected.
**For global sellers**:
If you're using the local replication listing method, note the following sync rules:
- To sync any changes to other markets, please provide the `seller_sku` and complete `replicated_products` data. 
- Note that **category changes** and **sales attribute changes** (in sales attribute id/name) must be synced to other markets. The API call will fail if you don't provide these details.
**For Tokopedia sellers**:
Note that a product can have **only one active version** across all platforms at any time. If a product is live on both platforms, audit results for the latest version are handled as follows:
- **Mixed audit results**: If the product passes audit on one platform but fails on another, on the successful platform, the product will stay live and be updated with content from the latest version (v2), while on the failed platform, the product will be deactivated and hidden entirely.
- **Audit failure on all platforms**: If the product fails audit on all platforms, the existing product stays live and remains unchanged (keeping v1).

**Path:** `/product/202509/products/{product_id}`
**Method:** `PUT`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/edit-product-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID generated by TikTok Shop. |

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| category_id | string |  | The ID of the category of this product. It must be a leaf category that corresponds to the category tree type specified in the `category_version` property. Use the [Get Categories API](https://partner.tiktokshop.com/docv2/page/6509c89d0fcef602bf1acd9b) to obtain the available categories. **Note**: - Refer to TikTok Shop Academy for information on product category restrictions. - For the US market, if you change a product's category to an `INVITE_ONLY` category, you must submit a separate application through the Qualification Center on TikTok Shop Seller Center to gain access. Otherwise, even if the product audit is passed, the product will not be listed and made available to buyers. (The product status will be `PENDING` and the audit status will be `PRE_APPROVED`) - For the Indonesia market, to list a product on both TikTok Shop and Tokopedia, you must use only categories that are available on both platforms. |
| category_version | string |  | The category tree version to assign this product to. Possible values based on region: - US and SEA regions: `v2`, represents the 7-level category tree. **Important**: For US and SEA shops, you must pass `v2` when using this API. - Other regions: `v1`, represents the 3-level category tree. Default: `v1` |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| delivery_option_ids | array<string> |  | This field is returned for seller accounts in the following regions only: - ID - MX - MY - PH - SG - TH - VN For all other regions, this field is NOT used and will NOT be processed if passed for create, edit, or partial edit operations. The custom delivery option IDs to apply to this product if you want to override the default warehouse delivery options. To retrieve the available option IDs, call [Get Warehouse Delivery Options](https://partner.tiktokshop.com/docv2/page/650aa46ebace3e02b75d9afa) with `scope=PRODUCT`. **Note**: - Leave this field blank to inherit the default delivery options configured for the warehouse. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| is_pre_owned | boolean |  | A flag to indicate if the product is pre-owned. Applicable only if TOKOPEDIA is the sole listing platform. **Note**: To list pre-owned products on the TikTok Shop platform, please specify the ID of one of the designated pre-owned product categories (e.g. pre-owned luxury bags, luggage, and accessories) in `category_id`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. **IMPORTANT**: This field controls the product's visibility on the listing platforms. - If the product is live on both platforms but the request contains only 1 platform, the product will be deactivated and hidden from the omitted platform. - If the product is live on 1 platform but the request contains a different platform, the product will be deactivated and hidden from the omitted platform. - If you omit this array, the product will be sent for audit on the currently active platforms or on the platforms specified in the previous request. - If you want to deactivate the product on both platforms, use the Deactivate Product API. |
| main_images | array<object> |  | A list of images to display in the product image gallery. - Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| minimum_order_quantity | integer |  | The minimum order quantity for the product. Valid range: [1, 20] Applicable only for the Indonesia market and selected sellers in other SEA markets. Contact your account manager for more information about gaining access to this field. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom product attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom product attribute value if the built-in values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters |
| replicated_products | array<object> |  | The list of local market replicas to which updates should be synced. As this is a full edit endpoint, all fields will be synced. Note that **category changes** and **sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` above and complete the details in this object. The API call will fail if you don't provide these details. |
| ^region | string |  | The market where you want to sync the changes to. The market must already contain a replica. Use the Get Global Replicated Products to check the markets that contain a replica. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^skus | array<object> |  | The SKUs to be synced to the specified market. **Note**: - You must pass in all existing SKUs. Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and provide the seller_sku. |
| ^^id | string |  | The SKU ID generated by TikTok Shop. Provide this for existing SKUs. |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 999,999] |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](650aa418defece02be6e66b6) or Get Inventory Rules API. |
| ^^price | object |  | The SKU's **local display price** shown on the product page before any discounts. |
| ^^^currency | string |  | The currency. You must specify the local currency in the target market. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japanese - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^sale_price | string |  | The SKU's local display price shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^seller_sku | string |  | The seller_sku value of the source product above. Provide this for new SKUs. - Valid length: 1-50 characters - Format: Text without spaces |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| save_mode | string |  | Indicates how the product should be saved. Possible values: - AS_DRAFT: Save the product as a draft for future editing. - LISTING: Immediately list the product in the shop. Default: LISTING **Note**: - Saving as draft is not supported in the following cases: - The product status is `DELETED`. - The product status is `PENDING` or `FREEZE` on any listing platform. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, `inventory` and `delivery_option_ids` fields are not supported and will not be saved. |
| shipping_insurance_requirement | string |  | The shipping insurance purchase requirement imposed on buyers for the product. Possible values: - REQUIRED: Shipping insurance is mandatory and buyers can't opt out. - OPTIONAL: Buyers can choose to purchase shipping insurance through the platform. - NOT_SUPPORTED: Shipping insurance is not supported for the product. Default: OPTIONAL Applicable only if the listing platforms include TOKOPEDIA. |
| shipping_template_id | string |  | Identifier of the shipping template that will be bound to the product |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, MX, JP, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^combined_skus | array<object> |  | If this SKU belongs to a virtual bundle, this object contains the list of individual SKUs that form the bundle (e.g. gift basket, starter pack). |
| ^^product_id | string |  | The ID of the source product included in the virtual bundle. |
| ^^sku_count | integer |  | The quantity of the source SKU included in the virtual bundle. |
| ^^sku_id | string |  | The ID of the source SKU included in the virtual bundle. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected local sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. **Note**: - If you omit this object array in the API request, the existing information will remain unchanged. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| ^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for US local sellers. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **General usage rules**: - Omit this object to retain the current presale settings. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. **ALL** - `NONE`: To convert the product to a regular (non-presale) product. |
| ^price | object |  | SKU pricing information. **Note**: If you omit this object in the API request, the existing information will remain unchanged. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Global sellers** The SKU's **local pre-tax price**. This excludes any applicable charges such as cross-border shipping costs, taxes, and other fees, and therefore does not appear on the product page. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. - **Note**: Not applicable for JP and US shops using China warehouses, please use `price.sale_price` instead. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable only for global sellers. -  Required for JP and US shops using China warehouses, optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom attribute ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom sales attribute name if the existing attributes do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom sales attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| subscribe_info_edit | object |  | All the editable Save and Subscribe promotion info associated with the given product. |
| ^discount_details | array<object> |  | All of the Save and Subscribe discount details. |
| ^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^discount_value | integer |  | The value of the discount. A value of 10, would indicate a 10% discount. |
| ^subscribe_status | string |  | An enum outlining whether the given product has an active Subscribe and Save promotion: - ENABLED - NOT_ENABLED This field is required if the subscription is being created or modified. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^audit | object |  | Product audit information. **Note**: Applicable only to products listed on TikTok Shop. Not applicable for products listed only on Tokopedia. |
| ^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - APPROVED: If you only edited the `price` or `inventory` fields of an approved product, the product remains approved and the new information is immediately published on the platform. |
| ^product_id | string |  | The product ID generated by TikTok Shop. |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| ^warnings | array<object> |  | Warning information that the API caller needs to pay special attention to. |
| ^^message | string |  | A warning message for any critical problems/blockers. Please respond in a timely manner. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PartialEditProduct

Edit some properties (e.g. description, images, attributes) of a product that is not in the `FREEZE` or `DELETED` state.
After editing the product, the latest product content (referred to as v2) will be resent for audit review. If the audit passes, v2 is published to the shop, otherwise, the existing product stays live and remains unchanged (keeping v1). However, edits to the `price` or `inventory` fields do not require a reaudit and will be immediately published on the platform. Use the [Product status change](650956aff1fd3102b90b6261) webhook to keep track of the review status.
**Note**: 
- This API is applicable for all sellers.
- There may be a limit to the number of products you can relist per day. We recommend prioritizing key products first to ensure they get published. You can find your listing limit on the Seller Center homepage.
- If a draft or audit-review version exists, unedited fields will retain their values over those of the base (live) version.
- **Updates are handled per top-level property**, so all non-empty fields within an updated object must be supplied to prevent overwriting with blanks. For top-level properties (e.g. `description`, `brand_id`) that are not nested in an object, you can update them individually. Omitting these properties in the request will leave them unchanged. If you need to edit any nested property within an object, you must provide values for all nested properties of that object. Any omitted nested properties will be overwritten with blanks.
- If new mandatory product attributes were added by TikTok Shop after the creation of your product, ensure that you provide these attributes too.
**For global sellers**:
If you're using the local replication listing method, note the following sync rules:
**Sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` and complete `replicated_products` data. The API call will fail if you don't provide these details.
**New SKUs* (new sales attribute value id/name) are optional to sync to other markets. To sync, please provide the `seller_sku` and complete `replicated_products` data.
**General changes** are optional to sync to other markets. To sync, you only need to provide `replicated_products.region`.
**For Tokopedia sellers**:
Note that a product can have **only one active version** across all platforms at any time. If a product is live on both platforms, audit results for the latest version are handled as follows:
- **Mixed audit results**: If the product passes audit on one platform but fails on another, on the successful platform, the product will stay live and be updated with content from the latest version (v2), while on the failed platform, the product will be deactivated and hidden entirely.
- **Audit failure on all platforms**: If the product fails audit on all platforms, the existing product stays live and remains unchanged (keeping v1).

**Path:** `/product/202509/products/{product_id}/partial_edit`
**Method:** `POST`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/partial-edit-product-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID in TikTok Shop. |

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
| brand_id | string |  | The ID of the brand of this product. Use the [Get Brands API](https://partner.tiktokshop.com/docv2/page/6503075656e2bb0289dd5d01) to get the list of available brands for a shop. **Note**: Unauthorized brands won't be displayed on TikTok Shop. |
| certifications | array<object> |  | The list of certifications for your product. Max count: 10 As per TikTok Shop guidelines, certifications are required for certain restricted product categories. Retrieve the certification requirements for your product from the  [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). Refer to [TikTok Shop Restricted Products Policy](https://seller-us.tiktok.com/university/essay?identity=1&role=1&knowledge_id=3238037484275457&from=policy) for information on product category restrictions. |
| ^expiration_date | integer |  | The expiration date of this certification expressed in unix timestamp (seconds) UTC+0. This field may be required for certain certifications. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to find out the requirements. |
| ^files | array<object> |  | A list of certification related files. |
| ^^format | string |  | The format of the certification file. Only PDF is supported. |
| ^^id | string |  | The ID of the certification file. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the files first and obtain the corresponding file ID. |
| ^^name | string |  | The name of the certification file, including the file extension. |
| ^id | string |  | The ID to identify the type of certification required for the product category. Retrieve this value from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^images | array<object> |  | A list of certification related images. |
| ^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=CERTIFICATION_IMAGE`. |
| description | string |  | The product description in HTML format. **Note**: - The content must conform to the [HTML syntax](https://html.spec.whatwg.org/). All HTML tags are accepted but to optimize display on the TikTok Shop product detail page, the system will automatically convert certain tags into alternative formats, such as rendering `<table>` tags as images. - Max length: 10,000 characters. - Image guidelines: You must use [TikTok Shop image URLs](6509df95defece02be598a22). Max 30 `<img>` tags, each under 4000px with `src`, `width`, and `height` attributes. **Recommendations**: - If you are syncing a pre-existing description from another platform, include the full HTML source description here. - Provide a detailed description, ideally over 300 characters. - Include 3-5 key selling points, each under 250 characters, with supporting images. - Use 1600x1600 px for the image dimensions. |
| external_product_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the product between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| is_cod_allowed | boolean |  | A flag indicating whether to show the Cash On Delivery (COD) payment option during checkout. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check if COD is supported for your product category. Applicable only for the following markets: - Global sellers: MY, PH, SA, TH, VN - Local sellers: ID, MY, PH, SA, TH, VN **Note**: If COD is not supported, the listing will fail if you set this to `true`. |
| listing_platforms | array<string> |  | The platforms for listing the product. Possible values: - TOKOPEDIA - TIKTOK_SHOP Applicable only for sellers that migrated from Tokopedia. **IMPORTANT**: This field controls the product's visibility on the listing platforms. - If the product is live on both platforms but the request contains only 1 platform, the product will be deactivated and hidden from the omitted platform. - If the product is live on 1 platform but the request contains a different platform, the product will be deactivated and hidden from the omitted platform. - If you want to deactivate the product on both platforms, use the Deactivate Product API. |
| main_images | array<object> |  | A list of images to display in the product image gallery. -  Max count: 9 - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Image dimensions: [300x300 px, 4000x4000 px] **Recommendations**: - Use a minimum of 5 images. - The first image should have a white background. Use the [Optimize Images API](https://partner.tiktokshop.com/docv2/page/665692b35d39dc02deb49a97) to change the background to white. |
| ^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=MAIN_IMAGE`. You can use the returned URI directly, or process it through the [Optimize Images API](665692b35d39dc02deb49a97) first and use the resulting URI. |
| manufacturer_ids | array<string> |  | A comma-delimited list of manufacturer IDs. Retrieve the IDs from the [Search Manufacturers API](67066a580dcee902fa03ccf9). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| package_dimensions | object |  | The dimensions of the product package. **Note**: - Provide the dimensions measured after packing the product. - These values impact the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - Optional for ID, TH, VN regions. |
| ^height | string |  | The package height. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^length | string |  | The package length. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| ^unit | string |  | The unit for the package dimensions. Possible values based on region: - US: CENTIMETER, INCH - Other regions: CENTIMETER **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using KILOGRAM for the weight, you must use CENTIMETER for the dimensions. |
| ^width | string |  | The package width. A positive whole number. **Note**: For the BR market, decimal values using `.` or `,` as separators are also accepted but will be rounded to the nearest whole number. |
| package_weight | object |  | The weight of the product package. **Note**: - Provide the weight measured after packing the product. - This value impacts the shipping cost, so it is important to ensure that dimensions are accurate. Any discrepancies in measurements may lead to additional shipping fees. - The package weight will take precedence over package dimensions in fee calculation if the fee based on weight is higher. |
| ^unit | string |  | The unit for the package weight. Possible values based on region: - US: `KILOGRAM`, `POUND` - BR, JP, MX: `KILOGRAM`, `GRAM` - Other countries: `KILOGRAM` **Note**: You must use the same system of measurement (metric system or imperial system) for `package_weight` and `package_dimensions`. In other words, if you are using `KILOGRAM` for the weight, you must use `CENTIMETER` for the dimensions. |
| ^value | string |  | The package weight, which must be a positive number. The number format varies based on the `unit`: - `GRAM`: integer - `KILOGRAM`: up to 3 decimal places - `POUND`: up to 2 decimal places |
| product_attributes | array<object> |  | A list of general attributes (e.g. manufacturer, country of origin, materials used) that describe the product as a whole, regardless of variant. **Important**: The attributes available for use are determined by the system based on the product's assigned category, with some being mandatory. You must provide the product attributes marked as `is_required` in the response of the [Get Attributes API](6509c5784a0bb702c0561cc8) to avoid listing failure. |
| ^id | string |  | The ID of the product attribute, retrieved from the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). |
| ^values | array<object> |  | A list of selectable values for the product attribute. **Note**: Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. |
| ^^id | string |  | The ID of the product attribute value. This is either a built-in product attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom product attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom product attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 2000 characters. |
| replicated_products | array<object> |  | The list of local market replicas to which updates should be synced. As this is a partial edit endpoint, only updated fields will be synced. **Compulsory sync** - **Sales attribute changes** (in sales attribute id/name) must be synced to other markets. Therefore, you must provide the `seller_sku` above and complete the details in this object. The API call will fail if you don't provide these details. **Optional sync** - **New SKUs* (new sales attribute value id/name) are optional to sync to other markets. To sync, please provide the `seller_sku` above and complete the details in this object. - **General changes** are optional to sync to other markets. To sync, you only need to provide `replicated_products.region`. |
| ^region | string |  | The market where you want to sync the changes to. The market must already contain a replica. Use the Get Global Replicated Products to check the markets that contain a replica. Possible values: - DE: Germany - ES: Spain - FR: France - GB: United Kingdom - ID: Indonesia - IE: Ireland - IT: Italy - JP: Japan - MY: Malaysia - PH: Philippines - SG: Singapore - TH: Thailand - US: United States - VN: Vietnam |
| ^skus | array<object> |  | The SKUs to be synced to the specified market. Specify this **only if** you are adding SKUs or changing the sales attribute id/name. **Note**: - You must pass in all existing SKUs. Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and provide the seller_sku. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^^id | string |  | The SKU ID generated by TikTok Shop. Provide this for existing SKUs |
| ^^inventory | array<object> |  | SKU inventory information per warehouse. |
| ^^^quantity | integer |  | The SKU quantity available in the warehouse. Valid range: [1, 999,999] |
| ^^^warehouse_id | string |  | The warehouse ID. Retrieve this value from the [Get Warehouse List API](650aa418defece02be6e66b6) or Get Inventory Rules API. |
| ^^price | object |  | The SKU's **local display price** shown on the product page before any discounts |
| ^^^currency | string |  | The currency. You must specify the local currency in the target market. Possible values: - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japanese - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^^sale_price | string |  | The SKU's local display price shown on the product page before any discounts. Refer to Product Pricing for the allowed price ranges in each market. |
| ^^seller_sku | string |  | The seller_sku value of the source product above. - Valid length: 1-50 characters - Format: Text without spaces |
| responsible_person_ids | array<string> |  | A comma-delimited list of responsible person IDs. Retrieve the IDs from the [Search Responsible Persons API](67066a55f17b7d02f95d2fb1). **Note**: Applicable only for the EU market in certain categories. Use the [Get Category Rules API](6509c0febace3e02b74594a9) to check the requirements. |
| save_mode | string |  | Indicates how the product should be saved. Possible values: - AS_DRAFT: Save the product as a draft for future editing. - LISTING: Immediately list the product in the shop. Default: LISTING **Note**: - Saving as draft is not supported in the following cases: - The product status is `DELETED`. - The product status is `PENDING` or `FREEZE` on any listing platform. - If you are saving a post-live draft with `save_mode=AS_DRAFT`, `inventory` and `delivery_option_ids` fields are **not supported** and will not be saved. |
| size_chart | object |  | The measurement details of the product to help buyers find the right size. **Note**: - For certain product categories, size charts may be required or not supported. Use the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9) to check the requirements. -  If size charts are not supported, even if you provide a size chart here, the size chart will not be saved. - Provide either a TikTok Shop size chart template ID or a size chart image; if both are provided, the ID takes priority. |
| ^image | object |  | An image of the size chart. **Recommendations**: - Resolution: Minimum 1024px on the shorter side - Content: Include key measurement dimensions (e.g., bust, waist, hips, inseam), the more the better. - Format: Use a table with distinct columns and row. - Use only one table per product and image. - Display each dimension in a separate row. - Display units in column headers. |
| ^^uri | string |  | The URI of the size chart image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=SIZE_CHART_IMAGE`. |
| ^template | object |  | A TikTok Shop size chart template generated by the size chart tool in Seller Center > Manage Products > Bulk action > Batch manage size charts. |
| ^^id | string |  | The size chart template ID. |
| skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. **Note**: - Max SKUs for BR, EU, JP, MX, UK, US: 300 - Max SKUs for other regions: 100 **Recommendations**: Place the most important variant at the beginning of the array. |
| ^external_list_prices | array<object> |  | The SKU list price (e.g. MSRP, RRP) or original price information on external ecommerce platforms. Applicable only for selected sellers in the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] |
| ^^currency | string |  | The currency. Possible values: USD |
| ^^source | string |  | The external ecommerce platform from which the price is sourced. Possible values: - SHOPIFY_COMPARE_AT_PRICE: The compare_at_price in Shopify. |
| ^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. Max length: 999 characters |
| ^external_urls | array<string> |  | A comma-delimited list of URLs for third-party product listing pages where consumers can place orders. Add this property if you have products listed on third-party sites other than TikTok Shop and would like to map them. Max string length: 500 |
| ^extra_identifier_codes | array<string> |  | If the SKU belongs to a virtual bundle (containing multiple individual SKUs), you can add up to 10 additional identifier codes here for the SKUs included in the bundle. **Format**: GTIN: 14 digits EAN: 8, 13, or 14 digits UPC: 12 digits ISBN: 13 digits, or 9 digits ending in capital `X` **Note**: - Applicable only for the EU market. - The identifier code must be unique for each SKU, with no repetition allowed. |
| ^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^type | string |  | The type of fee. Possible values: PFAND |
| ^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. **Note**: - To edit an existing SKU, include its SKU ID. - Any existing SKU IDs not listed here will result in the deletion of those SKUs. For example, if this product contains 5 SKUs and you only provide 2 SKU IDs, the remaining 3 will be deleted. - To create new SKUs, leave the SKU ID blank and complete the other fields. |
| ^identifier_code | object |  | A regulated identifier code assigned to a product based on international standardized regulations (e.g. GTIN) to ensure the product is universally identifiable across various platforms and systems. **Note**: Editable only if the product is in DRAFT state. Otherwise, changes are not allowed. |
| ^^code | string |  | The identifier code. **Format**: - GTIN: 14 digits - EAN: 8, 13, or 14 digits - UPC: 12 digits - ISBN: 13 digits, or 9 digits ending in capital `X` - JAN: 8 or 13 digits **Note**: The identifier code must be unique for each SKU, with no repetition allowed. |
| ^^type | string |  | The type of identifier code. Possible values: - GTIN - EAN - UPC - ISBN - JAN |
| ^inventory | array<object> |  | SKU inventory information. **Note**: If you are saving a post-live draft with `save_mode=AS_DRAFT`, this field is not supported and will not be saved. When using Get Product to retrieve the draft, the values will reflect those in the base version. |
| ^^backorder_quantity | integer |  | The `backorder_quantity` will automatically be converted to `quantity` once in-stock inventory is sold out. The fulfillment of this inventory follows the `handling_time` specified below. Note: Made-to-order (MTO), pre-order, and custom products cannot be backordered, and thus are incompatible with backorder_quantity. |
| ^^handling_time | integer |  | The estimated number of working days needed for a backorder to be shipped. Currently, different warehouses for the same SKU are not allowed to have different `handling_time` |
| ^^quantity | integer |  | The total SKU quantity available in the warehouse. Valid range: [1, 99,999] Note: This quantity specifically refers to the in-stock inventory that can be shipped immediately. |
| ^^warehouse_id | string |  | The ID of the warehouse where the SKU is stored. Retrieve the list of warehouses available for your shop from the [Get Warehouse List API](https://partner.tiktokshop.com/docv2/page/650aa418defece02be6e66b6). |
| ^list_price | object |  | The SKU's list price information. This is equivalent to the manufacturer's suggested retail price (MSRP), or the recommended retail price (RRP). Applicable only for the US market. **Note**: This value may appear as the strikethrough price on the product page. However, whether the strikethrough price is shown and the amount shown are subject to the audit team's review and decision based on various pricing information. |
| ^^amount | string |  | The price amount. Valid range: [0.01, 7600] **Note**: - The value must be equal to or greater than `skus.price.amount`. Otherwise, it will be discarded. - If the value is verified to be legitimate by the audit team, it will be stored and returned in the [Get Product API](6509d85b4a0bb702c057fdda). |
| ^^currency | string |  | The currency. Possible values: USD |
| ^pre_sale | object |  | SKU presale information, used to tag a product as a presale product based on its presale type. Applicable only if `allowed_special_product_types` from [Get Category Rules](6509c0febace3e02b74594a9) is not empty. **Rules for the US market**: - Regular / Preorder product: Once the product goes live, you cannot change the product type. - Made-to-order product: You can change it to a regular product at any time. |
| ^^fulfillment_type | object |  | Information about the type of pre-sale order fulfillment and the corresponding timeframe. - `handling_duration_days` is for fulfillment with an extended duration. - `release_date` is for starting fulfillment on a fixed date. **Note**: Provide either the `handling_duration_days` or the `release_date`, depending on the value of `pre_sale.type` and your shop's region. |
| ^^^handling_duration_days | integer |  | The desired duration for handling a pre-sale order and handing it over to a shipping carrier. Applicable only for the following regions and pre-sale type: **US** - `MADE_TO_ORDER`: Business days, from 3 to 14 days. - `CUSTOM`: Business days, from 3 to 30 days. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: Calendar days, from 3 to 30 days. |
| ^^^release_date | integer |  | The date on which the product gets converted into a regular product and becomes available for general purchase. On this date, order handling will also start, changing the status of the order to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only for `PRE_ORDER` in the US. **Note**: - Valid range: The date must fall within 3 - 60 days from the current date. - This date is a unix timestamp (seconds) based on the seller-selected timezone in Seller Center. - This date cannot be modified once the product goes live. |
| ^^type | string |  | The type of pre-sale. Possible values based on the region: **US** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **release date**. - `MADE_TO_ORDER`: The product is produced only after the order is received. Fulfillment can be extended by specifying a **duration**. - `CUSTOM`: The product requires a fulfillment timeline that exceeds the standard due to other factors. Fulfillment can be extended by specifying a **duration**. **UK, EU, SEA, JP, and LATAM** - `PRE_ORDER`: The product is not yet available or released. Fulfillment can be extended by specifying a **duration**. |
| ^price | object |  | SKU pricing information. |
| ^^amount | string |  | **Local sellers/Intra-EU sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. |
| ^^currency | string |  | The currency. Possible values based on the region: - BRL: Brazil - EUR: France, Germany, Ireland, Italy, Spain - GBP: United Kingdom - IDR: Indonesia - JPY: Japan - MXN: Mexico - MYR: Malaysia - PHP: Philippines - SGD: Singapore - THB: Thailand - USD: United States - VND: Vietnam |
| ^^sale_price | string |  | **Global sellers** The SKU's **local display price** shown on the product page before any discounts. Refer to [Product Pricing](https://partner.tiktokshop.com/docv2/page/67e1288d76cfee049d9af858) for the allowed price ranges in each market. **Note**: - Applicable for all global sellers. - Required for JP and US shops using China warehouses. Optional for others. - This is the definitive final price shown on the product page, all other prices will be ignored. |
| ^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. **Note**: - You must retain at least 1 sales attribute, deleting all existing sales attributes is not allowed. - You can only have up to 3 types of sales attributes per product. - Each SKU must include the same number and type of sales attributes. For example, you cannot have one SKU that has only a Color attribute, while another SKU has both Color and Size attributes. - Provide either a built-in ID or a custom name; if both are provided, the ID takes priority. - The `id/name` and `value_id/value_name` pairs must be unique in each SKU. For example, you cannot repeat `"name": "Color"`, `"value_name": "Red"` in different SKUs. |
| ^^id | string |  | The ID of the sales attribute. This is either a built-in sales attribute ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom attribute ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^name | string |  | A self-defined custom sales attribute name if the existing attributes do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - Do not include sensitive characters. - Max length: 20 characters |
| ^^sku_img | object |  | The default/main image for each value (e.g. red) of the primary sales attribute (e.g. color). This appears in the product options gallery on TikTok Shop. You can attach images to only 1 type of sales attribute, which will serve as the primary attribute for display. An image must be provided for each value of the primary attribute. For example, if a product has 2 colors and 3 sizes, you can choose to attach images for either the color sales attribute or the size sales attribute. If you choose to attach images for color, you must attach 2 images, one for each color. If you want to add more images, use `supplementary_sku_images`. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^supplementary_sku_images | array<object> |  | A list of supplementary images for each value (e.g. red) of the primary sales attribute (e.g. color) to provide multiple views or details of the product for that attribute value. These appear in the product options gallery on TikTok Shop. **Note**: - Max number of image URIs: 8. - Arrange your image URIs in the sequence that they should appear on TikTok Shop. - Applicable only for the US market. |
| ^^^uri | string |  | The URI of the image. Obtain this URI by uploading the images through the [Upload Product Image API](6509df95defece02be598a22)  with `use_case=ATTRIBUTE_IMAGE`. |
| ^^value_id | string |  | The ID of the sales attribute value. This is either a built-in sales attribute value ID from [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8) or a custom sales attribute value ID returned after calling [Create Product API](https://partner.tiktokshop.com/docv2/page/6502fc8da57708028b42b18a). |
| ^^value_name | string |  | A self-defined custom sales attribute value if the existing values do not satisfy your needs. The system will auto-generate an ID after editing. **Note**: - No duplicates allowed under the same attribute. - Max length: 50 characters. |
| ^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. - Valid length: 1-50 characters - Format: Text without spaces |
| ^sku_unit_count | string |  | The total quantity/volume of the product represented by the SKU. For example, if the SKU represents 500ml of water, this value would be 500 if the unit type is defined as ml. Valid range: [0.01, 99,999.9999] Applicable only for the EU market. **Note**: - This is mainly used to calculate the unit price of the SKU, and is required only if you wish to display the unit price to facilitate easier price comparisons across different products and packaging sizes. - Unit price = Selling price/(SKU unit count/base unit count). Therefore if you want to obtain the unit price, you would also need to define the "base unit count" and the "unit type" product attributes. Retrieve the relevant information for these product attributes by using the [Get Attributes API](https://partner.tiktokshop.com/docv2/page/6509c5784a0bb702c0561cc8). The unit price would then be returned in the [Get Product API](https://partner.tiktokshop.com/docv2/page/6509d85b4a0bb702c057fdda). |
| subscribe_info_edit | object |  | All of the Save and Subscribe discount details. |
| ^discount_details | array<object> |  | All of the Save and Subscribe discount details. |
| ^^discount_level | string |  | An enum that communicated the type of discount: - REGULAR - FIRST_ORDER - RETENTION |
| ^^discount_value | integer |  | The value of the discount. A value of 10, would indicate a 10% discount |
| ^subscribe_status | string |  | An enum outlining whether the given product has an active Subscribe and Save promotion: - ENABLED - NOT_ENABLED This field is required if the subscription is being created or modified. |
| title | string |  | The product title. Title length: - DE, ES, FR, IE, IT, JP, UK, US: [1, 255] - BR, MX: [1, 300] - Other regions: [25, 255] |
| video | object |  | A product introduction or promotion video to display for your product. **Recommendations**: - Aspect ratio: 1:1 - Resolution: HD 720p or higher - Duration: 20 - 60 seconds |
| ^id | string |  | The ID of the product video. Use the [Upload Product File API](https://partner.tiktokshop.com/docv2/page/6509dffdc16ffe02b8dc10c5) to upload the video first and obtain the corresponding file ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^audit | object |  | Product audit information. **Note**: Applicable only to products listed on TikTok Shop. Not applicable for products listed only on Tokopedia. |
| ^^status | string |  | The product audit status. Possible values: - NONE: The product is not applicable for audit because it has not been submitted for listing on this platform, or it is in a draft, frozen, or deactivated state. - AUDITING: The product is currently being audited. - APPROVED: If you only edited the `price` or `inventory` fields of an approved product, the product remains approved and the edits are immediately published on the platform. |
| ^product_id | string |  | The product ID generated by TikTok Shop. |
| ^skus | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^external_sku_id | string |  | An external identifier used in an external ecommerce platform. This is used to associate the SKU between TikTok Shop and the external ecommerce platform. |
| ^^fees | array<object> |  | The fees required for this product based on TikTok Shop policies. Fees are required only for certain product categories, retrieve the requirements from the [Get Category Rules API](https://partner.tiktokshop.com/docv2/page/6509c0febace3e02b74594a9). |
| ^^^additional_attribute | string |  | An optional attribute that provides additional context for the fee. The accepted values may vary by fee type and market. Possible values for Pfand: - SINGLE_USE - REUSABLE - NOT_APPLICABLE |
| ^^^amount | string |  | The fee amount. Valid range: - PFAND: [0.00 - 6300.00] |
| ^^^type | string |  | The type of fee. Possible values: PFAND |
| ^^id | string |  | The SKU ID generated by TikTok Shop. One product can contain multiple SKU IDs. |
| ^^sales_attributes | array<object> |  | A list of attributes  (e.g. size, color, length) that define each variant of a product. |
| ^^^id | string |  | The sales attribute ID. If you included the custom sales attribute name in the request, this is a newly generated ID. |
| ^^^value_id | string |  | The sales attribute value ID. If you included the custom sales attribute value name in the request, this is a newly generated ID. |
| ^^seller_sku | string |  | An internal code/name for managing SKUs, not visible to buyers. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ProductAuditingResearch

Description of [POST]/product/:version/product_auditing_research

**Path:** `/product/202601/compliance/auditing/research`
**Method:** `POST`
**Version:** 202601
**Docs:** https://partner.tiktokshop.com/docv2/page/product-auditing-research-202601

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | returned by the current page, and for the first page, it is an empty string. |
| page_size | integer | Y | max is 20 |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| brand_ids | array<string> |  | brand id |
| category_ids | array<string> |  | leaf category id |
| product_ids | array<string> |  | max is 20 |
| product_title | string |  | product title |
| seller_id | string |  | shop id |
| seller_name | string |  | shop name |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | Obtain the transmission parameters for the next page data |
| ^products | array<object> |  | product information |
| ^^brand_id | string |  | brand id |
| ^^brand_name | string |  | brand name |
| ^^categories | array<object> |  | The category tree information of the source product included in the virtual bundle. |
| ^^^id | string |  | category id |
| ^^^is_leaf | boolean |  | is leaf category |
| ^^^level | integer |  | category level |
| ^^^name | string |  | category name |
| ^^^parent_id | string |  | parent category id |
| ^^country | string |  | sale region eg. DE, IT, FR, ES, IE |
| ^^description | string |  | The product description in HTML format. |
| ^^id | string |  | The product ID generated by TikTok Shop. |
| ^^listing_url | string |  | PDP URL |
| ^^main_image_urls | array<string> |  | The URLs to view the images. |
| ^^seller_id | string |  | shop id |
| ^^seller_name | string |  | shop name |
| ^^title | string |  | The product title. |
| ^^variants | array<object> |  | A list of Stock Keeping Units (SKUs) used to identify distinct variants of the product. |
| ^^^id | string |  | The SKU ID generated by TikTok Shop. |
| ^total_count | integer |  | total product count |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
