# TikTok Shop API — analytics

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 35 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202403, 202405, 202406, 202409, 202503, 202505, 202508, 202509, 202510, 202512

---

## GetLiveCoreStats

This API returns the core stats of live detail, e.g. GMV.

**Path:** `/analytics/202309/live_rooms/{live_room_id}/core_stats`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-live-core-stats-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | the live stream room id |

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
| ^stats | object |  | The stats of the live room |
| ^^accumulated_comment_count | integer |  | The cumulative number of times users left comments on the livestream |
| ^^accumulated_new_follower_count | integer |  | The number of times users clicked to follow the creator |
| ^^accumulated_sharing_count | integer |  | The cumulative number of times users shared the livestream |
| ^^avg_watching_duration | integer |  | The average length of time each unique viewer watches the livestream. |
| ^^buyer_count | integer |  | The number of unique users who paid for orders made from livestream, including returned/refunded orders |
| ^^click_order_rate | string |  | Click to order，paid sku orders/ product clicks |
| ^^click_through_rate | string |  | Click through rate，product clicks / views |
| ^^created_order_count | integer |  | The number of SKU orders created by users from the livestream |
| ^^current_visitor_count | integer |  | Viewers |
| ^^local_gmv | object |  | Revenue |
| ^^^amount | string |  | The amount of GMV |
| ^^^currency | string |  | Currency Code |
| ^^local_unit_price | object |  | The average price of the units sold |
| ^^^amount | string |  | The amount of unit price |
| ^^^currency | string |  | Currency Code |
| ^^paid_order_count | integer |  | The number of SKU orders created and paid by users from the livestream |
| ^^peak_concurrent_user_count | integer |  | The peak number of concurrent viewers of the livestream |
| ^^product_reach_count | integer |  | The number of product clicks from the livestream, including product list and product card clicks |
| ^^product_view_count | integer |  | The number of impressions of all livestream products, including product list and product card impressions |
| ^^sales | integer |  | The number of product units sold from the livestream |
| ^^watch_pv | integer |  | The number of views of the livestream |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGMVTrendPerformances

This API gets the trend points of gmv related information

**Path:** `/analytics/202309/live_rooms/{live_room_id}/gmv_trend_performances`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-gmvtrend-performances-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^gmv_trend_performances | array<object> |  | The trend of GMV chart |
| ^^data_points | array<object> |  | The data point of GMV trend |
| ^^^gmv | object |  | If stats_type is TREND_GMV, it will return the value of GMV in the current timestamp |
| ^^^^amount | string |  | The amount of GMV |
| ^^^^currency | string |  | Currency Code |
| ^^^order_count | integer |  | If stats_type is TREND_CREATED_ORDER, it will return the  order count in current timestamp |
| ^^^timestamp | integer |  | timestamp |
| ^^stats_type | string |  | The stats_type describes the type of value below. TREND_GMV :the GMV of the live streaming room TREND_CREATED_ORDER : the order created in the live streaming room |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetInteractiveTrendPerformances

This API gets interactive performance trend data.

**Path:** `/analytics/202309/live_rooms/{live_room_id}/interactive_trend_performances`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-interactive-trend-performances-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^interactive_trend_performances | array<object> |  | The trend data of living room |
| ^^data_points | array<object> |  | The data point of interactive trend |
| ^^^timestamp | integer |  | The time of the data points |
| ^^^value | string |  | The value of the interaction information within the livestream room |
| ^^stats_type | string |  | The stats_type describes the type of value below. WATCH_PV:  the watch count of the live streaming room COMMENT_PV: the comment count of the live streaming room SHARE_PV: the share count of the live streaming room |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetProductStats

This API gets the product list of live room

**Path:** `/analytics/202309/live_rooms/{live_room_id}/product_stats`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-product-stats-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^product_stats | array<object> |  | The stats of the live streaming room, e.g. GMV |
| ^^click_order_rate | string |  | Product paid SKU orders/Product clicks |
| ^^click_through_rate | string |  | The ratio of product clicks to product impressions |
| ^^created_order_count | integer |  | The number of orders created for this product by users from the livestream |
| ^^created_order_user_count | integer |  | Number of unique users who created orders for this product |
| ^^exposure_count | integer |  | The number of impressions of this product, including in the product list and product cards |
| ^^inventory_consumption_count | integer |  | The number of product units sold |
| ^^inventory_left_count | integer |  | The remaining inventory of the product |
| ^^is_live | boolean |  | If the item is currently on sale in the livestream room |
| ^^local_gmv | object |  | The revenue of products using local currency |
| ^^^amount | string |  | The amount of GMV |
| ^^^currency | string |  | Currency Code |
| ^^local_unit_price | object |  | The average price of the units sold using local currency |
| ^^^amount | string |  | The amount of unit price |
| ^^^currency | string |  | Currency Code |
| ^^main_image_url | string |  | The main image of product URL |
| ^^paid_order_count | integer |  | The number of SKU orders created and paid by users for this product from the livestream room |
| ^^paid_user_count | integer |  | Number of unique users who paid orders for this product |
| ^^product_id | string |  | Unique ID for each product |
| ^^product_name | string |  | Product name |
| ^^sellable_region | string |  | The region where products sells |
| ^^total_click_count | integer |  | The total number of times the product was clicked from this livestream, including from the product list and product card |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTrafficPerformances

This API gets the  traffic performances of live streaming for distribution analysis

**Path:** `/analytics/202309/live_rooms/{live_room_id}/traffic_performances`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-traffic-performances-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^traffic_performances | array<object> |  | The traffic performances within the livestream room |
| ^^source | object |  | The source of traffic performances within the live room |
| ^^^name | string |  | The name of the live source |
| ^^^watch_pv | integer |  | Watch page value, e.g. Watch count |
| ^^sub_sources | array<object> |  | The sub source of the source |
| ^^^name | string |  | The name of the live sub source |
| ^^^watch_pv | integer |  | Watch page value, e.g. Watch count |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetUserPortraits

This API gets the user portrait of live room

