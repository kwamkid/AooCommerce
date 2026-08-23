# TikTok Shop API — promotion

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 9 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202406

---

## CreateActivity

Use this API to create a product discount activity or a flash deal activity. You cannot create a coupon activity with this API. To do that, you'll need to go to the seller center or the seller app. To update the products or SKUs included in the activity, use [Update Activity Product](https://partner.tiktokshop.com/docv2/page/650d32c42aaa3602b86ccb5c).

**Path:** `/promotion/202309/activities`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-activity-202309

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
| activity_type | string |  | The type of activities. Possible enumerations: - `FIXED_PRICE`: product discount activity with fixed price. - `DIRECT_DISCOUNT`: product discount activities with percentage off. - `FLASHSALE`: flash sale activity. - `SHIPPING_DISCOUNT`: shipping fee discount. - `BUY_MORE_SAVE_MORE`: Buy more save more discount. |
| begin_time | integer |  | Activity start time. UNIX timestamp. The value must be greater than the value of the current time. |
| discount | object |  | Discount information. |
| ^bmsm_discount | object |  | Configurations related to Buy More Save More (BMSM) promotions |
| ^^details | array<object> |  | Configurations regarding BMSM promotions. A maximum of two `tier`s are permitted. `details.threshold_type` and `details.discount_type` must be the same across all `tier`s. |
| ^^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^threshold_value | string |  | The purchase threshold of the discount, based on the `threshold_type`, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` and `discount_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`20` and `discount_value`== `15`, `tier`==2 must have `threshold_value` > `20` and `discount_value`>`15`. |
| ^^^type | string |  | The type of discount awarded as a benefit. The value of the discount is determined by `value`. Possible enumerations are: ​- `PERCENTAGE_OFF`​: Buyer will receive X% off the price of the eligible products. - `AMOUNT_OFF`: Buyer will receive X units of local currency off the price of eligible products. |
| ^^^value | string |  | Value of the discount. - When `type`==`PERCENTAGE_OFF`, the buyer will receive X% off the price of eligible products. If the value represents a percentage, it should be an integer. - `type`==`AMOUNT_OFF`, the buyer will receive X units of local currency off the price of eligible products. If the value represents a monetary amount, it should be limited to two decimal places. |
| ^gift_discount | object |  | Configurations related to Gift With Purchase (GWP) promotions. Only needs to be configured for GWP promotions. |
| ^^gift_infos | array<object> |  | Configurations regarding Gift With Purchase (GWP) promotions. A maximum of two `tier`s are permitted in SEA and UK. Only one `tier` is permitted in US. And `threshold_type` must be the same across all `tier`s. |
| ^^^gift_details | array<object> |  | Gift configurations related to Gift With Purchase (GWP) promotions. |
| ^^^^product_id | string |  | TikTok Shop product id of gift. |
| ^^^^sku_id | string |  | TikTok Shop sku id of gift. |
| ^^^^total_claim_limit | string |  | The quantity limit of the gift sku which is involved in the activity. The range is [1, 99999].  If you are updating the value of an existing sku, the value cannot be decreased. |
| ^^^threshold_type | string |  | The purchase threshold type of discount. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^threshold_value | string |  | The purchase threshold value of the gift, based on the `threshold_type`. Determined by user. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`2`, `tier`==2 must have `threshold_value` > `2`. |
| ^^gift_receiving_type | string |  | The receiving type of gift. Currently only supports one type: `ALL_RECEIVE` -`ALL_RECEIVE`: All gifts configured in the promotion can be collected. |
| ^shipping_discount | object |  | Shipping Discount |
| ^^area_scope | object |  | The (buyer's) geographical areas to which the promotion activity applies. |
| ^^^specific_areas | array<string> |  | The list of areas for which the promotion activity applies. The valid values that may be included in this list are dependent on the region of the shop. The list of valid values for each shop region are available here: [link](https://partner.tiktokshop.com/docv2/page/67e3b059e7dc4f04a4ff9e09) |
| ^^^type | string |  | The (buyer's) geographical area to which the promotion activity applies. ​- `WHOLE`: Promotion activity applies to all areas to which the seller offers fulfillment. - `SPECIFIC_AREAS`: Only applies to specific fulfillment areas, as defined in `area_scope.specific_areas` |
| ^^inventory_type | string |  | The inventory types to which the promotion activity applies: - `SELF_FULFILLED`: Only applies to Inventory fulfilled from seller warehouses - `FULFILLED_BY_TIKTOK`: Only applies to Inventory fulfilled by TikTok from FBT (Fulfilled by TikTok) warehouses. - `ALL`:  Applies to all inventory of eligible products. Default: `SELF_FULFILLED` `FULFILLED_BY_TIKTOK` and `ALL` can only be set when `product_level`==`SHOP` and `threshold_type=NO_THRESHOLD`. |
| ^^shipping_method | string |  | The shipping methods to which this promotion applies. - When `STANDARD_SHIPPING`: Only applies to Standard Shipping methods, including Economy. - `EXPRESS_SHIPPING`: Only applies to Express Shipping methods. - `ALL_SHIPPING_METHOD`: Applies to all shipping methods that the shop offers. Default: `STANDARD_SHIPPING` |
| ^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `NO_THRESHOLD`: No minimum purchase criteria. - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. `MINIMAL_ITEM_QUANTITY` and `MINIMAL_ORDER_AMOUNT` can only be set when `product_level==SHOP`. |
| ^^threshold_value | string |  | The purchase threshold of the discount, based on the threshold type, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^type | string |  | The type of benefit awarded by the promotion activity. -When `FREE_SHIPPING`, the buyer's cost of shipping is reduced to zero. ​-When `DISCOUNT_SHIPPING_FEE`, the discount is reduced by the value specified in `shipping_discount.value`. |
| ^^value | string |  | Value of the discount. - When `discount_type==FREE_SHIPPING`, this value is not required. - `discount_type==DISCOUNT_SHIPPING_FEE`, this value is the maximum amount deducted from the buyer's price of shipping in local currency. The value should be limited to two decimal places. |
| duration_type | string |  | The effective time type of the current activity - NORMAL:  `begin_time` and `end_time` must be filled - INDEFINITE: `begin_time` and `end_time` aren't required, and the promotion will be a long-term activity which runs indefinitely. 1.  `INDEFINITE` is only valid when `activity_type` is `SHIPPING_DISCOUNT`, 2. If `duration_type` is `INDEFINITE`, `start_time` and `end_time` should be 0 Default: NORMAL |
| end_time | integer |  | Activity end time. UNIX timestamp. |
| participation_limit | array<object> |  | The number of times a buyer can participate in the promotion. |
| ^type | string |  | Determines whether the promotion activity limits the number of times each buyer can receive its benefit. e.g.: - `BUYER_NO_LIMIT`: No limit for buyer​s. Buyers can benefit from this promotion across multiple orders. - `BUYER_LIMIT_ONLY_ONE`: Buyers can benefit from this promotion activity for no more than one order. ​Default: `BUYER_NO_LIMIT` |
| product_level | string |  | Activity product dimension, values are: ​- PRODUCT: Promotion activity applies at the product (SPU) level. Any and all SKUs that are part of this product will be subject to the promotion. ​- VARIATION: Promotion activity only applies to specified SKUs. ​- SHOP: Promotion activity applies to all products in the shop. When `activity_type` is `SHIPPING_DISCOUNT`, the `product_level` can not be `VARIATION`. To set the products or SKUs covered by the activity, use [Update Activity Product](https://partner.tiktokshop.com/docv2/page/650d32c42aaa3602b86ccb5c). |
| target_user_info | object |  | The targeted user type of the promotion. |
| ^user_type | string |  | Possible enumerations are: `ALL_USER` `SHOP_NEW_CUSTOMER` `SHOP_EXISTING_CUSTOMER` `SHOP_REPEAT_CUSTOMER` |
| title | string |  | Unique name across all your activities. The length must not exceed 50 characters. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^activity_id | string |  | A unique ID that identifies different activities. |
| ^create_time | integer |  | The time when the activity was created. |
| ^status | string |  | Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |
| ^update_time | integer |  | The time when the activity was last updated. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchActivities

Get a list of product discount or flash deal promotion activities. For coupon activities, use [Search Coupons](https://partner.tiktokshop.com/docv2/page/6699dcdf115ebe02f841e4cd).

**Path:** `/promotion/202309/activities/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-activities-202309

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
| activity_title | string |  | Activity title key words. No fuzzy matching. |
| activity_type | string |  | The type of activities. If `activity_type`  isn't passed, return activities of all types. Possible values: The type of activities. Possible values: - `FIXED_PRICE` - `DIRECT_DISCOUNT` - `FLASHSALE` - `SHIPPING_DISCOUNT` - `BUY_MORE_SAVE_MORE` |
| page_size | integer |  | Page size. The range is `[0, 100]`. `50` by default. |
| page_token | string |  | Specify the value for the page. Use `""` for the first page. |
| status | string |  | Activity status. Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^activities | array<object> |  | Activities list information. |
| ^^activity_commands | array<string> |  | Applicable commands to the activity: - IMMUTABLE: The activity cannot be edited or deactivated. |
| ^^activity_type | string |  | The type of activities. Possible values: - `FIXED_PRICE` - `DIRECT_DISCOUNT` - `FLASHSALE` - `SHIPPING_DISCOUNT` |
| ^^begin_time | integer |  | Activity start time. UNIX timestamp. The value must be greater than the value of the current time. |
| ^^create_time | integer |  | The time when the activity was created. |
| ^^discount | object |  | Discount information. |
| ^^^bmsm_discount | object |  | Configurations related to Buy More Save More (BMSM) promotions |
| ^^^^details | array<object> |  | Configurations regarding BMSM promotions. A maximum of two `tier`s are permitted. `details.threshold_type` and `details.discount_type` must be the same across all `tier`s. |
| ^^^gift_discount | object |  | Configurations related to Gift With Purchase (GWP) promotions. Only needs to be configured for GWP promotions. |
| ^^^^gift_infos | array<object> |  | Configurations regarding Gift With Purchase (GWP) promotions. A maximum of two `tier`s are permitted in SEA and UK. Only one `tier` is permitted in US. And `threshold_type` must be the same across all `tier`s. |
| ^^^^gift_receiving_type | string |  | The receiving type of gift. Currently only supports one type: `ALL_RECEIVE` -`ALL_RECEIVE`: All gifts configured in the promotion can be collected. |
| ^^^shipping_discount | object |  | Shipping Discount |
| ^^^^area_scope | object |  | The (buyer's) geographical areas to which the promotion activity applies |
| ^^^^inventory_type | string |  | The inventory types to which the promotion activity applies: - `SELF_FULFILLED`: Only applies to Inventory fulfilled from seller warehouses - `FULFILLED_BY_TIKTOK`: Only applies to Inventory fulfilled by TikTok from FBT (Fulfilled by TikTok) warehouses. - `ALL`:  Applies to all inventory of eligible products. Default: `SELF_FULFILLED` `FULFILLED_BY_TIKTOK` and `ALL` can only be set when `product_level`==`SHOP` and `threshold_type=NO_THRESHOLD`. |
| ^^^^shipping_method | string |  | The shipping methods to which this promotion applies. - When `STANDARD_SHIPPING`: Only applies to Standard Shipping methods, including Economy. - `EXPRESS_SHIPPING`: Only applies to Express Shipping methods. - `ALL_SHIPPING_METHOD`: Applies to all shipping methods that the shop offers. Default: `STANDARD_SHIPPING` |
| ^^^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `NO_THRESHOLD`: No minimum purchase criteria. - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. `MINIMAL_ITEM_QUANTITY` and `MINIMAL_ORDER_AMOUNT` can only be set when `product_level==SHOP`, |
| ^^^^threshold_value | string |  | The purchase threshold of the discount, based on the threshold type, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^^type | string |  | The type of benefit awarded by the promotion activity. - `FREE_SHIPPING`, the buyer's cost of shipping is reduced to zero. ​- `DISCOUNT_SHIPPING_FEE`, the discount is reduced by the value specified in `shipping_discount.value`. |
| ^^^^value | string |  | Value of the discount. - `discount_type==FREE_SHIPPING`, this value is not required. - `discount_type==DISCOUNT_SHIPPING_FEE`, this value is the maximum amount deducted from the buyer's price of shipping in local currency. The value should be limited to two decimal places. |
| ^^duration_type | string |  | The effective time type of the current activity - NORMAL:  `begin_time` and `end_time` must be filled - INDEFINITE: `begin_time` and `end_time` aren't required, and the promotion will be a long-term activity which runs indefinitely. 1.  `INDEFINITE` is only valid when `activity_type` is `SHIPPING_DISCOUNT`, 2. If `duration_type` is `INDEFINITE`, `start_time` and `end_time` should be 0 Default: NORMAL |
| ^^end_time | integer |  | Activity end time. UNIX timestamp. |
| ^^id | string |  | A unique ID that identifies different activities. |
| ^^participation_limit | array<object> |  | The number of times a buyer can participate in the promotion. |
| ^^^type | string |  | Determines whether the promotion activity limits the number of times each buyer can receive its benefit. e.g.: - `BUYER_NO_LIMIT`: No limit for buyer​s. Buyers can benefit from this promotion across multiple orders. - `BUYER_LIMIT_ONLY_ONE`: Buyers can benefit from this promotion activity for no more than one order. ​Default: `BUYER_NO_LIMIT` |
| ^^product_level | string |  | Activity product dimension, values are: ​- PRODUCT: Promotion activity applies at the product (SPU) level. Any and all SKUs that are part of this product will be subject to the promotion. ​- VARIATION: Promotion activity only applies to specified SKUs. ​- SHOP: Promotion activity applies to all products in the shop. |
| ^^status | string |  | Activity status. Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |
| ^^title | string |  | Activity name (50 characters max). |
| ^^update_time | integer |  | The time when the activity was last updated. |
| ^next_page_token | string |  | Page cursor for the next request. The last page returns `""`. |
| ^total_count | integer |  | Total activity count. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetActivity

Get the details of a product discount or flash deal promotion activity. Product information for `FIXED_PRICE`, `DIRECT_DISCOUNT` and `FLASHSALE` activity that ended more than 180 days will not be returned.For coupon activities, use [Get Coupon](6699dce0de15e502ed219e37).

**Path:** `/promotion/202309/activities/{activity_id}`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-activity-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| activity_id | string | Y | Activity ID |

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
| ^activity_commands | array<string> |  | Applicable commands to the activity: - IMMUTABLE: The activity cann't be editable or deactivated |
| ^activity_id | string |  | A unique ID that identifies different activities. |
| ^activity_type | string |  | The type of activities. Possible enumerations: - `FIXED_PRICE`: product discount activity with fixed price. - `DIRECT_DISCOUNT`: product discount activities with percentage off. - `FLASHSALE`: flash sale activity. - `SHIPPING_DISCOUNT`: shipping fee discount. - `BUY_MORE_SAVE_MORE`: Buy more save more discount. |
| ^begin_time | integer |  | Activity start time. UNIX timestamp. The value must be greater than the value of the current time. |
| ^create_time | integer |  | Activity creation time. UNIX timestamp. |
| ^discount | object |  | Discount information. |
| ^^bmsm_discount | object |  | Configurations related to Buy More Save More (BMSM) promotions. |
| ^^^details | array<object> |  | Configurations regarding BMSM promotions. A maximum of two `tier`s are permitted. `details.threshold_type` and `details.discount_type` must be the same across all `tier`s. |
| ^^^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^^threshold_value | string |  | The purchase threshold of the discount, based on the `threshold_type`, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` and `discount_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`20` and `discount_value`== `15`, `tier`==2 must have `threshold_value` > `20` and `discount_value`>`15`. |
| ^^^^type | string |  | The type of discount awarded as a benefit. The value of the discount is determined by `value`. Possible enumerations are: ​- `PERCENTAGE_OFF`​: Buyer will receive X% off the price of the eligible products. - `AMOUNT_OFF`: Buyer will receive X units of local currency off the price of eligible products. |
| ^^^^value | string |  | Value of the discount. - When `type`==`PERCENTAGE_OFF`, the buyer will receive X% off the price of eligible products. If the value represents a percentage, it should be an integer. - `type`==`AMOUNT_OFF`, the buyer will receive X units of local currency off the price of eligible products. If the value represents a monetary amount, it should be limited to two decimal places. |
| ^^gift_discount | object |  | Configurations related to Gift With Purchase (GWP) promotions. Only needs to be configured for GWP promotions. |
| ^^^gift_infos | array<object> |  | Configurations regarding Gift With Purchase (GWP) promotions. A maximum of two `tier`s are permitted in SEA and UK. Only one `tier` is permitted in US.  And `threshold_type` must be the same across all `tier`s. |
| ^^^^gift_details | array<object> |  | Gift configurations related to Gift With Purchase (GWP) promotions. |
| ^^^^threshold_type | string |  | purchase threshold type of discount. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^^threshold_value | string |  | The purchase threshold value of the gift, based on the `threshold_type`. Determined by user. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`2`, `tier`==2 must have `threshold_value` > `2`. |
| ^^^gift_receiving_type | string |  | The receiving type of gift. Currently only supports one type: `ALL_RECEIVE` |
| ^^shipping_discount | object |  | Shipping discount |
| ^^^area_scope | object |  | The (buyer's) geographical areas to which the promotion activity applies. |
| ^^^^specific_areas | array<string> |  | The list of areas for which the promotion activity applies. The valid values that may be included in this list are dependent on the region of the shop. The list of valid values for each shop region are available here: [link](https://partner.tiktokshop.com/docv2/page/67e3b059e7dc4f04a4ff9e09) |
| ^^^^type | string |  | The (buyer's) geographical area to which the promotion activity applies. ​- `WHOLE`: Promotion activity applies to all areas to which the seller offers fulfillment. - `SPECIFIC_AREAS`: Only applies to specific fulfillment areas, as defined in `area_scope.specific_areas`. |
| ^^^inventory_type | string |  | The inventory types to which the promotion activity applies: - `SELF_FULFILLED`: Only applies to Inventory fulfilled from seller warehouses - `FULFILLED_BY_TIKTOK`: Only applies to Inventory fulfilled by TikTok from FBT (Fulfilled by TikTok) warehouses. - `ALL`:  Applies to all inventory of eligible products. Default: `SELF_FULFILLED` `FULFILLED_BY_TIKTOK` and `ALL` can only be set when `product_level`==`SHOP` and `threshold_type=NO_THRESHOLD`. |
| ^^^shipping_method | string |  | The shipping methods to which this promotion applies. - When `STANDARD_SHIPPING`: Only applies to Standard Shipping methods, including Economy. - `EXPRESS_SHIPPING`: Only applies to Express Shipping methods. - `ALL_SHIPPING_METHOD`: Applies to all shipping methods that the shop offers. Default: `STANDARD_SHIPPING` |
| ^^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `NO_THRESHOLD`: No minimum purchase criteria. - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. `MINIMAL_ITEM_QUANTITY` and `MINIMAL_ORDER_AMOUNT` can only be set when `product_level==SHOP`. |
| ^^^threshold_value | string |  | The purchase threshold of the discount, based on the threshold type, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^type | string |  | The type of benefit awarded by the promotion activity. - `FREE_SHIPPING`, the buyer's cost of shipping is reduced to zero. ​- `DISCOUNT_SHIPPING_FEE`, the discount is reduced by the value specified in `shipping_discount.value`. |
| ^^^value | string |  | Value of the discount. - When `discount_type==FREE_SHIPPING`, this value is not required. - `discount_type==DISCOUNT_SHIPPING_FEE`, this value is the maximum amount deducted from the buyer's price of shipping in local currency. The value should be limited to two decimal places. |
| ^duration_type | string |  | The effective time type of the current activity - NORMAL:  `begin_time` and `end_time` must be filled - INDEFINITE: `begin_time` and `end_time` aren't required, and the promotion will be a long-term activity which runs indefinitely. 1.  `INDEFINITE` is only valid when `activity_type` is `SHIPPING_DISCOUNT`, 2. If `duration_type` is `INDEFINITE`, `start_time` and `end_time` should be 0 Default: NORMAL |
| ^end_time | integer |  | Activity end time. UNIX timestamp. |
| ^participation_limit | array<object> |  | The number of times a buyer can participate in the promotion. |
| ^^type | string |  | Determines whether the promotion activity limits the number of times each buyer can receive its benefit. e.g.: - `BUYER_NO_LIMIT`: No limit for buyer​s. Buyers can benefit from this promotion across multiple orders. - `BUYER_LIMIT_ONLY_ONE`: Buyers can benefit from this promotion activity for no more than one order. ​Default: `BUYER_NO_LIMIT` |
| ^product_level | string |  | Activity product dimension, values are: - PRODUCT: Product level promotion activity. - VARIATION: SKU level promotion activity. - SHOP: Shop level promotion activity. |
| ^products | array<object> |  | Product List. Note:If  `FIXED_PRICE`, `DIRECT_DISCOUNT` and `FLASHSALE` activity that ended more than 180 days,this field is empty. |
| ^^activity_price | object |  | Activity price. |
| ^^^amount | string |  | Activity price amount. |
| ^^^currency | string |  | Currency unit of an activity price. |
| ^^discount | string |  | Discount value. If the product is 10% off, the value is `10`. Available only if `activity_type==DIRECT_DISCOUNT` and `product_level==PRODUCT`. |
| ^^id | string |  | TikTok Shop Product ID. |
| ^^quantity_limit | integer |  | The quantity limit of the products involved in the activity. The range is `[1, 99]`, or `-1` for unlimited. |
| ^^quantity_per_user | integer |  | Limit of product purchase per buyer. The range is `[1, 99]`, or `-1` for unlimited. |
| ^^skus | array<object> |  | Available only if `product_level==VARIATION`. |
| ^^^activity_price | object |  | Activity price. Available only if `activity_type==FIXED_PRICE/FLASHSALE`. |
| ^^^^amount | string |  | Activity price amount. |
| ^^^^currency | string |  | Currency unit of an activity price. |
| ^^^discount | string |  | Discount value. If the SKU is 10% off, the value is `10`. Available only if `activity_type==DIRECT_DISCOUNT`. |
| ^^^id | string |  | TikTok Shop SKU ID. |
| ^^^quantity_limit | integer |  | The quantity limit of the SKU involved in the activity. The range is `[1, 99]`, or `-1` for unlimited. |
| ^^^quantity_per_user | integer |  | Limit of SKU purchase per buyer. The range is `[1, 99]`, or `-1` for unlimited. |
| ^status | string |  | Activity status. Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |
| ^target_user_info | object |  | The targeted user type of the promotion. |
| ^^user_type | string |  | Possible enumerations are: `ALL_USER` `SHOP_NEW_CUSTOMER` `SHOP_EXISTING_CUSTOMER` `SHOP_REPEAT_CUSTOMER` |
| ^title | string |  | Activity name (50 characters max.) The name must be unique. |
| ^update_time | integer |  | Activity update time. UNIX timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateActivity

Change the title and the beginning and end time of the existing product discount or flash sale promotion activity.

**Path:** `/promotion/202309/activities/{activity_id}`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-activity-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| activity_id | string | Y | Activity ID |

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
| begin_time | integer |  | Activity start time. UNIX timestamp. The value must be greater than the value of the current time. |
| discount | object |  | Discount information. |
| ^bmsm_discount | object |  | Configurations related to Buy More Save More (BMSM) promotions |
| ^^details | array<object> |  | Configurations regarding BMSM promotions. A maximum of two `tier`s are permitted. `details.threshold_type` and `details.discount_type` must be the same across all `tier`s. |
| ^^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^threshold_value | string |  | The purchase threshold of the discount, based on the `threshold_type`, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` and `discount_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`20` and `discount_value`== `15`, `tier`==2 must have `threshold_value` > `20` and `discount_value`>`15`. |
| ^^^type | string |  | The type of discount awarded as a benefit. The value of the discount is determined by `value`. Possible enumerations are: ​- `PERCENTAGE_OFF`​: Buyer will receive X% off the price of the eligible products. - `AMOUNT_OFF`: Buyer will receive X units of local currency off the price of eligible products. |
| ^^^value | string |  | Value of the discount. - When `type`==`PERCENTAGE_OFF`, the buyer will receive X% off the price of eligible products. If the value represents a percentage, it should be an integer. - `type`==`AMOUNT_OFF`, the buyer will receive X units of local currency off the price of eligible products. If the value represents a monetary amount, it should be limited to two decimal places. |
| ^gift_discount | object |  | Configurations related to Gift With Purchase (GWP) promotions. Only needs to be configured for GWP promotions. |
| ^^gift_infos | array<object> |  | Configurations regarding Gift With Purchase (GWP) promotions. A maximum of two `tier`s are permitted in SEA and UK. Only one `tier` is permitted in US.  And `threshold_type` must be the same across all `tier`s. |
| ^^^gift_details | array<object> |  | Gift configurations related to Gift With Purchase (GWP) promotions. |
| ^^^^product_id | string |  | TikTok Shop product id of gift. |
| ^^^^sku_id | string |  | TikTok Shop sku id of gift. |
| ^^^^total_claim_limit | string |  | The quantity limit of the gift sku which is involved in the activity. The range is [1, 99999].  If you are updating the value of an existing sku, the value cannot be decreased. |
| ^^^threshold_type | string |  | The purchase threshold type of discount. The threshold type of each tier must be consistent. Possible enumerations are: - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. |
| ^^^threshold_value | string |  | The purchase threshold value of the gift, based on the `threshold_type`. Determined by user. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^^tier | integer |  | `tier` uses 1-based indexing, i.e. the first and second tiers are counted "1, 2", not "0, 1". `threshold_value` for a given tier must be greater than that of the previous tier. E.g. If `tier`==1 has `threshold_value`==`2`, `tier`==2 must have `threshold_value` > `2`. |
| ^^gift_receiving_type | string |  | The receiving type of gift. Currently only supports one type: `ALL_RECEIVE` -`ALL_RECEIVE`: All gifts configured in the promotion can be collected. |
| ^shipping_discount | object |  | Shipping discount |
| ^^area_scope | object |  | The (buyer's) geographical areas to which the promotion activity applies |
| ^^^specific_areas | array<string> |  | The list of areas for which the promotion activity applies. The valid values that may be included in this list are dependent on the region of the shop. The list of valid values for each shop region are available here: [link](https://partner.tiktokshop.com/docv2/page/67e3b059e7dc4f04a4ff9e09) |
| ^^^type | string |  | The (buyer's) geographical area to which the promotion activity applies. ​- `WHOLE`: Promotion activity applies to all areas to which the seller offers fulfillment. - `SPECIFIC_AREAS`: Only applies to specific fulfillment areas, as defined in `area_scope.specific_areas` |
| ^^inventory_type | string |  | The inventory types to which the promotion activity applies: - `SELF_FULFILLED`: Only applies to Inventory fulfilled from seller warehouses - `FULFILLED_BY_TIKTOK`: Only applies to Inventory fulfilled by TikTok from FBT (Fulfilled by TikTok) warehouses. - `ALL`:  Applies to all inventory of eligible products. Default: `SELF_FULFILLED` `FULFILLED_BY_TIKTOK` and `ALL` can only be set when `product_level`==`SHOP` and `threshold_type=NO_THRESHOLD`. |
| ^^shipping_method | string |  | The shipping methods to which this promotion applies. - When `STANDARD_SHIPPING`: Only applies to Standard Shipping methods, including Economy. - `EXPRESS_SHIPPING`: Only applies to Express Shipping methods. - `ALL_SHIPPING_METHOD`: Applies to all shipping methods that the shop offers. Default: `STANDARD_SHIPPING` |
| ^^threshold_type | string |  | The type of purchase criteria. Possible enumerations are: - `NO_THRESHOLD`: No minimum purchase criteria. - `MINIMAL_ITEM_QUANTITY`: Buyer must meet or exceed the minimum spend criteria with eligible products. - `MINIMAL_ORDER_AMOUNT`: Buyer must meet or exceed the minimum spend criteria with eligible order. `MINIMAL_ITEM_QUANTITY` and `MINIMAL_ORDER_AMOUNT` can only be set when `product_level==SHOP`. |
| ^^threshold_value | string |  | The purchase threshold of the discount, based on the threshold type, e.g., "3". Determined by user. - When `threshold_type==NO_THRESHOLD`, this value is not required. - When `threshold_type==MINIMAL_ITEM_QUANTITY`, buyer must purchase at least the specified number of eligible products (e.g. must purchase 3 or more eligible products to receive the benefit). If it represents a quantity, it must be an integer. - When `threshold_type==MINIMAL_ORDER_AMOUNT`, the eligible product subtotal for the buyer's order must meet or exceed the specified order value in local currency (e.g. buyer's order subtotal must be at least $3 to receive the benefit). If it represents an order value, it must be limited to two decimal places. |
| ^^type | string |  | The type of benefit awarded by the promotion activity. - `FREE_SHIPPING`, the buyer's cost of shipping is reduced to zero. ​- `DISCOUNT_SHIPPING_FEE`, the discount is reduced by the value specified in `shipping_discount.value`. |
| ^^value | string |  | Value of the discount. - When `discount_type==FREE_SHIPPING`, this value is not required. - `discount_type==DISCOUNT_SHIPPING_FEE`, this value is the maximum amount deducted from the buyer's price of shipping in local currency. The value should be limited to two decimal places. |
| duration_type | string |  | The effective time type of the current activity - NORMAL:  `begin_time` and `end_time` must be filled - INDEFINITE: `begin_time` and `end_time` aren't required, and the promotion will be a long-term activity which runs indefinitely. 1.  `INDEFINITE` is only valid when `activity_type` is `SHIPPING_DISCOUNT`, 2. If `duration_type` is `INDEFINITE`, `start_time` and `end_time` should be 0 Default: NORMAL |
| end_time | integer |  | Activity end time. UNIX timestamp. |
| participation_limit | array<object> |  | The number of times a buyer can participate in the promotion. |
| ^type | string |  | Determines whether the promotion activity limits the number of times each buyer can receive its benefit. e.g.: - `BUYER_NO_LIMIT`: No limit for buyer​s. Buyers can benefit from this promotion across multiple orders. - `BUYER_LIMIT_ONLY_ONE`: Buyers can benefit from this promotion activity for no more than one order. ​Default: `BUYER_NO_LIMIT` |
| product_level | string |  | Activity product dimension, values are: ​- PRODUCT: Promotion activity applies at the product (SPU) level. Any and all SKUs that are part of this product will be subject to the promotion. ​- VARIATION: Promotion activity only applies to specified SKUs. ​- SHOP: Promotion activity applies to all products in the shop. |
| target_user_info | object |  | The targeted user type of the promotion. |
| ^user_type | string |  | Possible enumerations are: `ALL_USER` `SHOP_NEW_CUSTOMER` `SHOP_EXISTING_CUSTOMER` `SHOP_REPEAT_CUSTOMER` |
| title | string |  | Activity name (50 characters max). The name must be unique. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^activity_id | string |  | A unique ID that identifies different activities. |
| ^title | string |  | Activity name set by the seller. |
| ^update_time | integer |  | Last update time. UNIX timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## DeactivateActivity

Deactivate an ongoing or upcoming activity.

**Path:** `/promotion/202309/activities/{activity_id}/deactivate`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/deactivate-activity-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| activity_id | string | Y | A unique ID that identifies different activities. |

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
| ^activity_id | string |  | A unique ID that identifies different activities. |
| ^status | string |  | Activity status. Values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is not in effect and is not available to TikTok users. |
| ^title | string |  | Activity name (50 characters max.) The name must be unique. |
| ^update_time | integer |  | Activity update time, unix timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateActivityProduct

Use this API to add the products or SKUs to the list of a product discount activity or a flash deal activity. You can also change the discounts on existing products or SKUs. To remove the products or SKUs from the list, use [Remove Activity Product](https://partner.tiktokshop.com/docv2/page/650acfd84a0bb702c072b4eb).

**Path:** `/promotion/202309/activities/{activity_id}/products`
**Method:** `PUT`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-activity-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| activity_id | string | Y | Activity ID |

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
| activity_id | string |  | A unique ID that identifies activities. You cannot update the products in `DEACTIVATED` or `EXPIRED` activities. |
| products | array<object> |  | The items to add to the list or the existing items in the list of promotion activity to edit. The length must not exceed `300`. |
| ^activity_price_amount | string |  | Deal price. You must specify the value when `product_level==PRODUCT` and `activity_type==FIXED_PRICE / FLASHSALE`. The currency is the same between activity price and product price. |
| ^discount | string |  | Discount value. If the product is 10% off, the value is `10`. You must specify the value when `product_level==PRODUCT` and `activity_type==DIRECT_DISCOUNT`; and you must not specify it when it's not. |
| ^id | string |  | TikTok Shop product ID |
| ^quantity_limit | integer |  | The quantity limit of the products involved in the activity. The range is `[1, 99]`, or you can use `-1` for unlimited. If you are updating the value of an existing product, the value cannot be less than the current value. When `product_level==VARIATION`, you must specify `-1`. |
| ^quantity_per_user | integer |  | Limit of product purchase per buyer. The range is `[1, 99]`, or you can use `-1` for unlimited. If you are updating the value of an existing product, the value cannot be less than the current value. When `product_level==VARIATION`, you must specify `-1`. |
| ^skus | array<object> |  | The SKUs to add to the list or to edit. The number of the SKUs across all products must not exceed 300 in an API call. You must specify the value to `[]` when `product_level==PRODUCT`. |
| ^^activity_price_amount | string |  | Deal price. You must specify the value when `product_level==VARIATION` and `activity_type==FIXED_PRICE / FLASHSALE`. The currency of activity price is the same as that of SKU price. |
| ^^discount | string |  | Discount value. If the SKU is 10% off, the value is `10`. You must specify the value when `product_level==VARIATION` and `activity_type==DIRECT_DISCOUNT`. |
| ^^id | string |  | SKU ID |
| ^^quantity_limit | integer |  | The quantity limit of the SKU involved in the activity. The range is `[1, 99]`, or you can use `-1` for unlimited. If you are updating the value of an existing SKU, the value cannot be decreased. |
| ^^quantity_per_user | integer |  | Limit of SKU purchase per buyer. The range is `[1, 99]`, or you can use `-1` for unlimited. If you are updating the value of an existing SKU, the value cannot be decreased. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^activity_id | string |  | A unique ID that identifies different activities. |
| ^status | string |  | Activity status. Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |
| ^title | string |  | Activity name set by the merchant. |
| ^total_count | integer |  | The number of items in this request. When `product_level==PRODUCT`, it's the number of products; when `product_level==VARIATION`, it's the number of SKUs across products. |
| ^update_time | integer |  | Latest update time. UNIX timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveActivityProduct

Use this API to remove products or SKUs from the existing product discount or flash sale promotion activity.

**Path:** `/promotion/202309/activities/{activity_id}/products`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-activity-product-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| activity_id | string | Y | Activity ID |

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
| product_ids | array<string> |  | IDs of the products to remove. Max count: 300. |
| sku_ids | array<string> |  | IDs of the SKUs to remove. Max count: 300. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^activity_id | string |  | A unique ID that identifies activities. |
| ^status | string |  | Activity status. Possible values: - DRAFT: Promotion activities with this status are not available to TikTok users. - NOT_START: Promotion activities with this status are not available to TikTok users until the set activity start time. - ONGOING: Promotion activities with this status are available to TikTok users. - EXPIRED: Promotion activities with this status are not available to TikTok users because it has expired. - DEACTIVATED: The activity has been deactivated by the seller and is not available to TikTok users. - NOT_EFFECTIVE:  The activity is terminated by the platform and is not available to TikTok users. |
| ^update_time | integer |  | Activity update time, unix timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchCoupons

Use this API to get a list of coupons, narrowed down further based on search parameters. 
The coupons are created in Seller Center or Seller App.
For further details of the specific coupon, use `GET Coupon`.

**Path:** `/promotion/202406/coupons/search`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/search-coupons-202406

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Page cursor. Omitting this parameter will return the first page of results. |
| page_size | integer |  | The number of coupons returned in one page of results. The range is `[1, 100]`, with a default value of `50`. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| display_type | array<string> |  | The display type of coupons. Values: - `REGULAR`: Regular coupons which are displayed to TikTok users across all display locations available in TTS, including PLPs, PDPs, TikTok Videos, LIVE Rooms, Creator Showcases, and may be shared via TTS Customer Support instant messages. Includes coupons which target select customer segments. - `LIVE`: Coupons which are only displayed to TikTok users in LIVE Rooms. - `CREATOR_EXCLUSIVE`: Coupons that can be claimed through the display channels of the specified creator, such as their LIVE Rooms, and their Creator Showcase. - `CHAT`: Exclusive coupons that may be sent to customers via TTS customer support chat messages, but are not displayed in other display locations. - `PROMO_CODE`: Promo codes do not have dedicated display locations on TikTok, but may be shared with customers in LIVEs, in TikTok videos, or other social media platforms. They can be claimed by customers entering a claim code at checkout or by customers that use a custom promo code landing page URL. |
| status | array<string> |  | Coupon's promotion status. Values: - `NOT_START`: Not available to TikTok users until the coupon's configured start time. - `ONGOING`: Available to TikTok users. - `EXPIRED`: Not available to TikTok users because it has expired. - `DEACTIVATED`: Deactivated by the seller and is not available to TikTok users. |
| title_keyword | string |  | Keywords in the coupon titles to search for. The range of the length is `(0, 100]`. Fuzzy matching not supported. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^coupons | array<object> |  | Coupons. |
| ^^claim_duration | object |  | Claimable period of the coupon |
| ^^^end_time | integer |  | The UNIX timestamp from which a shopper can claim the coupon. |
| ^^^start_time | integer |  | The UNIX timestamp from which a shopper can claim the coupon. |
| ^^create_time | integer |  | The UNIX timestamp of when the coupon was created. |
| ^^creation_source | string |  | The system where the coupon is created: - `SELLER_CENTER`: Created via the Promotions section of TikTok Seller Center. - `SELLER_APP`: Created via the TikTok Seller Mobile App. - `TTS_CRM`: Created via the TikTok Shop CRM. |
| ^^discount | object |  | Discount. |
| ^^^max_discount | object |  | Optional monetary upper limit of the total discount amount when `type == ""PERCENT_OFF""`. |
| ^^^^amount | string |  | Monetary value of the `max_discount`. |
| ^^^^currency | string |  | Currency of the `max_discount`. |
| ^^^percentage | string |  | The discount offered by the coupon, in percentage points. Will appear when `type == PERCENT_OFF'`. |
| ^^^reduction_amount | object |  | Will appear when `type == 'AMOUNT_OFF'`. |
| ^^^^amount | string |  | Monetary value of an `AMOUNT_OFF` discount. |
| ^^^^currency | string |  | Currency of the discount amount. |
| ^^^type | string |  | The type of discount offered by the coupon. Possible enumerations are: - `AMOUNT_OFF`: Reduces the final price of the item by the specified `reduction_amount` - `PERCENT_OFF`: Reduces the final price by the specified `percentage`. |
| ^^display_type | string |  | The display type of coupons. Values: - `REGULAR`: Regular coupons which are displayed to TikTok users across all display locations available in TTS, including PLPs, PDPs, TikTok Videos, LIVE Rooms, Creator Showcases, and may be shared via TTS Customer Support instant messages. Includes coupons which target select customer segments. - `LIVE`: Coupons which are only displayed to TikTok users in LIVE Rooms. - `CREATOR_EXCLUSIVE`: Coupons that can be claimed through the display channels of the specified creator, such as their LIVE Rooms, and their Creator Showcase. - `CHAT`: Exclusive coupons that may be sent to customers via TTS customer support chat messages, but are not displayed in other display locations. - `PROMO_CODE`: Promo codes do not have dedicated display locations on TikTok, but may be shared with customers in LIVEs, in TikTok videos, or other social media platforms. They can be claimed by customers entering a claim code at checkout or by customers that use a custom promo code landing page URL. |
| ^^id | string |  | A unique ID that identifies different coupons. |
| ^^product_scope | string |  | The range of the products which the coupon applies to. The possible enumerations are: - `FULL_SHOP`: All products sold in the shop are eligible for the coupon. - `SPECIFIC_PRODUCTS`: Only specified products are eligible for the coupon. The list of specified products are returned in the response of the `get_coupon` API. |
| ^^promo_code | string |  | Promotion code. The string contains only Unicode letters or digits. The length of the string is in the range of `[6, 12]`. |
| ^^redemption_duration | object |  | Period during which the coupon can be redeemed (i.e. applied to an order). |
| ^^^end_time | integer |  | The UNIX timestamp at which the redemption period ends, if `type == 'ABSOLUTE'`. |
| ^^^relative_time | integer |  | The number of days after coupon claim time for which a coupon is valid to be redeemed, `type = 'RELATIVE'`. |
| ^^^start_time | integer |  | The UNIX timestamp at which the redemption period starts, if `type == 'ABSOLUTE'`. |
| ^^^type | string |  | Values: - `ABSOLUTE`: the redemption period starts from `start_time` and ends at `end_time`. - `RELATIVE`: the redemption period starts from the time the coupon is claimed and lasts for `relative_time`. |
| ^^status | string |  | Coupon's promotion status. Values: - `NOT_START`: Not available to TikTok users until the coupon's configured start time. - `ONGOING`: Available to TikTok users. - `EXPIRED`: Not available to TikTok users because it has expired. - `DEACTIVATED`: Deactivated by the seller and is not available to TikTok users. |
| ^^target_buyer_segment | string |  | The target buyer segment of the coupon. Possible enumerations are: - `ALL`: May be discovered and claimed by all TTS buyers. - `NEW`:Customers who have never purchased from your shop. - `REPEAT_CUSTOMERS`: People who have previously placed orders in your shop and made another purchase within certain days(30 days for non-US and 90 days for US). - `RECENT_CUSTOMERS`: People who have made their first purchase in your shop in the past certain days(30 days for non-US and 90 days for US). - `FREQUENT_CUSTOMERS`: Customers with more than 1 purchase within the last 90 days. - `LAPSED_CUSTOMERS`: Customers with at least 1 purchase in the past 365 days but no purchases within the last certain days(90 days for non-US and 30 days for US). - `NEW_FOLLOWERS`: People who started following the TikTok account of your shop in the past 30 days. - `EXISTING_ACTIVE_FOLLOWERS`: People who followed the TikTok account of your shop and engaged with your shop through LIVE, short videos or product cards in the past 30 days. |
| ^^threshold | object |  | Optional minimum purchase criteria that must be met in order to receive the coupon's discount. |
| ^^^min_spend | object |  | When `threshold.type == 'MIN_SPEND'`, a customer must purchase products from the range defined by `product_scope` with a monetary amount greater than or equal to this value, or the customer cannot use the coupon. |
| ^^^^amount | string |  | Monetary value of the `min_spend`. |
| ^^^^currency | string |  | Currency of the `min_spend` threshold. |
| ^^^type | string |  | The type of purchase criteria. Possible enumerations are: - `NONE`: No minimum purchase criteria. - `MIN_SPEND`: Buyer must meet or exceed the minimum spend criteria with eligible products. |
| ^^title | string |  | Seller-specified title of the coupon. |
| ^^update_time | integer |  | The UNIX timestamp of when the coupon was updated. |
| ^^usage_limits | object |  | Limitations for the use of the coupons. |
| ^^^redemption_limit | integer |  | The number of times that a claimed coupon can be redeemed across all buyers. (Only available in ID, MY, PH, TH, SG, VN regions.) |
| ^^^single_buyer_claim_limit | integer |  | The number of times a single buyer can claim the coupon. |
| ^^^total_claim_limit | integer |  | The total number of claims allowed for the coupon across all buyers. |
| ^next_page_token | string |  | Page cursor for next request. The last page returns "". |
| ^total_count | integer |  | Total coupon count. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetCoupon

Use this API to get the full details of a coupon matching the {coupon_id}.

**Path:** `/promotion/202406/coupons/{coupon_id}`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/get-coupon-202406

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| coupon_id | string | Y | Coupon id. |

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
| ^coupon | object |  | Coupon. |
| ^^claim_duration | object |  | Claimable period of the coupon. |
| ^^^end_time | integer |  | The UNIX timestamp after which a shopper can no longer claim the coupon. |
| ^^^start_time | integer |  | The UNIX timestamp from which a shopper can claim the coupon. |
| ^^create_time | integer |  | The UNIX timestamp of when the coupon was created. |
| ^^creation_source | string |  | The system where the coupon is created: - `SELLER_CENTER`: Created via the Promotions section of TikTok Seller Center. - `SELLER_APP`: Created via the TikTok Seller Mobile App. - `TTS_CRM`: Created via the TikTok Shop CRM. |
| ^^discount | object |  | Discount |
| ^^^max_discount | object |  | Optional monetary upper limit of the total discount amount when `type == ""PERCENT_OFF""`. |
| ^^^^amount | string |  | Monetary value of the `max_discount`. |
| ^^^^currency | string |  | Currency of the `max_discount`. |
| ^^^percentage | string |  | The discount offered by the coupon, in percentage points. Will appear when `type == PERCENT_OFF'`. |
| ^^^reduction_amount | object |  | Will appear when `type == 'AMOUNT_OFF'`. |
| ^^^^amount | string |  | Monetary value of an `AMOUNT_OFF` discount. |
| ^^^^currency | string |  | Currency of the discount amount. |
| ^^^type | string |  | The type of discount offered by the coupon. Possible enumerations are: - `AMOUNT_OFF`: Reduces the final price of the item by the specified `reduction_amount` - `PERCENT_OFF`: Reduces the final price by the specified `percentage`. |
| ^^display_channels | array<string> |  | The channels in which the coupons can be displayed or distributed: - `ALL`: All channels. - `SHOPPING_CENTER`: Only in TikTok Shop shopping center. - `CHAT`: Only in TT chat. - `LIVE`: Only in TT live. - `PRIVATE`: For promotion code. TikTok users won't know the codes until you show them. - `VIDEO`: Only in short videos. - `SHOWCASE`: Only in showcases. |
| ^^display_type | string |  | The display type of coupons. Values: - `REGULAR`: Regular coupons which are displayed to TikTok users across all display locations available in TTS, including PLPs, PDPs, TikTok Videos, LIVE Rooms, Creator Showcases, and may be shared via TTS Customer Support instant messages. Includes coupons which target select customer segments. - `LIVE`: Coupons which are only displayed to TikTok users in LIVE Rooms. - `CREATOR_EXCLUSIVE`: Coupons that can be claimed through the display channels of the specified creator, such as their LIVE Rooms, and their Creator Showcase. - `CHAT`: Exclusive coupons that may be sent to customers via TTS customer support chat messages, but are not displayed in other display locations. - `PROMO_CODE`: Promo codes do not have dedicated display locations on TikTok, but may be shared with customers in LIVEs, in TikTok videos, or other social media platforms. They can be claimed by customers entering a claim code at checkout or by customers that use a custom promo code landing page URL. |
| ^^id | string |  | A unique ID that identifies different coupons. |
| ^^live_tasks | array<object> |  | The tasks which the shopper must fulfill before claiming the coupon distributed in TikTok live. Only exists for LIVE coupons in the US and the UK. |
| ^^^min_watch_time | string |  | Number of seconds for which the shopper must watch the LIVE in order to claim the coupon. |
| ^^^type | string |  | Possible enumerations: - `NONE`: Any shopper in the LIVE room may claim the coupon. - `FOLLOW_HOST`: Shoppers must follow the LIVE host before being able to claim the coupon. - `WATCH_FOR_MIN_TIME`: Shoppers must watch the LIVE for the time specified by `min_watch_time` before being able to claim the coupon. |
| ^^product_ids | array<string> |  | The IDs of the eligible products when `product_scope == 'SPECIFIC_PRODUCTS'`. |
| ^^product_scope | string |  | The range of the products which the coupon applies to. The possible enumerations are: - `FULL_SHOP`: All products sold in the shop are eligible for the coupon. - `SPECIFIC_PRODUCTS`: Only specified products are eligible for the coupon. The list of specified products are returned in the response of the `get_coupon` API. |
| ^^promo_code | string |  | Promotion code. The string contains only Unicode letters or digits. The length of the string is in the range of `[6, 12]`. |
| ^^redemption_duration | object |  | Period during which the coupon can be redeemed (i.e. applied to an order). |
| ^^^end_time | integer |  | The UNIX timestamp at which the redemption period ends, if `type == 'ABSOLUTE'`. |
| ^^^relative_time | integer |  | The number of days after coupon claim time for which a coupon is valid to be redeemed, `type = 'RELATIVE'`. |
| ^^^start_time | integer |  | The UNIX timestamp at which the redemption period starts, if `type == 'ABSOLUTE'`. |
| ^^^type | string |  | Values: - `ABSOLUTE`: the redemption period starts from `start_time` and ends at `end_time`. - `RELATIVE`: the redemption period starts from the time the coupon is claimed and lasts for `relative_time`. |
| ^^seller_tnc | string |  | Custom terms & conditions optionally uploaded by the seller when configuring the coupon. |
| ^^status | string |  | Coupon's promotion status. Values: - `NOT_START`: Not available to TikTok users until the coupon's configured start time. - `ONGOING`: Available to TikTok users. - `EXPIRED`: Not available to TikTok users because it has expired. - `DEACTIVATED`: Deactivated by the seller and is not available to TikTok users. |
| ^^target_buyer_segment | string |  | The target buyer segment of the coupon. Possible enumerations are: - `ALL`: May be discovered and claimed by all TTS buyers. - `NEW`:Customers who have never purchased from your shop. - `REPEAT_CUSTOMERS`: People who have previously placed orders in your shop and made another purchase within certain days(30 days for non-US and 90 days for US). - `RECENT_CUSTOMERS`: People who have made their first purchase in your shop in the past certain days(30 days for non-US and 90 days for US). - `FREQUENT_CUSTOMERS`: Customers with more than 1 purchase within the last 90 days. - `LAPSED_CUSTOMERS`: Customers with at least 1 purchase in the past 365 days but no purchases within the last certain days(90 days for non-US and 30 days for US). - `NEW_FOLLOWERS`: People who started following the TikTok account of your shop in the past 30 days. - `EXISTING_ACTIVE_FOLLOWERS`: People who followed the TikTok account of your shop and engaged with your shop through LIVE, short videos or product cards in the past 30 days. |
| ^^threshold | object |  | Optional minimum purchase criteria that must be met in order to receive the coupon's discount. |
| ^^^min_spend | object |  | When `threshold.type == 'MIN_SPEND'`, a customer must purchase products from the range defined by `product_scope` with a monetary amount greater than or equal to this value, or the customer cannot use the coupon. |
| ^^^^amount | string |  | Monetary value of the `min_spend`. |
| ^^^^currency | string |  | Currency of the `min_spend` threshold. |
| ^^^type | string |  | The type of purchase criteria. Possible enumerations are: - `NONE`: No minimum purchase criteria. - `MIN_SPEND`: Buyer must meet or exceed the minimum spend criteria with eligible products. |
| ^^title | string |  | Seller-specified title of the coupon. |
| ^^update_time | integer |  | The UNIX timestamp of when the coupon was updated. |
| ^^usage_limits | object |  | Limitations for the use of the coupons. |
| ^^^redemption_limit | integer |  | The number of times that a claimed coupon can be redeemed across all buyers. (Only available in ID, MY, PH, TH, SG, VN regions.) |
| ^^^single_buyer_claim_limit | integer |  | The number of times a single buyer can claim the coupon. |
| ^^^total_claim_limit | integer |  | The total number of claims allowed for the coupon across all buyers. |
| ^^usage_stats | object |  | Usage statistics |
| ^^^claimed_count | integer |  | The number of times that the coupon has been claimed. |
| ^^^redeemed_count | integer |  | The number of times that a coupon has been redeemed (i.e. applied to an order). |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
