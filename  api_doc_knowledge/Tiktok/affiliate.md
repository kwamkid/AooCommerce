# TikTok Shop API — affiliate

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 15 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202402, 202403

---

## GetLiveRoomInfo

Developer can utilize this API to get the creator`s last live room information

**Path:** `/affiliate/202309/live_rooms`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-live-room-info-202309

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
| ^id | string |  | The live room's ID |
| ^start_time | integer |  | The start time of broadcasting |
| ^status | string |  | The live room's status |
| ^title | string |  | The live room's title |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetLIVEProducts

Use this API to retrieve the list of products for a creator's TikTok LIVE if the creator is live streaming. This API can also be used to retrieve the list of products that are prepared for an upcoming TikTok LIVE. There can be as many as 100 products in TikTok LIVE.  Note: This API is generally used for when a creator would like to view the products in their TikTok LIVE.

**Path:** `/affiliate/202309/live_rooms/products`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-liveproducts-202309

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
| ^pinned_product_id | string |  | The product ID that is pinned to the live stream |
| ^products | array<object> |  | The product's detailed info fields |
| ^^commission | object |  | The product's commission info fields |
| ^^^commission_rate | integer |  | The commission rate for this product is set by merchants for creators' public promotion. - The range of this value is [100, 8000]. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^^inclusive_reward_commission_rate | integer |  | The reward commission rate that has already been included in the total commission rate. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^detail_url | string |  | The product detail page URL of a TikTok Shop product |
| ^^id | string |  | The product's TikTok Shop product ID |
| ^^main_images | array<object> |  | The main images of the products |
| ^^^height | integer |  | The image height in pixels |
| ^^^url | string |  | The image's URL |
| ^^^width | integer |  | The image width in pixels |
| ^^original_url | string |  | The original product URL if the product is a third-party product |
| ^^price | object |  | The product's price info fields |
| ^^^original_price | object |  | The original SPU prices of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The original highest SPU price of the product |
| ^^^^lowest_amount | string |  | The original lowest SPU price of the product |
| ^^^platform_discount_price | object |  | The SPU prices with platform discount of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The highest SPU price with platform discount of the product |
| ^^^^lowest_amount | string |  | The lowest SPU price with platform discount of the product |
| ^^^seller_discount_price | object |  | The SPU prices with seller discount of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The highest SPU price with seller discount of the product |
| ^^^^lowest_amount | string |  | The lowest SPU price with seller discount of the product |
| ^^sale_regions | array<string> |  | The regions where the product can be sold |
| ^^shop_name | string |  | The shop name of the seller |
| ^^source | string |  | The source of the product |
| ^^status | object |  | The product's status info fields |
| ^^^added_status | string |  | The product's added status in the LIVE stream. Field values: NOT_ADDED: The product has not been added to showcase, or to the live stream if the origin field in the request is LIVE. ADDED: The product has been added to the showcase, or to the live stream if the origin field in the request is LIVE. REJECTED: The product is rejected and can not be added. |
| ^^^inventory_status | string |  | The inventory status of the product Field values: IN_STOCK: The product is in stock SOLD_OUT: The product has been sold out |
| ^^^review_status | string |  | The review status represents whether the merchant approves the creator of promoting this product. Field values: APPROVED: The product is approved UNDER_REVIEW: The product is still under review CHANGES_UNDER_REVIEW: The updates to this product are still under review. UNAVAILABLE: The product is unavailable. REJECTED: The product is rejected. ZERO_COMMISSION: the product will not contribute to any commission. |
| ^^title | string |  | The product's title |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## AddLIVEProducts

Use this API to add products to a creator's TikTok LIVE if the creator is live streaming. This API can also be used to add products to an upcoming TikTok LIVE.  The platform will return the status of the added products as well as the error code and error message if the operation fails.

**Path:** `/affiliate/202309/live_rooms/products`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/add-liveproducts-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to add to the creator's livebag. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The errors when adding products to showcase |
| ^^code | integer |  | The error code when adding the product to showcase |
| ^^detail | object |  | The error details |
| ^^^product_id | string |  | The failing product ID when adding to the creator's showcase |
| ^^message | string |  | The detailed error message when adding the product to showcase |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveLIVEProducts

Use this API to remove products from a creator's TikTok LIVE if the creator is live streaming. This API can also be used to remove products prepared for an upcoming TikTok LIVE.   The platform will return the error code and error message if the product removal fails.

**Path:** `/affiliate/202309/live_rooms/products`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-liveproducts-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to remove from the creator's TikTok LIVE. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## TopLIVEProducts

Use this API to move products to the top in a creator's TikTok LIVE. This API can also be used to move products to the top for an upcoming TikTok LIVE.   The platform will return the error code and error message if the pinning operation fails.

**Path:** `/affiliate/202309/live_rooms/products/top`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/top-liveproducts-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to move to the top in a creator's TikTok LIVE. If multiple products are provided, they will display according to the order passed in this parameter. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## PinLIVEProduct

Use this API to pin a specified product in the creator's TikTok LIVE. The product will be highlighted in the form of a card in the live stream.  If a new product is pinned in TikTok LIVE, it will replace the existing pinned product.  The platform will return the error code and error message if the pinning operation fails.

**Path:** `/affiliate/202309/live_rooms/products/{product_id}/pin`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/pin-liveproduct-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product IDs to move to the top in a creator's TikTok LIVE. |

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

## UnpinLIVEProduct

Use this API to unpin a specified product in the creator's TikTok LIVE.   If the product is not currently pinned in the live stream, it will return an error.  The platform will return the error code and error message if the unpin operation fails.

**Path:** `/affiliate/202309/live_rooms/products/{product_id}/unpin`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/unpin-liveproduct-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID to unpin in a creator's TikTok LIVE. |

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

## GetCreatorProfileold

This API gets the creator profile information.

**Path:** `/affiliate/202309/profiles`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-creator-profileold-202309

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
| ^avatar | object |  | The avatar image |
| ^^height | integer |  | The image height in pixels |
| ^^url | string |  | The image's URL |
| ^^width | integer |  | The image width in pixels |
| ^partner_id | string |  | The creator's bound partner's ID |
| ^partner_name | string |  | The creator's bound partner's name |
| ^permissions | array<string> |  | The creator's granted permissions |
| ^register_region | string |  | The creator's register region |
| ^selection_region | string |  | Represents the regions in which creators can promote products in their showcases, videos, and live streams. |
| ^seller_type | string |  | The creator's seller type if a creator has linked to a TikTok seller |
| ^user_name | string |  | The creator's username in TikTok App Profile page, like creator_abc123 |
| ^user_type | string |  | The creator's user type |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShopProductslegacy

Developer can utilize this API to search and retrieve products information of shop which is bound by a specific creator with specific keywords.

**Path:** `/affiliate/202309/shop_products`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shop-productslegacy-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | The pagination offset that determines where you begin your search. If you are making your first request, this will be empty. |
| page_size | integer | Y | Pagination count determines how many products you'll get after sending the request. 20 is a recommended number. |
| title_keyword | string |  | The title keyword of the product you wish to search by. |
| sort_field | string |  | Sort fields include PRODUCT_ID, PRICE and SALE. If sort_field is empty or invalid, PRODUCT_ID will be set as default. |
| sort_order | string |  | Sort orders include 0:DESC and 1:ASC. If sort order is empty or invalid, DESC will be set as default. |

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
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetShowcaseProductsold

This API lists the products in the creator's showcase, paginated by specified page size and iterated through pages by page token for up to 2000 products in the showcase. This API is generally used when a creator would like to view the products in the showcase.  The platform will return the product details in the showcase, as well as the products in the livebag if the creator is live streaming.

**Path:** `/affiliate/202309/showcases/products`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-showcase-productsold-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer |  | The maximum number of products returned in the response. Default to be 50 if not set. |
| page_token | string |  | The page token |
| origin | string |  | Where the request is sent from. LIVE: sent from live room. The response will return the product IDs in the LIVE as well. The "add_status" field will be whether the product is in the live bag, or whether the product is in the prelive product preparation list if the creator is not live streaming. SHOWCASE: sent from showcase. The "add_status" field will be whether the product is in the showcase. |

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
| ^live_product_ids | array<string> |  | The product IDs in the livebag among the products returned in this response. |
| ^next_page_token | string |  | Returns the token to get the next page of products if the response does not return all the products, otherwise returns an empty string. |
| ^products | array<object> |  | The product's detailed info fields |
| ^^addition | object |  | The product's additional info fields |
| ^^^customized_main_image | array<object> |  | The product's customized main image |
| ^^^^height | integer |  | The image height in pixels |
| ^^^^url | string |  | The image's URL |
| ^^^^width | integer |  | The image width in pixels |
| ^^commission | object |  | The product's commission info fields |
| ^^^commission_rate | integer |  | The commission rate for this product is set by merchants for creators' public promotion. - The range of this value is [100, 8000]. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^^inclusive_reward_commission_rate | integer |  | The reward commission rate that has already been included in the total commission rate. - This value equals actual commission rate multi 10000. For example: 3000 means the actual commission rate is 30.00%, and 3555 means 35.55% |
| ^^detail_url | string |  | The product detail page URL of a Tiktok product |
| ^^id | string |  | The product's product ID |
| ^^main_images | array<object> |  | The main images of the products |
| ^^^height | integer |  | The image height in pixels |
| ^^^url | string |  | The image's URL |
| ^^^width | integer |  | The image width in pixels |
| ^^original_url | string |  | The original product URL if the product is a third-party product |
| ^^price | object |  | The product's price info fields |
| ^^^original_price | object |  | The original SPU prices of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The original highest SPU price of the product |
| ^^^^lowest_amount | string |  | The original lowest SPU price of the product |
| ^^^platform_discount_price | object |  | The SPU prices with platform discount of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The highest SPU price with platform discount of the product |
| ^^^^lowest_amount | string |  | The lowest SPU price with platform discount of the product |
| ^^^seller_discount_price | object |  | The SPU prices with seller discount of the product |
| ^^^^currency | string |  | The price currency |
| ^^^^highest_amount | string |  | The highest SPU price with seller discount of the product |
| ^^^^lowest_amount | string |  | The lowest SPU price with seller discount of the product |
| ^^sale_regions | array<string> |  | The regions where the product can be sold |
| ^^shop_name | string |  | The shop name of the seller |
| ^^source | string |  | The source of the product. Field values: THIRD_PARTY: the product is from third-party seller AFFILIATE: the product is from TikTok affiliate seller TIKTOK_STORE: the product is from seller's own store |
| ^^status | object |  | The product's status info fields |
| ^^^added_status | string |  | The product's added status in the showcase/livebag according to the provided origin in the request Field values: NOT_ADDED: The product has not been added to showcase, or to the live stream if the origin field in the request is LIVE. ADDED: The product has been added to the showcase, or to the live room if the origin field in the request is LIVE. REJECTED: The product is rejected and can not be added. |
| ^^^inventory_status | string |  | The inventory status of the product Field values: IN_STOCK: The product is in stock SOLD_OUT: The product has been sold out |
| ^^^is_hidden | boolean |  | Whether the product has been hidden by the creator |
| ^^^review_status | string |  | The review status represents whether the merchant approves the creator of promoting this product. Field values: APPROVED: The product is approved UNDER_REVIEW: The product is still under review CHANGES_UNDER_REVIEW: The updates to this product are still under review. UNAVAILABLE: The product is unavailable. REJECTED: The product is rejected. ZERO_COMMISSION: the product will not contribute to any commission. |
| ^^title | string |  | The product's title |
| ^total_count | integer |  | Returns the total number of products in the showcase. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## AddShowcaseProductsold

This API adds the products to the creator's showcase. The platform will return the add status of the products, and error code and error message if the deletion fails.

**Path:** `/affiliate/202309/showcases/products`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/add-showcase-productsold-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to add to the creator's showcase. The products can be added from my bound shop. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The errors when adding products to showcase |
| ^^code | integer |  | The error code when adding the product to showcase |
| ^^detail | object |  | The error details |
| ^^^product_id | string |  | The failing product ID when the product is added to the creator's showcase |
| ^^message | string |  | The detailed error message when adding the product to showcase |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RemoveShowcaseProductsold

This API removes the products in the creator's showcase. The platform will return error code and error message if the deletion fails.

**Path:** `/affiliate/202309/showcases/products`
**Method:** `DELETE`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/remove-showcase-productsold-202309

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_ids | array<string> |  | The product IDs to delete from the creator's showcase. The maximum number of products to delete at once is 200. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## TopShowcaseProductsold

Use this API to move products to the top in a creator's showcase.  The platform will return the error code and error message if the pinning operation fails.

**Path:** `/affiliate/202309/showcases/products/top`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/top-showcase-productsold-202309

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
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckAnchorPrerequisites

The is  a pre-verification interface for creator adding products to video. This interface will verify the creator's permissions and product status, etc.

**Path:** `/affiliate/202402/anchors/prerequisite_check`
**Method:** `POST`
**Version:** 202402
**Docs:** https://partner.tiktokshop.com/docv2/page/check-anchor-prerequisites-202402

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string |  | Product id that wanted to been checked. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CheckAnchorContent

This interface is used for checking anchor contents. The interface currently supports verification of anchor title. It will return error if the title has dirty words, punctuation, emoji or less than 30 characters long.

**Path:** `/affiliate/202403/anchors/content_check`
**Method:** `POST`
**Version:** 202403
**Docs:** https://partner.tiktokshop.com/docv2/page/check-anchor-content-202403

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| title | string |  | Anchor title that you want show in anchor. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