**Path:** `/analytics/202309/live_rooms/{live_room_id}/user_portraits`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-user-portraits-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^all_ads_age_indicators | array<object> |  | Age indicators for advertisement |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_AGE_LESS_THAN_15: The user portrait whose age is less than 15 USER_PORTRAIT_AGE_MORE_THAN_34: The user portrait whose age is less than 34 USER_PORTRAIT_AGE_MORE_THAN_55: The user portrait whose age is less than 55 USER_PORTRAIT_AGE_13_TO_17: The user portrait whose age is between 13 and 17 USER_PORTRAIT_AGE_15_TO_17: The user portrait whose age is between 15 and 17 USER_PORTRAIT_AGE_18_TO_24: The user portrait whose age is between 18 and 24 USER_PORTRAIT_AGE_25_TO_34: The user portrait whose age is between 25 and 34 USER_PORTRAIT_AGE_35_TO_44: The user portrait whose age is between 35 and 44 USER_PORTRAIT_AGE_45_TO_54: The user portrait whose age is between 45 and 54 |
| ^^value | string |  | The number of type |
| ^all_ads_gender_indicators | array<object> |  | Gender indicators for advertisement |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_GENDER_UNKNOWN: The user portrait of the unknown gender USER_PORTRAIT_GENDER_M: The user portrait of the man USER_PORTRAIT_GENDER_F: The user portrait of the female |
| ^^value | string |  | The number of type |
| ^all_fan_indicators | array<object> |  | Fans indicators |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_FOLLOWER: The user portrait of the follower USER_PORTRAIT_NON_FOLLOWER: The user portrait of the non follower |
| ^^value | string |  | The number of type |
| ^paid_ads_age_indicators | array<object> |  | Paid advertisement age indicators for advertisement |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_AGE_LESS_THAN_15: The user portrait whose age is less than 15 USER_PORTRAIT_AGE_MORE_THAN_34: The user portrait whose age is less than 34 USER_PORTRAIT_AGE_MORE_THAN_55: The user portrait whose age is less than 55 USER_PORTRAIT_AGE_13_TO_17: The user portrait whose age is between 13 and 17 USER_PORTRAIT_AGE_15_TO_17: The user portrait whose age is between 15 and 17 USER_PORTRAIT_AGE_18_TO_24: The user portrait whose age is between 18 and 24 USER_PORTRAIT_AGE_25_TO_34: The user portrait whose age is between 25 and 34 USER_PORTRAIT_AGE_35_TO_44: The user portrait whose age is between 35 and 44 USER_PORTRAIT_AGE_45_TO_54: The user portrait whose age is between 45 and 54 |
| ^^value | string |  | The number of type |
| ^paid_ads_gender_indicators | array<object> |  | Paid advertisement gender indicators for advertisement |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_GENDER_UNKNOWN: The user portrait of the unknown gender USER_PORTRAIT_GENDER_M: The user portrait of the man USER_PORTRAIT_GENDER_F: The user portrait of the female |
| ^^value | string |  | The number of type |
| ^paid_fan_indicators | array<object> |  | Paid fans indicators |
| ^^type | string |  | The stats_type describes the type of value below. USER_PORTRAIT_FOLLOWER: The user portrait of the follower USER_PORTRAIT_NON_FOLLOWER: The user portrait of the non follower |
| ^^value | string |  | The number of type |
| ^region_indicators | array<object> |  | Region indicators |
| ^^type | string |  | The country of indicators |
| ^^value | string |  | The share rate of region, times 10,000 |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetViewTrendPerformances

Use this API to retrieve the viewer counts and trends of a live room

**Path:** `/analytics/202309/live_rooms/{live_room_id}/view_trend_performances`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-view-trend-performances-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_room_id | string | Y | live stream room id |

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
| ^view_trend_performances | array<object> |  | Viewer count trends of the live streaming room |
| ^^data_points | array<object> |  | The data point of view trend |
| ^^^timestamp | integer |  | Unix timestamp GMT (UTC+00:00). This timestamp is used across all API requests. Developers can use this convert to local time. |
| ^^^value | string |  | the value of viewer information |
| ^^stats_type | string |  | The stats_type describes the type of value below. TREND_ONLINE_VIEWER:the viewers who are watching the live streaming room TREND_ENTER_VIEWER: the viewers who enter  the live streaming room TREND_LEFT_VIEWER: the viewers who left the live streaming room |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetVideoPerformances

This is a US-creator-only API for now. And it is for  getting Tiktok E-commerce video metrics(incliding anchor_display_rate, ctr, orders, items_sold, gmv) to analysis.

**Path:** `/analytics/202403/videos/performances`
**Method:** `GET`
**Version:** 202403
**Docs:** https://partner.tiktokshop.com/docv2/page/get-video-performances-202403

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_ids | string | Y | Collection of video IDs for retrieving the e-commerce metrics. Callers must ensure that all video IDs share the same author ID. Limit collection size 100. Use "," to separate array elements when send in the query. |
| start_time_ge | integer | Y | Start date for the metrics, set with a one-day delay from today due to latency in the data pipeline. The start_time parameter must be within the last 180 days from the current date. Only date value is processed, hour/mininute/second values will be ignored. For example, if the start_time value is: 1703507696 ("26-12-2023 04:34:56"), backend service will only consider the part "26-12-2023" when doing the query because by default, in offline data analytics, there is no hour/min/sec data level. |
| end_time_le | integer | Y | End date for the metrics, set with a one-day delay from today due to latency in the data pipeline. Only date value is processed, hour/mininute/second values will be ignored. |

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
| ^videos | array<object> |  | Contains a list of video objects. The inner list of objects will be organized in ascending order based on the video_id field. |
| ^^id | string |  | Each video ID in the request parameter corresponds to array of daily metrics. |
| ^^performances | array<object> |  | The list of objects within will be arranged in ascending order based on the start_time field. |
| ^^^metrics | object |  | Metrics object. |
| ^^^^anchor_display_rate | string |  | Display rate for anchors, specified with two decimal numbers. |
| ^^^^click_through_rate | string |  | Click through rate, specified with two decimal numbers. |
| ^^^^gmv | object |  | GMV object |
| ^^^^item_sold_count | integer |  | Number of sold items in this date. |
| ^^^^order_count | integer |  | Number of orders in this date. |
| ^^^time_range | object |  | Time range object |
| ^^^^end_time | integer |  | Date of the metrics. |
| ^^^^start_time | integer |  | Date of the metrics. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopPerformance

Returns performance metrics at shop/seller level.

**Path:** `/analytics/202405/shop/performance`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-performance-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the shop. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals" It contains data for the previous time range with the same range length and granularity of the current time range Example, if current time range (represented in start_time_ge and end_time_lt) is from 2024-04-01 to 2024-04-08) with granularity "ALL", the previous_intervals will contain data from 2024-03-25 to 2024-04-01 with granularity "ALL". |
| ^^^avg_order_value | object |  | Average value of an order for the shop. |
| ^^^^amount | string |  | Average order value amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^avg_product_page_visitor_breakdowns | array<object> |  | Average daily product page visitor breakdowns. |
| ^^^^amount | integer |  | Average number of unique visitors per day for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^avg_product_page_visitors | integer |  | Average number of unique visitors per day for the shop. |
| ^^^buyer_breakdowns | array<object> |  | Buyer breakdowns. |
| ^^^^amount | integer |  | Number of unique buyers for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^buyers | integer |  | Number of unique buyers for the shop. |
| ^^^cancellations_and_returns | integer |  | Total number of items that were canceled or returned for the shop. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall GMV for the shop. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdowns | array<object> |  | GMV breakdowns for the shop. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^orders | integer |  | Total (sum of all) orders for the shop. |
| ^^^product_impression_breakdowns | array<object> |  | Product impression breakdowns. |
| ^^^^amount | integer |  | Total product impressions for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^product_impressions | integer |  | Total product impressions for the shop. |
| ^^^product_page_view_breakdowns | array<object> |  | Product page view breakdowns. |
| ^^^^amount | integer |  | Total product detail page views for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^product_page_views | integer |  | Total product detail page views for the shop. |
| ^^^refunds | object |  | Total value of refunds for the shop. |
| ^^^^amount | string |  | Refunds in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | Number of SKUs in orders placed for the shop. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold for the shop. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^avg_order_value | object |  | Average value of an order for the shop. |
| ^^^^amount | string |  | Average order value amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^avg_product_page_visitor_breakdowns | array<object> |  | Average daily product page visitor breakdowns. |
| ^^^^amount | integer |  | Average number of unique visitors per day for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^avg_product_page_visitors | integer |  | Average number of unique visitors per day for the shop. |
| ^^^buyer_breakdowns | array<object> |  | Buyer breakdowns. |
| ^^^^amount | integer |  | Number of unique buyers for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^buyers | integer |  | Number of unique buyers for the shop. |
| ^^^cancellations_and_returns | integer |  | Total number of items that were canceled or returned for the shop. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the shop. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdowns | array<object> |  | GMV breakdowns for the shop. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^orders | integer |  | Total (sum of all) orders for a shop. |
| ^^^product_impression_breakdowns | array<object> |  | Product impression breakdowns. |
| ^^^^amount | integer |  | Total product impressions for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^product_impressions | integer |  | Total product impressions for the shop. |
| ^^^product_page_view_breakdowns | array<object> |  | The total number of views for your product detail page when viewers clicked product links for the corresponding type. |
| ^^^^amount | integer |  | The total number of views for your product detail page when viewers clicked product links for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^product_page_views | integer |  | The total number of views for your product detail page when viewers clicked product links. |
| ^^^refunds | object |  | Total value of refunds for the shop. |
| ^^^^amount | string |  | Refunds in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | Number of Stock Keeping Units (SKUs) in orders placed. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold for the shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProductPerformanceList

Returns a list of product performance metrics.

**Path:** `/analytics/202405/shop_products/performance`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-product-performance-list-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Sort on. Available values: gmv, order_count, unit_sold_count, click_through_rate Default value: gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^products | array<object> |  | List of product performance metrics. |
| ^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of product impressions in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the product. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | integer |  | Product ID |
| ^^orders | integer |  | Total (sum of all) orders for the product. |
| ^^units_sold | integer |  | Number of units sold for the product. |
| ^total_count | integer |  | Total number of products. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProductPerformanceDetail

Returns performance metrics for a product.

**Path:** `/analytics/202405/shop_products/{product_id}/performance`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-product-performance-detail-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | product id |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the product. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals" It contains data for the previous time range with the same range length and granularity of the current time range Example, if current time range (represented in start_time_ge and end_time_lt) is from 2024-04-01 to 2024-04-08) with granularity "ALL", the previous_intervals will contain data from 2024-03-25 to 2024-04-01 with granularity "ALL" |
| ^^^avg_page_visitor_breakdowns | array<object> |  | Average daily product page visitor breakdowns. |
| ^^^^amount | integer |  | Average number of unique visitors per day for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^avg_page_visitors | integer |  | Average number of unique visitors per day for the product. |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of product impressions in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^click_through_rate_breakdowns | array<object> |  | Click through rate breakdowns. |
| ^^^^amount | string |  | Click through rate for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall GMV for the product. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdowns | array<object> |  | GMV breakdowns for the product. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^impression_breakdowns | array<object> |  | Impression breakdowns. |
| ^^^^amount | integer |  | Total impressions for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^impressions | integer |  | Total impressions for the product. |
| ^^^orders | integer |  | Total (sum of all) orders for the product. |
| ^^^page_view_breakdowns | array<object> |  | Page view breakdowns. |
| ^^^^amount | integer |  | Total page views for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^page_views | integer |  | Total page views for the product. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^unit_sold_breakdowns | array<object> |  | Unit sold breakdowns. |
| ^^^^amount | integer |  | Number of units sold for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^units_sold | integer |  | Number of units sold for the product. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^avg_page_visitor_breakdowns | array<object> |  | Average daily product page visitor breakdowns. |
| ^^^^amount | integer |  | Average number of unique visitors per day for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^avg_page_visitors | integer |  | Average number of unique visitors per day for the product. |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of product impressions in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^click_through_rate_breakdowns | array<object> |  | Click through rate breakdowns. |
| ^^^^amount | string |  | Click through rate for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the product. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdowns | array<object> |  | GMV breakdowns for the product. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^impression_breakdowns | array<object> |  | Impression breakdowns. |
| ^^^^amount | integer |  | Total impressions for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^impressions | integer |  | Total impressions for the product. |
| ^^^orders | integer |  | Total (sum of all) orders for the product. |
| ^^^page_view_breakdowns | array<object> |  | Page view breakdowns. |
| ^^^^amount | integer |  | Total page views for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^page_views | integer |  | Total page views for the product. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^unit_sold_breakdowns | array<object> |  | Unit sold breakdowns. |
| ^^^^amount | integer |  | Number of units sold for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^units_sold | integer |  | Number of units sold for the product. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopSKUPerformanceList

Returns a list of SKU performance metrics.

**Path:** `/analytics/202406/shop_skus/performance`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-skuperformance-list-202406

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| end_date_lt | string | Y | End time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| page_size | integer |  | Number of records per page. The maximum page_size value is 100 |
| sort_field | string |  | Sort field, possible values: -  gmv (default) - sku_orders - units_sold |
| sort_order | string |  | Sort direction, possible values: - DESC (default) - ASC |
| page_token | string |  | Page token, indicating the current position. The page_token is empty by default, indicating first position. |
| product_id | string |  | Filter SKUs by product ID. If a product_id is provided, the API will only return SKUs for the given product ID, otherwise it will return all SKUs for the shop |
| currency | string |  | Currency: - USD: US dollars - LOCAL (default): Local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^skus | array<object> |  | List of SKU performance metrics. |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the SKU. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | integer |  | SKU ID |
| ^^product_id | integer |  | Product ID |
| ^^sku_orders | integer |  | Total (sum of all) orders for a SKU |
| ^^units_sold | integer |  | Number of units sold for a SKU |
| ^total_count | integer |  | Total number of SKUs. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopSKUPerformance

Return SKU performance metrics.

**Path:** `/analytics/202406/shop_skus/{sku_id}/performance`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-skuperformance-202406

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sku_id | string | Y | SKU ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| end_date_lt | string | Y | End time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. true \| false. Default value is false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_date_ge = 2024-04-01 and end_date_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency: - USD: US dollars - LOCAL (default): Local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the product. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals" It contains data for the previous time range with the same range length and granularity as the current time range Example, if current time range (represented in start_time_ge and end_time_lt) is from 2024-04-01 to 2024-04-08) with granularity "ALL", the previous_intervals will contain data from 2024-03-25 to 2024-04-01 with granularity "ALL" |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall GMV for the SKU. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdown | array<object> |  | GMV breakdowns for the SKU. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^sku_orders | integer |  | Total (sum of all) orders for the SKU. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold for the SKU. |
| ^^^units_sold_breakdown | array<object> |  | Unit sold breakdowns. |
| ^^^^amount | integer |  | Number of units sold for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the SKU. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdown | array<object> |  | GMV breakdowns for the SKU. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^sku_orders | integer |  | Total (sum of all) orders for the SKU. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold for the SKU. |
| ^^^units_sold_breakdown | array<object> |  | Unit sold breakdowns. |
| ^^^^amount | integer |  | Number of units sold for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^product_id | integer |  | Product ID |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceOverview

Returns overall performance metrics for all videos under a shop.

**Path:** `/analytics/202409/shop_videos/overview_performance`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-overview-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, LINKED_ACCOUNTS, AFFILIATES Default value: ALL * ALL: all account types * LINKED_ACCOUNTS: linked account types, includes official and marketing account types * AFFILIATES: affiliate account type |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for videos. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals" It contains data for the previous time range with the same range length and granularity of the current time range Example, if current time range (represented in start_time_ge and end_time_lt) is from 2024-09-01 to 2024-09-08) with granularity "ALL", the previous_intervals will contain data from 2024-08-25 to 2024-09-01 with granularity "ALL" |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid SKU orders placed directly from all shoppable videos. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold from videos. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid SKU orders placed directly from all shoppable videos. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | Number of units sold from videos. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceList

Returns a list of videos and associated metrics for a shop.

**Path:** `/analytics/202409/shop_videos/performance`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-list-202409

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Sort on. Available values: gmv, sku_orders, units_sold, views, click_through_rate Default value: gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, LINKED_ACCOUNTS, AFFILIATES Default value: ALL * ALL: all account types * LINKED_ACCOUNTS: linked account types, includes official and marketing account types * AFFILIATES: affiliate account type |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^total_count | integer |  | Total number of videos. |
| ^videos | array<object> |  | List of video performance metrics. |
| ^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the video. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | string |  | Video ID |
| ^^products | array<object> |  | List of products promoted in the video. |
| ^^^id | string |  | Product ID. |
| ^^^name | string |  | Product Name. |
| ^^sku_orders | integer |  | The total number of paid SKU orders placed directly from the current video. |
| ^^title | string |  | Video Title |
| ^^units_sold | integer |  | Number of units sold from the current video. |
| ^^username | string |  | User name. |
| ^^video_post_time | string |  | Date and time video was posted (ISO 8601 format) |
| ^^views | integer |  | Number of video views during the selected time range. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceDetails

Returns detailed performance metrics for a (requested) video.

**Path:** `/analytics/202409/shop_videos/{video_id}/performance`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-details-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_id | string | Y | Video ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^engagement_data | object |  | Engagement data for the video. |
| ^^total_comments | integer |  | Total number of video comments since the video was published. |
| ^^total_likes | integer |  | Total number of video likes since the video was published. |
| ^^total_shares | integer |  | Total number of video shares since the video was published. |
| ^^total_views | integer |  | Total number of video views since the video was published. |
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the video. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals" It contains data for the previous time range with the same range length and granularity of the current time range Example, if current time range (represented in start_time_ge and end_time_lt) is from 2024-09-01 to 2024-09-08) with granularity "ALL", the previous_intervals will contain data from 2024-08-25 to 2024-09-01 with granularity "ALL" |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^daily_avg_buyers | string |  | Average number of buyers per day from the video during the selected time range. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the video. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^views | integer |  | Total number of video views during the selected time range. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^daily_avg_buyers | string |  | Average number of buyers per day from the video during the selected time range. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the video. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^views | integer |  | Total number of video views during the selected time range. |
| ^^video_post_time | string |  | Date and time video was posted (ISO 8601 format) |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoProductPerformanceList

Returns performance metrics for a list of products promoted in a given video.

**Path:** `/analytics/202409/shop_videos/{video_id}/products/performance`
**Method:** `GET`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-product-performance-list-202409

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_id | string | Y | Video ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Sort on. Available values: gmv, units_sold, daily_avg_buyers Default value: gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^products | array<object> |  | List of product performance metrics. |
| ^^daily_avg_buyers | string |  | Average number of buyers per day for the current product. |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the product. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | string |  | Product ID |
| ^^name | string |  | Product Name |
| ^^units_sold | integer |  | Number of units sold for the current product. |
| ^total_count | integer |  | Total number of videos. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceOverviewOLD

Returns overall performance metrics for all LIVE stream sessions under a certain shop.

**Path:** `/analytics/202503/shop_lives/overview_performance`
**Method:** `POST`
**Version:** 202503
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-overview-old-202503

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for livestream. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals." It contains data for the previous time range with the same range length and granularity of the current time range. For example, if the current time range (represented in start_time_ge and end_time_lt) is from 2024-09-01 to 2024-09-08, with granularity "ALL", the comparison_intervals will contain data from 2024-08-25 to 2024-09-01 with granularity "ALL" |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in LIVEs. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^click_to_order_rate | string |  | The percentage of times viewers clicked product links in LIVEs and placed a direct order. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from all LIVEs. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid orders from all LIVEs during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in LIVEs. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^click_to_order_rate | string |  | The percentage of times viewers clicked product links in LIVEs and placed a direct order. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from all LIVEs. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid orders from all LIVEs during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceListOLD

Returns a list of LIVE stream sessions and associated metrics for a shop.

**Path:** `/analytics/202505/shop_lives/performance`
**Method:** `POST`
**Version:** 202505
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-list-old-202505

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | string |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Field to sort on. Default: gmv Available values: |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, MARKETING_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^live_stream_sessions | array<object> |  | List of live performance metrics. |
| ^^end_time | string |  | End time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^id | string |  | ID of the LIVE |
| ^^interaction_performance | object |  | This object will return only when the account type is: |
| ^^^acu | integer |  | Average concurrent users |
| ^^^avg_viewing_duration | string |  | The average time each user spent watching LIVEs. Total viewing time divided by number of views, in seconds. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in this LIVE. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^comments | integer |  | Number of comments on the LIVE video posted during the selected period. |
| ^^^likes | integer |  | The number of likes a LIVE video received during the selected time period. |
| ^^^new_followers | integer |  | The number of viewers who followed creators from the video during the selected period. |
| ^^^pcu | integer |  | Peak concurrent users |
| ^^^product_clicks | integer |  | Number of product clicks during the LIVE video posted during the selected period, including clicks on product lists and product cards. |
| ^^^product_impressions | integer |  | Number of product impressions during the LIVE video posted during the selected period, including product lists and product cards |
| ^^^shares | integer |  | Number of times the LIVE video posted during the selected period were shared. |
| ^^^viewers | integer |  | Number of unique viewers of the LIVE video posted during the selected period. |
| ^^^views | integer |  | Number of views for the LIVE video posted during the selected period. |
| ^^sales_performance | object |  | Sale performance data of the LIVE related to the shop |
| ^^^24h_live_gmv | object |  | The total amount paid for orders within 24 hours of viewing this LIVE, including returns and refunds. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^avg_price | object |  | The total price paid for all items divided by the number of items sold. |
| ^^^^amount | string |  | The average price paid for all items divided by the number of items sold. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^click_to_order_rate | string |  | The percentage of customers who clicked product links from this LIVE and purchased those products. Number of purchases divided by the number of product clicks, multiplied by 100. |
| ^^^created_sku_orders | integer |  | The total number of orders created during the selected period, including those with pending payment for cash-on-delivery or PayLater. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from this LIVE. |
| ^^^different_products_sold | integer |  | The number of products for which sales were generated from the livestream |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the live. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^products_added | integer |  | The number of products added to the LIVE. |
| ^^^sku_orders | integer |  | The total number of paid orders from this LIVE during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^unit_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^start_time | string |  | Start time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^title | string |  | Title of the LIVE |
| ^^username | string |  | The host's username |
| ^next_page_token | string |  | Page token for the next page request. |
| ^total_count | integer |  | Total number of LIVE stream sessions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceOverview

Returns overall performance metrics for all LIVE stream sessions under a certain shop.

**Path:** `/analytics/202508/shop_lives/overview_performance`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-overview-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| with_comparison | boolean |  | Whether previous period data is returned for comparison. Available values: true, false Default value: false The previous period has the same length and granularity as the current period with end time being the same as the start time of the current period. Example: If start_time_ge = 2024-04-01 and end_time_lt = 2024-04-08, the previous period data will be from 2024-03-25 to 2024-04-01. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for livestream. |
| ^^comparison_intervals | array<object> |  | Same structure as "intervals." It contains data for the previous time range with the same range length and granularity of the current time range. For example, if the current time range (represented in start_time_ge and end_time_lt) is from 2024-09-01 to 2024-09-08, with granularity "ALL", the comparison_intervals will contain data from 2024-08-25 to 2024-09-01 with granularity "ALL" |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in LIVEs. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^click_to_order_rate | string |  | The percentage of times viewers clicked product links in LIVEs and placed a direct order. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from all LIVEs. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid orders from all LIVEs during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in LIVEs. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^click_to_order_rate | string |  | The percentage of times viewers clicked product links in LIVEs and placed a direct order. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from all LIVEs. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^sku_orders | integer |  | The total number of paid orders from all LIVEs during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^units_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceList

Returns a list of LIVE stream sessions and associated metrics for a shop.

**Path:** `/analytics/202508/shop_lives/performance`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-list-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Field to sort on. Default: gmv Available values: - gmv - products_added - different_products_sold - sku_orders - unit_sold - customers - 24h_live_gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^live_stream_sessions | array<object> |  | List of live performance metrics. |
| ^^end_time | string |  | End time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^id | string |  | ID of the LIVE |
| ^^interaction_performance | object |  | This object will return only when the account type is: - OFFICIAL_ACCOUNTS: - MARKETING_ACCOUNTS |
| ^^^acu | integer |  | Average concurrent users |
| ^^^avg_viewing_duration | string |  | The average time each user spent watching LIVEs. Total viewing time divided by number of views, in seconds. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in this LIVE. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^comments | integer |  | Number of comments on the LIVE video posted during the selected period. |
| ^^^likes | integer |  | The number of likes a LIVE video received during the selected time period. |
| ^^^new_followers | integer |  | The number of viewers who followed creators from the video during the selected period. |
| ^^^pcu | integer |  | Peak concurrent users |
| ^^^product_clicks | integer |  | Number of product clicks during the LIVE video posted during the selected period, including clicks on product lists and product cards. |
| ^^^product_impressions | integer |  | Number of product impressions during the LIVE video posted during the selected period, including product lists and product cards |
| ^^^shares | integer |  | Number of times the LIVE video posted during the selected period were shared. |
| ^^^viewers | integer |  | Number of unique viewers of the LIVE video posted during the selected period. |
| ^^^views | integer |  | Number of views for the LIVE video posted during the selected period. |
| ^^sales_performance | object |  | Sale performance data of the LIVE related to the shop |
| ^^^24h_live_gmv | object |  | The total amount paid for orders within 24 hours of viewing this LIVE, including returns and refunds. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^avg_price | object |  | The total price paid for all items divided by the number of items sold. |
| ^^^^amount | string |  | The average price paid for all items divided by the number of items sold. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^click_to_order_rate | string |  | The percentage of customers who clicked product links from this LIVE and purchased those products. Number of purchases divided by the number of product clicks, multiplied by 100. |
| ^^^created_sku_orders | integer |  | The total number of orders created during the selected period, including those with pending payment for cash-on-delivery or PayLater. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from this LIVE. |
| ^^^different_products_sold | integer |  | The number of products for which sales were generated from the livestream |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the live. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^products_added | integer |  | The number of products added to the LIVE. |
| ^^^sku_orders | integer |  | The total number of paid orders from this LIVE during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^unit_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^start_time | string |  | Start time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^title | string |  | Title of the LIVE |
| ^^username | string |  | The host's username |
| ^next_page_token | string |  | Page token for the next page request. |
| ^total_count | integer |  | Total number of LIVE stream sessions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopPerformance

Returns performance metrics at shop/seller level.

**Path:** `/analytics/202509/shop/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-performance-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the shop. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^sales | object |  | Sales performance within the interval. |
| ^^^^avg_customers_count | integer |  | Daily average number of unique users who paid for orders during the selected period. |
| ^^^^gmv | object |  | Gross merchandise value: Total amount paid for orders during the selected period, including canceled and refunded orders. |
| ^^^^gross_revenue | object |  | Gross revenue includes customer payments and platform product subsidies, minus any applicable taxes. Formula: Gross revenue = (Customer payment + Platform product subsidies) − Taxes |
| ^^^^items_sold | integer |  | The total number of individual items sold. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^^^orders_count | integer |  | The number of paid orders during the selected period. |
| ^^^^refunds | object |  | The amount of order refunds generated. |
| ^^^^sku_orders_count | integer |  | A total count of distinct SKUs sold. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^traffic | object |  | traffic data |
| ^^^^avg_conversation_rate | string |  | The daily average percentage of unique users who paid for orders after viewing product detail pages during the selected period. |
| ^^^^avg_page_views | integer |  | Daily average number of page views for all of your product detail pages during the selected period. |
| ^^^^avg_visitors | integer |  | Daily average number of unique users who visited your product detail pages during the selected period |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceOverview

Returns overall performance metrics for all LIVE stream sessions under a certain shop.

**Path:** `/analytics/202509/shop_lives/overview_performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-overview-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| today | boolean |  | If "today" is set to true, start_date_ge and end_date_lt will be overwritten. The response will contain real-time metrics of today (local time) |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for livestream. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in LIVEs. Number of clicks divided by the number of views. |
| ^^^click_to_order_rate | string |  | The percentage of times viewers clicked product links in LIVEs and placed a direct order. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from all LIVEs. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^items_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^^sku_orders | integer |  | The total number of paid orders from all LIVEs during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformanceList

Returns a list of LIVE stream sessions and associated metrics for a shop.

**Path:** `/analytics/202509/shop_lives/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-list-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Field to sort on. Default: gmv Available values: - gmv - products_added - different_products_sold - sku_orders - items_sold - customers - 24h_live_gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^live_stream_sessions | array<object> |  | List of live performance metrics. |
| ^^end_time | string |  | End time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^id | string |  | ID of the LIVE |
| ^^interaction_performance | object |  | This object will return only when the account type is: - OFFICIAL_ACCOUNTS: - MARKETING_ACCOUNTS |
| ^^^acu | integer |  | Average concurrent users |
| ^^^avg_viewing_duration | string |  | The average time each user spent watching LIVEs. Total viewing time divided by number of views, in seconds. |
| ^^^click_through_rate | string |  | The percentage of viewers who clicked on product links after seeing them in this LIVE. Number of clicks divided by the number of views, multiplied by 100. |
| ^^^comments | integer |  | Number of comments on the LIVE video posted during the selected period. |
| ^^^likes | integer |  | The number of likes a LIVE video received during the selected time period. |
| ^^^new_followers | integer |  | The number of viewers who followed creators from the video during the selected period. |
| ^^^pcu | integer |  | Peak concurrent users |
| ^^^product_clicks | integer |  | Number of product clicks during the LIVE video posted during the selected period, including clicks on product lists and product cards. |
| ^^^product_impressions | integer |  | Number of product impressions during the LIVE video posted during the selected period, including product lists and product cards |
| ^^^shares | integer |  | Number of times the LIVE video posted during the selected period were shared. |
| ^^^viewers | integer |  | Number of unique viewers of the LIVE video posted during the selected period. |
| ^^^views | integer |  | Number of views for the LIVE video posted during the selected period. |
| ^^sales_performance | object |  | Sale performance data of the LIVE related to the shop |
| ^^^24h_live_gmv | object |  | The total amount paid for orders within 24 hours of viewing this LIVE, including returns and refunds. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^avg_price | object |  | The total price paid for all items divided by the number of items sold. |
| ^^^^amount | string |  | The average price paid for all items divided by the number of items sold. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^click_to_order_rate | string |  | The percentage of customers who clicked product links from this LIVE and purchased those products. Number of purchases divided by the number of product clicks, multiplied by 100. |
| ^^^created_sku_orders | integer |  | The total number of orders created during the selected period, including those with pending payment for cash-on-delivery or PayLater. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^^customers | integer |  | The total number of customers who placed orders directly from this LIVE. |
| ^^^different_products_sold | integer |  | The number of products for which sales were generated from the livestream |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the live. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^items_sold | integer |  | The total number of individual items sold from all LIVEs. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^^products_added | integer |  | The number of products added to the LIVE. |
| ^^^sku_orders | integer |  | The total number of paid orders from this LIVE during the selected period. This includes SKUs that represent unique product variations like size, colour or model. Example: If a customer orders 3 units of SKU A and 2 units of SKU B, the SKU orders would be 2. |
| ^^start_time | string |  | Start time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^title | string |  | Title of the LIVE |
| ^^username | string |  | The host's username |
| ^next_page_token | string |  | Page token for the next page request. |
| ^total_count | integer |  | Total number of LIVE stream sessions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProductPerformanceList

Returns a list of product performance overview metrics.

**Path:** `/analytics/202509/shop_products/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-product-performance-list-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| sort_field | string |  | Field to sort on. Default: gmv Available values: - gmv - items_sold - orders |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| category_filter | array<string> |  | Category id array |
| product_status_filter | string |  | LIVE INACTIVE ALL (default) |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^products | array<object> |  | List of product performance metrics. |
| ^^id | string |  | Product ID |
| ^^overall_performance | object |  | Product overall sales performance |
| ^^^gmv | object |  | Gross merchandise value: Total amount paid for orders during the selected period, including canceled and refunded orders. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^items_sold | integer |  | Number of items sold. |
| ^^^orders | integer |  | Number of orders. |
| ^total_count | integer |  | Total number of products. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProductPerformanceDetail

Return performance detailed metrics for a product.

**Path:** `/analytics/202509/shop_products/{product_id}/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-product-performance-detail-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | product id |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the product. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^cancel_and_refunds | object |  | cancel and refunds data |
| ^^^^canceled | integer |  | Canceled refers to units included in orders that were either "Unpaid" or "Awaiting Shipment." |
| ^^^^refunded | integer |  | Refunded refers to units that were refunded but not returned. |
| ^^^^replacements | integer |  | Replacements refers to units that were returned and replaced. |
| ^^^^returned | integer |  | Returned refers to units that were returned and refunded. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^sales | object |  | Sales performance within the interval. |
| ^^^^breakdowns | array<object> |  | Sales breakdowns. |
| ^^^^gmv | object |  | Gross merchandise value: Total amount paid for orders during the selected period, including canceled and refunded orders. |
| ^^^^items_sold | integer |  | Number of items sold for the product. |
| ^^^^orders | integer |  | Total (sum of all) orders for the product. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^traffic | object |  | Traffic performance. |
| ^^^^breakdowns | array<object> |  | Traffic breakdowns. |
| ^^ratings | array<object> |  | ratings within the choosen start_date_ge and end_date_ge |
| ^^^count | integer |  | Number of reviews in the corresponding rating. |
| ^^^percentage | string |  | Percentage of the corresponding rating. |
| ^^^stars | string |  | Possible values: - 1_STAR - 2_STAR - 3_STAR - 4_STAR - 5_STAR |
| ^^top_contents | array<object> |  | brief report of product related content within the choosen start_date_ge and end_date_ge. sorted by gmv, only return the top 100. |
| ^^^contents | array<object> |  | Content details |
| ^^^^content_id | string |  | LIVE session ID or video ID |
| ^^^^gmv | object |  | Gross merchandise value. |
| ^^^^items_sold | integer |  | Number of items sold in the corresponding content. |
| ^^^type | string |  | Possible values： - LIVE - VIDEO |
| ^^top_creators | array<object> |  | brief report of product related creator within the choosen start_date_ge and end_date_ge. sorted by gmv, only return the top 100. |
| ^^^creator_name | string |  | Crator name shown on the profile page |
| ^^^creator_open_id | string |  | Creator/s open id, use this open id to identify the unique creator. |
| ^^^creator_profile | string |  | The URL to the creator's profile picture. |
| ^^^gmv | object |  | The GMV created by this creator. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^items_sold | integer |  | Number of items sold by this creator. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopSKUPerformanceList

Returns a list of SKU performance metrics.

**Path:** `/analytics/202509/shop_skus/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-skuperformance-list-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| end_date_lt | string | Y | End time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| page_size | integer |  | Number of records per page. The maximum page_size value is 100 |
| page_token | string |  | Page token, indicating the current position. The page_token is empty by default, indicating first position. |
| sort_field | string |  | Sort field, possible values: -  gmv (default) - sku_orders - units_sold |
| sort_order | string |  | Sort direction, possible values: - DESC (default) - ASC |
| category_filter | array<string> |  | Category id array |
| product_status_filter | string |  | LIVE INACTIVE ALL (default) |
| product_ids | array<string> |  | Filter SKUs by product IDs. If product_ids are provided, the API will only return SKUs for the given product IDs, otherwise it will return all SKUs for the shop |
| currency | string |  | Currency: - USD: US dollars - LOCAL (default): Local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^skus | array<object> |  | List of SKU performance metrics. |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the SKU. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | integer |  | SKU ID |
| ^^product_id | integer |  | Product ID |
| ^^sku_orders | integer |  | Total (sum of all) orders for a SKU |
| ^^units_sold | integer |  | Number of units sold for a SKU |
| ^total_count | integer |  | Total number of SKUs. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopSKUPerformance

Return SKU performance metrics.

**Path:** `/analytics/202509/shop_skus/{sku_id}/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-skuperformance-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sku_id | string | Y | SKU ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| end_date_lt | string | Y | End time (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency: - USD: US dollars - LOCAL (default): Local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the product. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the SKU. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^gmv_breakdown | array<object> |  | GMV breakdowns for the SKU. |
| ^^^^amount | string |  | GMV amount for the corresponding type and currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^items_sold | integer |  | Number of units sold for the SKU. |
| ^^^items_sold_breakdown | array<object> |  | Unit sold breakdowns. |
| ^^^^amount | integer |  | Number of units sold for the corresponding type. |
| ^^^^type | string |  | Breakdown type. Possible values: LIVE, VIDEO, PRODUCT_CARD |
| ^^^sku_orders | integer |  | Total (sum of all) orders for the SKU. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^product_id | integer |  | Product ID |
| ^^sku_id | string |  | SKU ID |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceOverview

Returns overall performance metrics for all videos under a shop.

**Path:** `/analytics/202509/shop_videos/overview_performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-overview-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| today | boolean |  | If "today" is set to true, start_date_ge and end_date_lt will be overwritten. The response will contain real-time metrics of today (local time) |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL - ALL: all account types - OFFICIAL_ACCOUNTS, - MARKETING_ACCOUNTS, - AFFILIATE_ACCOUNTS |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for videos. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^avg_customers | integer |  | Daily average number of customers. |
| ^^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^gmv | object |  | Overall Gross Merchandise Value (GMV) for videos. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^product_clicks | integer |  | The number of product clicks from the video. |
| ^^^product_impressions | integer |  | The number of impressions of all video products. |
| ^^^sku_orders | integer |  | The total number of paid SKU orders placed directly from all shoppable videos. |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceList

Returns a list of videos and associated metrics for a shop.

**Path:** `/analytics/202509/shop_videos/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-list-202509

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Sort on. Default value: gmv Available values: - gmv - gpm - avg_customers - sku_orders - items_sold - views - click_through_rate |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| account_type | string |  | Types of the accounts under which videos were created. Available values: ALL, OFFICIAL_ACCOUNTS, MARKETING_ACCOUNTS, AFFILIATE_ACCOUNTS Default value: ALL - ALL: all account types - OFFICIAL_ACCOUNTS, - MARKETING_ACCOUNTS, - AFFILIATE_ACCOUNTS |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^total_count | integer |  | Total number of videos. |
| ^videos | array<object> |  | List of video performance metrics. |
| ^^avg_customers | integer |  | Daily average customers |
| ^^click_through_rate | string |  | Ratio of the number of product clicks compared to number of video views in raw decimal format. To calculate the percentage, multiple it by 100%. Example: 0.0528 <=> 5.28% |
| ^^duration | integer |  | Video duration in seconds |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the video. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^gpm | object |  | The average GMV generated from 1,000 views of the video. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^hash_tags | array<string> |  | The hash tags of the video |
| ^^id | string |  | Video ID |
| ^^items_sold | integer |  | Number of units sold from the current video. |
| ^^products | array<object> |  | List of products promoted in the video. |
| ^^^id | string |  | Product ID. |
| ^^^name | string |  | Product Name. |
| ^^sku_orders | integer |  | The total number of paid SKU orders placed directly from the current video. |
| ^^title | string |  | Video Title |
| ^^username | string |  | User name. |
| ^^video_post_time | string |  | Date and time video was posted (ISO 8601 format) |
| ^^views | integer |  | Number of video views during the selected time range. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoPerformanceDetails

Returns detailed performance metrics for a (requested) video.

**Path:** `/analytics/202509/shop_videos/{video_id}/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-performance-details-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_id | string | Y | Video ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| granularity | string |  | Granularity of the data. Available values: ALL, 1D Default value: ALL * ALL: aggregate * 1D: daily |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^performance | object |  | Overall performance data for the video. |
| ^^intervals | array<object> |  | Interval data for the requested time range. The time range of each interval is determined by the granularity. |
| ^^^end_date | string |  | End date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, exclusive. |
| ^^^sales | object |  | Sale performance data. |
| ^^^^breakdowns | array<object> |  | bradkdown data |
| ^^^^overall | object |  | Overall performance |
| ^^^start_date | string |  | Start date of the interval (ISO 8601 YYYY-MM-DD format) in shop registered timezone, inclusive. |
| ^^^traffic | object |  | Traffic performance of the video. |
| ^^^^comments | integer |  | The cumulative number of times users left comments on the video |
| ^^^^likes | integer |  | The cumulative number of times users liked the video |
| ^^^^new_followers | integer |  | The number of times a user followed you after watching a video |
| ^^^^shares | integer |  | The cumulative number of times users shared the video |
| ^^^^views | integer |  | The number of times your videos have been watched (if the same user watches a video multiple times, each time is counted) |
| ^^viewer_profile | array<object> |  | Viewer profile of the video |
| ^^^age_distribution | array<object> |  | Viewer age distribution |
| ^^^^age | string |  | Possible values: - 18-24 - 25-34 - 35-44 - 45-54 - 55+ |
| ^^^^percentage | string |  | Percentage of the corresponding age. |
| ^^^country_distribution | array<object> |  | Viewer country distribution. |
| ^^^^country_code | string |  | The region of the viewer's TikTok account. |
| ^^^^percentage | string |  | Percentage of the corresponding country. |
| ^^^gender_distribution | array<object> |  | View gender distribution |
| ^^^^gender | string |  | Possible values: - MALE - FEMALE |
| ^^^^percentage | string |  | Percentage of the corresponding gender. |
| ^^^type | string |  | Possible values: - NEW_FOLLOWER - VIEWERS |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopVideoProductPerformanceList

Returns performance metrics for a list of products promoted in a given video.

**Path:** `/analytics/202509/shop_videos/{video_id}/products/performance`
**Method:** `GET`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-video-product-performance-list-202509

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| video_id | string | Y | Video ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| end_date_lt | string | Y | End date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "lt" refers to "less than" (exclusive) |
| page_size | integer |  | Number of products per page. Max value: 100 Default value: 10 |
| sort_field | string |  | Sort on. Available values: gmv, units_sold, daily_avg_buyers Default value: gmv |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC * ASC: ascending * DESC: descending |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
| page_token | string |  | Page token, indicating the current position. Used for requesting next page data. Leave this field empty for first time queries. |
| start_date_ge | string | Y | Start date (ISO 8601 YYYY-MM-DD format) in shop registered timezone. In the parameter name, "ge" refers to "greater than or equal to" (inclusive) |
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
| ^latest_available_date | string |  | Latest date in local timezone where data is ready (ISO 8601 format). |
| ^next_page_token | string |  | Page token for the next page request. |
| ^products | array<object> |  | List of product performance metrics. |
| ^^daily_avg_buyers | string |  | Average number of buyers per day for the current product. |
| ^^gmv | object |  | Overall Gross Merchandise Value (GMV) for the product. |
| ^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^id | string |  | Product ID |
| ^^name | string |  | Product Name |
| ^^units_sold | integer |  | Number of units sold for the current product. |
| ^total_count | integer |  | Total number of videos. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopPerformancePerHour

Daily performance per hour detail, within 30 days. 
Including today.

**Path:** `/analytics/202510/shop/performance/{date}/performance_per_hour`
**Method:** `GET`
**Version:** 202510
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-performance-per-hour-202510

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| date | string | Y | (ISO 8601 YYYY-MM-DD format) in shop registered timezone. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| currency | string |  | Currency. Available values: USD, LOCAL Default value: LOCAL * USD: US dollars * LOCAL: local currency where the shop is located |
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
| ^performance | object |  | performance data |
| ^^intervals | array<object> |  | intervals data |
| ^^^customers | integer |  | The number of individual customers who made a purchase. This metric counts each customer once, even if they made multiple purchases. |
| ^^^gmv | object |  | gmv data |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^index | integer |  | hour index, 0-23. 0 means 00:00 - 00:59. |
| ^^^items_sold | integer |  | The total number of individual items sold. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^^visitors | integer |  | Number of unique users who visited your product detail pages before the most recent update time. |
| ^^latest_available_timestamp | integer |  | The latest time where data is ready . UNIX timestamp. |
| ^^overall | object |  | overall data |
| ^^^customers | integer |  | The number of individual customers who made a purchase. This metric counts each customer once, even if they made multiple purchases. |
| ^^^gmv | object |  | The total amount paid by customers, including shipping fees, but subtracts platform co-funding and seller promotions. GMV does not subtract cancellations or refunds. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^items_sold | integer |  | The total number of individual items sold. Example: If a customer buys 3 units of SKU A and 2 units of SKU B, the items sold would be 5. |
| ^^^visitors | integer |  | Number of unique users who visited your product detail pages before the most recent update time. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEPerformancePerMinutes

Get the Live session performance break down to every minutes, after the live session is finished.
This API only returns data of live streams hosted by shop official account or marketing account.

**Path:** `/analytics/202510/shop_lives/{live_id}/performance_per_minutes`
**Method:** `GET`
**Version:** 202510
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveperformance-per-minutes-202510

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_id | string | Y | TTS LIVE session ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Page token, indicating the current position. The page_token is empty by default, indicating first position. |
| currency | string |  | USD or LOCAL |
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
| ^next_page_token | string |  | Page token for the next page request. |
| ^performance | object |  | Performance |
| ^^intervals | array<object> |  | Intervals |
| ^^^conversion | object |  | Conversion |
| ^^^^avg_price | object |  | Average direct GMV per main order. Also known as AOV (main order) |
| ^^^^click_to_order_rate | object |  | Click to order rate |
| ^^^^created_sku_orders | integer |  | The number of SKU orders created by users from the LIVE |
| ^^^^gpm | object |  | GPM |
| ^^^^sku_order_rate | string |  | Number of SKU orders from the LIVE divided by the impressions of the LIVE |
| ^^^end_time | integer |  | End time of this interval, unix timestamp GMT (UTC+00:00). |
| ^^^interactions | object |  | Interactions |
| ^^^^comment_rate | string |  | Total number of comments during the LIVE divided by the number of views. |
| ^^^^comments | integer |  | Total number of comments for a LIVE. |
| ^^^^follow_rate | string |  | Number of users that followed the creator during the LIVE divided by the number of views. |
| ^^^^like_rate | string |  | Total number of likes during the LIVE divided by the number of views. |
| ^^^^likes | integer |  | The number of likes in the LIVE room. |
| ^^^^new_followers | integer |  | Number of viewers who followed creator from the LIVE video |
| ^^^^share_rate | string |  | Total number of times the LIVE was shared divided by the total number of views. |
| ^^^^shares | integer |  | Total number of shares of a LIVE. |
| ^^^sales | object |  | Sales performace |
| ^^^^customers | integer |  | The total number of customers who placed orders within this interval, including customers who made returns or refunds. |
| ^^^^gmv | object |  | The total amount paid for orders placed directly within this interval, including returns and refunds. |
| ^^^^items_sold | integer |  | The number of items sold directly within this interval. |
| ^^^^main_orders | integer |  | Total number of paid main orders placed. Main orders refer to the single purchase transaction a customer makes. |
| ^^^^sku_orders | integer |  | The total number of paid SKU orders placed within this interval. |
| ^^^start_time | integer |  | Start time of this interval, unix timestamp GMT (UTC+00:00). |
| ^^^traffic | object |  | Traffic |
| ^^^^ctr | string |  | The number of clicks divided by numbers of views of the LIVE during selected time period including clicks on product lists and product cards |
| ^^^^enter_room_rate | string |  | LIVE views per LIVE room impressions. |
| ^^^^impressions | integer |  | The total number of times the LIVE was displayed to viewers. |
| ^^^^product_clicks | integer |  | Total number of product link clicks from LIVE streams, including product list and product card clicks. |
| ^^^^product_impressions | integer |  | Total number of times a product was viewed in LIVE, including product list and product card clicks. |
| ^^^^viewers | integer |  | The number of viewers within this interval. |
| ^^^^views | integer |  | The number of views or viewings in the LIVE room. |
| ^^overall | object |  | Overall |
| ^^^duration | integer |  | LIVE session duration in seconds |
| ^^^end_time | integer |  | End time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^^gmv | object |  | The total amount paid for orders placed directly from the LIVE, including returns and refunds. |
| ^^^^amount | string |  | GMV amount in the corresponding currency. |
| ^^^^currency | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^impressions | integer |  | The total number of times the LIVE was displayed to viewers. |
| ^^^items_sold | integer |  | The number of items sold directly from the LIVE. |
| ^^^live_title | string |  | LIVE session title |
| ^^^start_time | integer |  | Start time of the LIVE, unix timestamp GMT (UTC+00:00). |
| ^^^unique_viewers | integer |  | The number of unique viewers in the LIVE room. |
| ^total_count | integer |  | Total number of intervals. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopLIVEProductsPerformanceList

Shop related LIVE session (official account & marketing accounts） Sale performance of each product

**Path:** `/analytics/202512/shop/{live_id}/products_performance`
**Method:** `GET`
**Version:** 202512
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-liveproducts-performance-list-202512

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| live_id | string | Y | TTS LIVE session ID |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| sort_order | string |  | Sort direction. Available values: ASC, DESC Default value: DESC |
| sort_field | string |  | Field to sort on. Default: gmv Available values: - direct_gmv - items_sold - customers - created_sku_orders - sku_orders - main_orders - product_impressions - produt_clicks |
| currency | string |  | USD or LOCAL |
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
| ^products | array<object> |  | Overall performance data for the video. |
| ^^id | string |  | Product id |
| ^^name | string |  | Product name |
| ^^sales | object |  | Sales |
| ^^^avg_price | object |  | Average direct GMV per main order. Also known as AOV (main order) |
| ^^^^amount | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^currency | string |  | GMV amount in the corresponding currency. |
| ^^^created_sku_orders | integer |  | The total number of SKU orders created directly from the LIVE for this product. |
| ^^^customers | integer |  | The total numbers of customers who ordered this product directly from the LIVE, including customers who made returns or refunds. |
| ^^^direct_gmv | object |  | The total amount paid for orders of this product directly from the LIVE, including returns and refunds. |
| ^^^^amount | string |  | GMV currency code (ISO 4217 standard). If LOCAL currency is requested, the value will be the local currency code of where the shop is registered (e.g. GBP). |
| ^^^^currency | string |  | GMV amount in the corresponding currency. |
| ^^^items_sold | integer |  | The number of product items sold |
| ^^^main_orders | integer |  | Total number of paid main orders placed. Main orders refer to the single purchase transaction a customer makes. |
| ^^^payment_rate | string |  | Main order paid / Main order created of this product |
| ^^^sku_orders | integer |  | The total number of paid SKU orders placed directly from the LIVE for this product. |
| ^^traffic | object |  | Traffic |
| ^^^add_to_cart_count | integer |  | The number of times viewers add the product to their cart. |
| ^^^click_to_order_rate | object |  | Click to order rate |
| ^^^^main_order_ctor | string |  | Percentage of times viewers who clicked LIVE product links also placed a main order. |
| ^^^^sku_order_ctor | string |  | The percentage of times viewers clicked product links in LIVE streams and placed a direct order. |
| ^^^ctr | string |  | Click-through rate: The number of product clicks for this product from the LIVE video, divided by the number of product impressions for this product from the LIVE video, including product clicks and product impressions for product lists and product cards |
| ^^^gpm | object |  | GPM |
| ^^^^watch_gpm | string |  | The Watch GPM is the average GMV generated from 1,000 views of the LIVE. |
| ^^^product_impressions | integer |  | Number of product impressions for this product during the LIVE video, including for product lists and product cards |
| ^^^produt_clicks | integer |  | The total number of times the product was clicked from this LIVE, including from the product list and product card |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
