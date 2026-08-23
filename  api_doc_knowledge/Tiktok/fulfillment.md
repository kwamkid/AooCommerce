# TikTok Shop API — fulfillment

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 29 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202407, 202408, 202502, 202508, 202510, 202512, 202601

---

## SearchCombinablePackages

Use this API to query orders eligible for combined shipping.

**Path:** `/fulfillment/202309/combinable_packages/search`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-combinable-packages-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-50]. |
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
| ^combinable_packages | array<object> |  | List of eligible packages that can be combined. |
| ^^id | string |  | A set of pre-generated package IDs after calling the Search Draft Package API. These package IDs will be used when the package combine is confirmed. |
| ^^order_ids | array<string> |  | List of order IDs for this package. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^total_count | integer |  | The number of orders that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## FulfillmentUploadDeliveryFile

This API is used for the seller to upload the proof of delivery file for a package, and to generate the URL of the corresponding file. The generated URL is used for the [Update Package Delivery Status API](https://partner.tiktokshop.com/docv2/page/650aa332c16ffe02b8f0ba82?external_id=650aa332c16ffe02b8f0ba82). 

This API only supports uploading qualification files in `PDF` format. The file size can not exceed 10MB.

Note: Only sellers utilizing the SOF (Seller Own Fleet) capability can use this API.

**Path:** `/fulfillment/202309/files/upload`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/fulfillment-upload-delivery-file-202309

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
| data | file |  | PDF file data to be uploaded to TikTok Shop. Prerequisites： - Only `PDF` file format is supported. - Original file size must not exceed 10MB. |
| name | string |  | The name of the uploaded file. The file name must include the file type. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^name | string |  | The name of the file. |
| ^url | string |  | The URL returned from uploading the file that can be directly opened in a browser. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## FulfillmentUploadDeliveryImage

This API is used for the seller to upload the proof of delivery image for a package, and to generate the URL of the corresponding file. The generated URL is used in the [Update Package Delivery Status API](https://partner.tiktokshop.com/docv2/page/650aa332c16ffe02b8f0ba82?external_id=650aa332c16ffe02b8f0ba82) to indicate that the parcel has been delivered. 

Usage requirements:
- The image format must be `JPEG`, `PNG`, or `JPG`. 
- The image size can not exceed 5MB.

**Path:** `/fulfillment/202309/images/upload`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/fulfillment-upload-delivery-image-202309

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
| data | file |  | Image file data to be uploaded to TikTok Shop. The picture file is a string generated by base64 encoding. Prerequisites： - Image format must be `JPG`, `JPEG`, or `PNG`. - Image resolution must be between 100 x 100px and 20000 x 20000px. - Image size must not exceed 5MB. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^height | integer |  | The image height returned from uploading the image. This height refers to the processed image height, not the original image height. Units: pixels. |
| ^url | string |  | The URL returned from uploading the image that can be directly opened in a browser. |
| ^width | integer |  | The image width returned from uploading the image. This width refers to the processed image width, not the original image width. Units: pixels. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOrderSplitAttributes

Use this API to check whether an order(s) can be split into multiple packages or not.

**Path:** `/fulfillment/202309/orders/split_attributes`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-order-split-attributes-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_ids | array<string> | Y | Query list of TikTok Shop order IDs. |
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
| ^split_attributes | array<object> |  | Specific return information (can return multiple TikTok Shop order IDs). |
| ^^can_split | boolean |  | Whether an order can be split: - `true`: The order can be split into multiple packages. - `false`: The order cannot be split into multiple packages. |
| ^^must_split | boolean |  | Whether an order must be split: - true: The order must be split into multiple packages. - false: The order does not have to be split into multiple packages. |
| ^^must_split_reasons | array<object> |  | The reason why the order must be split. Only return this field when must_split = true. |
| ^^^category_id | string |  | If the value of reason.type is "CATEGORY_ITEM_LIMITATION", this field will return a value. If the value of reason.type is "TOTAL_COUNT_LIMITATION", this field will return no value |
| ^^^max_count | string |  | For category verification, return the maximum quantity of goods allowed for this category in a single package; for total product quantity verification within the package, return the total quantity limit of goods in a single package. |
| ^^^type | string |  | It will return which type of verification is hit. There are two types of verification: CATEGORY_ITEM_LIMITATION means category verification and TOTAL_COUNT_LIMITATION means total product quantity verification. |
| ^^order_id | string |  | TikTok Shop order ID. |
| ^^reason | string |  | The reason why the order cannot be split. Only return this field when `can_split = false`. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetHandoverTimeslots

Use this API to retrieve the time slots available for pickup, drop off or van collection for the seller's specified package by using order ID and order line item ID.

**Path:** `/fulfillment/202309/orders/{order_id}/handover_time_slots`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-handover-timeslots-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | TikTok shop order ID. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_line_item_ids | array<string> |  | Order line item ID list |
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
| ^can_drop_off | boolean |  | Does this package support point delivery |
| ^can_pickup | boolean |  | Does this package support door-to-door collection |
| ^can_van_collection | boolean |  | Only for UK. Use this field to determine wheather van collection is available |
| ^drop_off_point_url | string |  | View deliverable logistics outlets via URL |
| ^pickup_slots | array<object> |  | Package pickup time slots for door-to-door collection |
| ^^avaliable | boolean |  | Can I make an appointment for this time period? |
| ^^end_time | integer |  | The end date and time of the package pickup time slot. |
| ^^start_time | integer |  | The start date and time of the package pickup time slot. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## MarkPackageAsShipped

**This API is currently exclusive to the following markets: US, UK, ES, IE, IT, DE, FR, JP.**
This API is for sellers who fulfill orders through their own selected/preferred logistics carrier, and allows sellers to upload valid package information (items in packages, shipping provider information, and tracking number) orders/order line items to TikTok Shop. Use [Get Shipping Providers API](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) to retrieve the `shipping_provider_id` for shipping providers.

**Path:** `/fulfillment/202309/orders/{order_id}/packages`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/mark-package-as-shipped-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The unique identifier for a TikTok Shop order. |

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
| order_line_item_ids | array<string> |  | List of order line item IDs. |
| shipping_provider_id | string |  | Use [Get Shipping Provider API](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) to retrieve the `shipping_provider_id` for shipping providers. |
| tracking_number | string |  | Tracking number. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^order_id | string |  | TikTok Shop order ID. |
| ^order_line_item_ids | array<string> |  | List of order line item IDs. |
| ^package_id | string |  | Package ID. |
| ^warning | object |  | Warning message. |
| ^^message | string |  | Specific warning information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateShippingInfo

If the seller entered an incorrect tracking number, this API allows the seller to update the tracking number and shipping provider for an order that has already been shipped.

- This API is only applicable to orders (or packages) shipped by the seller.   
- It is only used to update the tracking number and shipping provider for packages that have already been shipped. 
- For orders that have been split for shipping, please use the [Update Package Shipping Info API](https://partner.tiktokshop.com/docv2/page/650aa666c16ffe02b8f1203c?external_id=650aa666c16ffe02b8f1203c). 

Please note that TikTok Shop only allows merchants to update shipping information within 72 hours after shipping.

**Path:** `/fulfillment/202309/orders/{order_id}/shipping_info/update`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-shipping-info-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | TikTok Shop order ID. |

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
| shipping_provider_id | string |  | Identifies the carrier that will deliver the package. Please call [Get Shipping Providers API](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd#Back%20To%20Top) to retrieve the available shipping provider(s). |
| tracking_number | string |  | The shipment tracking number provided by the carrier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetEligibleShippingService

Use this API ( for US ) to query the list of available shipping services when specifying packages' size or weight. The shipping fee and delivery time is an estimate only and is based on the package dimensions and weight you provided. Options listed may differ if you change the package attributes at the time of shipping.

**Path:** `/fulfillment/202309/orders/{order_id}/shipping_services/query`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-eligible-shipping-service-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | TikTok Shop order ID |

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
| dimension | object |  | The dimensions of the scheduled package. |
| ^height | string |  | The height of the package. The length, width, height must be passed together. |
| ^length | string |  | The length of the package. The length, width, height must be passed together. |
| ^unit | string |  | The unit of measurement is used to measure the length. - CM - INCH |
| ^width | string |  | The width of the package. The length, width, height must be passed together. |
| order_line_item_ids | array<string> |  | Order line item ID list |
| weight | object |  | The weight of the scheduled package. |
| ^unit | string |  | The unit of measurement is used to measure the weight. - GRAM - POUND |
| ^value | string |  | The weight of the scheduled package. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^dimension | object |  | The dimension of the scheduled package. |
| ^^height | string |  | The height of the package. The length, width, height must be passed together. |
| ^^length | string |  | The length of the package. The length, width, height must be passed together. |
| ^^unit | string |  | The unit of measurement is used to measure the length. - CM - INCH |
| ^^width | string |  | The width of the package. The length, width, height must be passed together. |
| ^order_id | string |  | TikTok Shop order ID |
| ^order_line_id | array<string> |  | Line item ID list |
| ^shipping_services | array<object> |  | Shipping services info. |
| ^^currency | string |  | Currency of the price |
| ^^earliest_delivery_days | integer |  | The minimum estimated duration required for parcel delivery. |
| ^^id | string |  | Shipping service ID |
| ^^is_default | boolean |  | Whether it is the default shipping service |
| ^^latest_delivery_days | integer |  | The maximum estimated duration required for parcel delivery. |
| ^^name | string |  | Shipping service Name |
| ^^price | string |  | Estimated price for this service. |
| ^^shipping_provider_id | string |  | The ID of shipping provider |
| ^^shipping_provider_name | string |  | The name of shipping provider |
| ^weight | object |  | The weight of the scheduled package. |
| ^^unit | string |  | The unit of measurement is used to measure the weight. - GRAM - POUND |
| ^^value | string |  | The weight of the scheduled package. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SplitOrders

Use this API to confirm an order split. Note that ​​supported split levels vary by region​​:
- Some regions support ​​item-level splits​​ (splitting individual units of the same SKU).
- Others only support ​​all-units splits​​ (splitting different SKUs into separate packages).

Here are two examples of supported splits:
- ​​**Case 1**: all-units split​​, applicable for orders in BR, SEA, MX (local sellers)
Split a buyer order of SKU A of quantity 2 and SKU B of quantity 1 into two separate packages:
  - ​​Package 1​​: all units of SKU A
​​  - Package 2​​: all units of SKU B

- **​​Case 2**: item-level split​​, applicable for orders in EU, JP, MX (global sellers), UK, US
Split the same order contents into three individual packages:
  - ​​Package 1​​: 1 unit of SKU A
​  - ​Package 2​​: 1 unit of SKU A
​​  - Package 3​​: 1 unit of SKU B

**Path:** `/fulfillment/202309/orders/{order_id}/split`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/split-orders-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | TikTok Shop order ID. |

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
| splittable_groups | array<object> |  | Input list of splittable groups. |
| ^id | string |  | A unique identifier designated by the developer. This identifier will represent a group of items that will be split into a new package. Once split is confirmed, the platform will be assigned a new package ID for this group of items. For example, if you input `123` as request, the response will return `123` as your unique identification. The seller uses this field to label each group of items that have been split, and the platform will assign new package IDs to them. |
| ^order_line_item_ids | array<string> |  | The order line item IDs that need to be split into this group. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^packages | array<object> |  | The number of packages returned is dependent on the number of `splittable_group_ids` you sent in the request. |
| ^^id | string |  | Package ID after success split. Use this new package ID to call [Ship Package API](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1?external_id=650aa4f1defece02be6e7cb1) to ship the package. |
| ^^splittable_group_id | string |  | The ID of split group in request body. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTracking

This API can use the order number to obtain the corresponding logistics tracking information.

**Path:** `/fulfillment/202309/orders/{order_id}/tracking`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-tracking-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | TikTok Shop order ID. |

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
| ^tracking | array<object> |  | The return list of tracking information. |
| ^^description | string |  | Tracking status description. |
| ^^update_time_millis | integer |  | Tracking status update time. Unix timestamp in milliseconds. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatePackages

Use this API to ship orders (purchase labels). This API is region specific to the US. The shipping fee and delivery time is an estimate only and is based on the package dimensions and weight you provided. Based on the package attributes, options listed below may differ from your shipping subscriptions.

**Path:** `/fulfillment/202309/packages`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/create-packages-202309

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
| dimension | object |  | Package dimensions. |
| ^height | string |  | Package height. The length, width, and height must be passed together. |
| ^length | string |  | Package length. The length, width, and height must be passed together. |
| ^unit | string |  | The unit of measurement for the package dimensions. Available values: - `CM` - `INCH` |
| ^width | string |  | Package width. The length, width, and height must be passed together. |
| order_id | string |  | TikTok Shop order ID. |
| order_line_item_ids | array<string> |  | List of order line item IDs. |
| shipping_service_id | string |  | Specify the shipping service used. If not specified, use the default service obtained from [Get Eligible Shipping Service](https://partner.tiktokshop.com/docv2/page/650aa6b2bace3e02b75dda4e). |
| weight | object |  | Package weight. |
| ^unit | string |  | The unit of measurement for the package weight. Available values: - `GRAM` - `POUND` |
| ^value | string |  | The numerical value of the package weight. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^create_time | integer |  | The time when the product was created. Unix timestamp. |
| ^dimension | object |  | Package dimensions. |
| ^^height | string |  | Package height. |
| ^^length | string |  | Package length. |
| ^^unit | string |  | The unit of measurement for the package dimensions. Available values: - `CM` - `INCH` |
| ^^width | string |  | Package width. |
| ^order_id | string |  | TikTok Shop order ID. |
| ^order_line_item_ids | array<string> |  | List of order line item IDs. |
| ^package_id | string |  | Package ID. |
| ^shipping_service_info | object |  | The available shipping service's information. |
| ^^currency | string |  | Currency of the price. |
| ^^earliest_delivery_days | integer |  | The minimum estimated duration required for package delivery. |
| ^^id | string |  | Shipping service ID. |
| ^^latest_delivery_days | integer |  | The maximum estimated duration required for package delivery. |
| ^^name | string |  | Shipping service name. |
| ^^price | string |  | Estimated price for this service. |
| ^^shipping_provider_id | string |  | Shipping provider ID. |
| ^^shipping_provider_name | string |  | Shipping provider name. |
| ^weight | object |  | Package weight. |
| ^^unit | string |  | The unit of measurement for the package weight. Available values: - `GRAM` - `POUND` |
| ^^value | string |  | The numerical value of the package weight. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CombinePackage

Use this API to combine packages into one fulfillment package.

**Path:** `/fulfillment/202309/packages/combine`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/combine-package-202309

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
| combinable_packages | array<object> |  | Input list of combinable packages. |
| ^id | string |  | The package ID. |
| ^order_ids | array<string> |  | The list of order IDs corresponding to a package ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Return list of possible errors. |
| ^^code | integer |  | The failure reason code. |
| ^^detail | object |  | Error detail. |
| ^^^package_id | string |  | Package ID. |
| ^^message | string |  | The failure reason of an unsuccessful combined package action. |
| ^packages | array<object> |  | Return list of successfully combined packages. |
| ^^id | string |  | The new package ID generated after the package has been successfully combined. |
| ^^order_ids | array<string> |  | List of order IDs corresponding to a new combined package ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdatePackageDeliveryStatus

Use this API to update the delivery status of the package from in transit status. Please note that only sellers utilizing the SOF( Seller Own Fleet) capability can use this API to update the package status to 'DELIVERED'. This API is only available for the SEA region.

**Path:** `/fulfillment/202309/packages/deliver`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-package-delivery-status-202309

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
| packages | array<object> |  | The return list of packages. |
| ^delivery_type | string |  | Delivery status of the package. Possible values: - `DELIVERY_SUCCESS`: Package has been successfully delivered. - `DELIVERY_FAILED`: Package delivery has been unsuccessful. - `UPDATE_POD`: For packages that have been delivered, but you would like to update an attachment. |
| ^fail_delivery_reason | string |  | Delivery failure reasons. When `delivery_type = DELIVERY_FAILED`, this field is required. For other delivery types, this field is not required. Possible values: - `INVALID_ADDRESS`: The buyer shipping address is invalid. - `UNABLE_RECEIVE`: The buyer is currently unable to receive the delivery. - `UNABLE_CONTACT_BUYER`: Unable to contact the buyer. - `BUYER_REFUSED`: The buyer has refused to receive the product. - `DELAY_DELIVERY`: Delay in delivery. - `PACKAGE_LOST`: The package is lost. - `PACKAGE_DAMAGE`: The package is damaged. - `FORCE_MAJEURE`: An unforeseeable event of force majeure has occurred. - `OTHER`: Other reason. |
| ^file_type | string |  | Attachment type: - `IMG` - `PDF` |
| ^file_url | string |  | Attachment URL. The seller can use the [Upload Delivery File](https://partner.tiktokshop.com/docv2/page/650aa6e04a0bb702c06dcd34?external_id=650aa6e04a0bb702c06dcd34#Back%20To%20Top) and [Upload Delivery Image](https://partner.tiktokshop.com/docv2/page/650aa70d0fcef602bf32772f?external_id=650aa70d0fcef602bf32772f) APIs to generate the URL. The attachment will be used by TikTok Shop to verify the package delivery. |
| ^id | string |  | The package ID. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Specific return information (returns multiple errors and reasons). |
| ^^code | integer |  | The failure reason code. |
| ^^detail | object |  | Error detail. |
| ^^^package_id | string |  | Package ID. |
| ^^message | string |  | Fulfillment failure reason. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SchedulePackageHandover

Use this API to schedule a platform shipping package pickup or drop off. After scheduling the package pickup or drop off, the API will return relevant package pickup/ drop off info.  Note: Please use order id to schedule a package pickup or drop off.

**Path:** `/fulfillment/202309/packages/schedule`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/schedule-package-handover-202309

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
| handover_method | string |  | Schedule the package as a pickup or drop off. - PICKUP (A shipping provider will pickup the package(s) from the seller's pickup address) - DROP_OFF (Seller will need to drop off the package(s) to a designated location) |
| order_id | string |  | TikTok Shop order ID |
| order_line_item_ids | array<string> |  | Line item ID list |
| pickup_slot | object |  | Shipping provider pickup times. |
| ^end_time | integer |  | The end date and time of the package pickup time slot. |
| ^start_time | integer |  | The start date and time of the package pickup time slot. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^create_time | integer |  | Unix timestamp |
| ^dimension | object |  | The dimensions of the scheduled package. The dimensions calculated by TikTok Shop based on the product's dimensions. |
| ^^height | string |  | The height of package. |
| ^^length | string |  | The length of package. |
| ^^unit | string |  | The unit of measurement is used to measure the length. - CM - INCH |
| ^^width | string |  | The width of package. |
| ^handover_method | string |  | Schedule the package as a pickup or drop off. - PICKUP (A shipping provider will pickup the package(s) from the seller's pickup address) - DROP_OFF (Seller will need to drop off the package(s) to a designated location) |
| ^order_id | string |  | TikTok Shop order ID |
| ^order_line_item_ids | array<string> |  | Order line item IDs that belong to the package. |
| ^package_id | string |  | Package ID. |
| ^shipping_provider_id | string |  | Package shipping provider id |
| ^shipping_provider_name | string |  | Package shipping provider |
| ^tracking_number | string |  | Package tracking number |
| ^update_time | integer |  | Unix timestamp |
| ^weight | object |  | The weight of the scheduled package. The weight calculated by TikTok Shop based on the product's weight. |
| ^^unit | string |  | The unit of measurement is used to measure the weight. - GRAM - POUND |
| ^^value | string |  | The value of the weight of the scheduled package. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchPackage

Retrieve package IDs based on specified conditions. Package creation time and information update time are the common querying conditions.

**Path:** `/fulfillment/202309/packages/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/search-package-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Valid range: [1-50]. |
| sort_field | string |  | The returned results will be sorted by the specified field. Default: `create_time` Possible values: - `create_time` - `update_time` - `order_pay_time` Specify the order for sorting the returned results by using the sort_order parameter. |
| sort_order | string |  | The sort order for the sort_field parameter. Default: `DESC` Possible values: - `ASC`: Ascending order - `DESC`: Descending order |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. Get by API [Get Authorization Shop](https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9?external_id=6507ead7b99d5302be949ba9) |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_ge | integer |  | Filter the packages to show only those that are created after (or at) the specified date and time. Unix timestamp. |
| create_time_lt | integer |  | Filter the packages to show only those that are created before the specified date and time. Unix timestamp. |
| package_status | string |  | Possible values: - `PROCESSING`: Package has been arranged by seller. Waiting for carrier to collect the parcel. - `FULFILLING`: Package has been collected by carrier and in transit. - `COMPLETED`: Package has been delivered. - `CANCELLED`: Package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| update_time_ge | integer |  | Filter the packages to show only those that are updated after (or at) the specified date and time. Unix timestamp. |
| update_time_lt | integer |  | Filter the packages to show only those that are updated before the specified date and time. Unix timestamp. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^packages | array<object> |  | The response list of packages. |
| ^^create_time | integer |  | Package creation time. Unix timestamp. |
| ^^id | string |  | Package ID. |
| ^^order_line_item_ids | array<string> |  | The order line item ID contained in the package. |
| ^^orders | array<object> |  | The response list of TikTok Shop orders. |
| ^^^id | string |  | TikTok Shop order ID. |
| ^^^skus | array<object> |  | [Deprecated]The response list of SKUs. |
| ^^^^id | string |  | [Deprecated]The SKU ID. |
| ^^^^image_url | string |  | [Deprecated]The SKU image in order snapshot. |
| ^^^^name | string |  | [Deprecated]The SKU name. |
| ^^^^quantity | integer |  | [Deprecated]The SKU quantity. |
| ^^shipping_provider_id | string |  | Package shipping provider ID. |
| ^^shipping_provider_name | string |  | Package shipping provider. |
| ^^status | string |  | Possible values: - `PROCESSING`: Package has been arranged by seller. Waiting for carrier to collect the parcel. - `FULFILLING`: Package has been collected by carrier and in transit. - `COMPLETED`: Package has been delivered. - `CANCELLED`: Package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^^tracking_number | string |  | Package tracking number. |
| ^^update_time | integer |  | Package latest update time. Unix timestamp |
| ^total_count | integer |  | The number of packages that meet the query conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## BatchShipPackages

Use this API to batch ship packages by providing multiple package IDs. This API is available for TikTok shipping orders as well as seller shipping orders. 

- `TikTok Shipping`: Schedule a package handover time for TikTok Shipping carriers to pickup a package from the Seller. 
- `Seller Shipping`: Seller arranges their own shipping, and upload a `tracking_number` and `shipping_provider_id`. Package ID can be obtained from [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0?external_id=650aa8ccc16ffe02b8f167a0).

**Path:** `/fulfillment/202309/packages/ship`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/batch-ship-packages-202309

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
| packages | array<object> |  | Input list of packages you would like to batch ship. |
| ^handover_method | string |  | Possible values: - `PICKUP`: A shipping provider will pickup the package(s) from the seller's pickup address. - `DROP_OFF`: The seller will need to drop off the package(s) at a designated location. |
| ^id | string |  | Package ID. |
| ^pickup_slot | object |  | Package pickup time slot. |
| ^^end_time | integer |  | The end date and time of the package pickup time slot. Unix timestamp. |
| ^^start_time | integer |  | The start date and time of the package pickup time slot. Unix timestamp. |
| ^self_shipment | object |  | Only needed for seller shipping packages. Check the `delivery_option `field in [Get Package Detail](https://partner.tiktokshop.com/docv2/page/650aa39fbace3e02b75d8617?external_id=650aa39fbace3e02b75d8617) to see how to differentiate between TikTok shipping and seller shipping. Use the `shipping_provider_id` retrieved from the [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd#Back%20To%20Top) API and upload the corresponding tracking number. |
| ^^shipping_provider_id | string |  | For packages with the `SEND_BY_SELLER` delivery option type (seller shipping), you must provide the shipping provider information. Please use the [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd#Back%20To%20Top) API to obtain the `shipping_provider_id`. |
| ^^tracking_number | string |  | For packages with the `SEND_BY_SELLER` delivery option type (seller shipping), you must provide the package's tracking number. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Return list of possible errors during package batch shipment attempt. |
| ^^code | integer |  | The failure reason code. |
| ^^detail | object |  | Error detail. |
| ^^^package_id | string |  | Package ID. |
| ^^message | string |  | The failure reason message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPackageDetail

Returns information about a package, including handover time slot, tracking number, and shipping provider information.

**Path:** `/fulfillment/202309/packages/{package_id}`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-package-detail-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | TikTok Shop package ID. |

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
| ^create_time | integer |  | Package creation time. Unix timestamp. |
| ^delivery_option_id | string |  | Order delivery option ID. Delivery option ID is mapped to seller configured logistics templates ID. |
| ^delivery_option_name | string |  | Delivery option name. For display purposes only. |
| ^dimension | object |  | The dimensions of the scheduled package. |
| ^^height | string |  | The height of the scheduled package. |
| ^^length | string |  | The length of the scheduled package. |
| ^^unit | string |  | The unit of measurement used to measure the length. Possible values: - `CM` - `INCH` |
| ^^width | string |  | The width of the scheduled package. |
| ^handover_method | string |  | Whether the package is delivered by pick up or drop off. Possible values: - `PICKUP`: A Logistics carrier will pickup the package(s) from the seller's pickup address. - `DROP_OFF`: Seller will need to drop off the package(s) to a designated location. |
| ^has_multi_skus | boolean |  | Whether there are multiple SKU IDs in a package. |
| ^insurance | object |  | Provides details of shipping insurance auto-enrolled during label purchase |
| ^^claim_status | string |  | The insurance claim status. Available values: - `NOT_STARTED`: Claim has not been initiated for this package. - `CLAIM_PENDING`: Claim is currently under review. - `APPROVED`: Claim has been approved. - `DECLINED`: Claim has been declined. |
| ^^coverage_amount | string |  | The insurance coverage amount for the package. Units: USD. |
| ^^is_claim_eligible | boolean |  | Whether the order is eligible for an insurance claim, based on eligible refund reasons. |
| ^^is_purchased | boolean |  | Whether insurance has been purchased for the package. |
| ^last_mile_tracking_number | string |  | For cross-border order only. Cross-border order last mile tracking number. |
| ^note_tag | string |  | Possible values: - `BUYER_UNNOTED`: The order has not been noted by buyer. - `BUYER_NOTED`: The order has been noted by buyer. |
| ^order_line_item_ids | array<string> |  | The order line item ID contained in the package. |
| ^orders | array<object> |  | The response list of TikTok Shop orders. |
| ^^id | string |  | TikTok Shop order ID. |
| ^^skus | array<object> |  | [Deprecated]SKU information. |
| ^^^id | string |  | [Deprecated]SKU ID. |
| ^^^image_url | string |  | [Deprecated]SKU image in order snapshot. |
| ^^^name | string |  | [Deprecated]SKU name. |
| ^^^quantity | integer |  | [Deprecated]SKU quantity. |
| ^package_id | string |  | TikTok Shop package ID. |
| ^package_status | string |  | Possible values: - `PROCESSING`: Package has been arranged by seller. Waiting for carrier to collect the parcel. - `FULFILLING`: Package has been collected by carrier and in transit. - `COMPLETED`: Package has been delivered. - `CANCELLED`: Package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^pickup_slot | object |  | Time slots available for pickup. |
| ^^end_time | integer |  | End of time slot when a package is scheduled to be picked up by carrier. Unix timestamp. |
| ^^start_time | integer |  | Start of the time slot when a package is scheduled to be picked up by carrier. Unix timestamp. |
| ^recipient_address | object |  | Recipient address. |
| ^^address_detail | string |  | Full buyer detail address. |
| ^^address_line1 | string |  | The first line of the street address |
| ^^address_line2 | string |  | The second line of the street address. |
| ^^address_line3 | string |  | The third line of the street address. Usually only for the Brazilian market. |
| ^^address_line4 | string |  | The fourth line of the street address. Usually only for the Brazilian market. |
| ^^full_address | string |  | The complete recipient addresses information. |
| ^^name | string |  | The name of the recipient. Please note, if this order uses platform logistics, recipient name will be desensitized |
| ^^phone_number | string |  | The telephone number of the buyer. Please note, if this order use platform logistics, phone number will be desensitized. |
| ^^postal_code | string |  | The postal code that can be used by seller for shipping (in the U.S, this refers to the ZIP code). |
| ^^region_code | string |  | Region code. |
| ^sender_address | object |  | Sender address. |
| ^^address_detail | string |  | Full sender detail address. |
| ^^address_line1 | string |  | The first line of the sender's street address. |
| ^^address_line2 | string |  | The second line of the sender's street address. |
| ^^address_line3 | string |  | The third line of the sender's street address. Usually only for the Brazilian market. |
| ^^address_line4 | string |  | The fourth line of the sender's street address. Usually only for the Brazilian market. |
| ^^full_address | string |  | The complete sender addresses information. |
| ^^name | string |  | The name of the sender. |
| ^^phone_number | string |  | The telephone number of the sender. |
| ^^postal_code | string |  | The postal code of the sender. |
| ^^region_code | string |  | Region code of the sender. |
| ^shipping_provider_id | string |  | Package shipping provider ID. |
| ^shipping_provider_name | string |  | Package shipping provider name. |
| ^shipping_type | string |  | The method of delivery. Possible values: - `TIKTOK`: Shipping service provided by TikTok. The seller should obtain a shipping label from TikTok. - `SELLER`: Seller provides shipping, including through 3rd party fulfillment providers on behalf of the seller. |
| ^split_and_combine_tag | string |  | Possible values: - `DEFAULT`: The package has not undergone any combine or split operation. - `COMBINE`: The package has been consolidated with another order. - `SPLIT`: The order has been split into multiple orders. |
| ^tracking_number | string |  | Package tracking number. |
| ^update_time | integer |  | The time the package has been updated. Unix timestamp. |
| ^weight | object |  | The weight of the scheduled package. |
| ^^unit | string |  | The unit of measurement used to measure the weight. Possible values: - `GRAM` - `POUND` |
| ^^value | string |  | The value of the weight of the scheduled package. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPackageHandoverTimeSlots

Use this API to retrieve the time slots available for pickup, drop-off, or van collection for the seller's specified package by using package ID.

**Path:** `/fulfillment/202309/packages/{package_id}/handover_time_slots`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-package-handover-time-slots-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | TikTok Shop package ID. |

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
| ^can_drop_off | boolean |  | Whether this package be dropped off at a drop-off location |
| ^can_pickup | boolean |  | Whether this package supports door-to-door collection. |
| ^can_van_collection | boolean |  | Specific to UK. Use this field to determine whether van collection is available. |
| ^drop_off_point_url | string |  | View package drop-off locations  via provided URL. |
| ^pickup_slots | array<object> |  | Time slot for door-to-door collection. |
| ^^avaliable | boolean |  | Whether an appointment be made for this time slot. |
| ^^end_time | integer |  | The end date and time of the package pick up time slot. Unix timestamp. |
| ^^start_time | integer |  | The start date and time of the package pick up time slot. Unix timestamp. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ShipPackage

Use this API to ship a package. There are two kinds of shipping options available: `TikTok Shipping` or `Seller Shipping`.

- `TikTok Shipping`: Schedule a package handover time for TikTok Shipping carriers to pickup a package from seller.
- `Seller Shipping`: Seller arranges their own shipping, and uploads a tracking number and `shipping_provider_id`. Package ID can be obtained from [Get Order Detail](https://partner.tiktokshop.com/docv2/page/650aa8ccc16ffe02b8f167a0?external_id=650aa8ccc16ffe02b8f167a0#Back%20To%20Top).

**Path:** `/fulfillment/202309/packages/{package_id}/ship`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/ship-package-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | TikTok Shop package ID. |

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
| handover_method | string |  | Possible values: - `PICKUP`: A logistics carrier will pick up the package(s) from the seller's pickup address. - `DROP_OFF`: The seller will need to drop off the package(s) to a designated location. |
| pickup_slot | object |  | Pickup time slot. |
| ^end_time | integer |  | The end date and time of the package pickup time slot. Unix timestamp. |
| ^start_time | integer |  | The start date and time of the package pickup time slot. Unix timestamp. |
| self_shipment | object |  | Only needed for merchant self-shipping packages. Check the `delivery_option` field of [Get Package Detail](https://partner.tiktokshop.com/docv2/page/650aa39fbace3e02b75d8617?external_id=650aa39fbace3e02b75d8617#Back%20To%20Top) to see how to differentiate platform-logistics and self-shipping. Use the `shipping_provider_id` retrieved from [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) and upload the corresponding `tracking_number`. |
| ^shipping_provider_id | string |  | For package with `SEND_BY_SELLER` as `delivery_option` (merchant self-shipping mode), you must input a `shipping_provider_id` to call this API. Please use [Get Shipping Providers](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd) to obtain the `shipping_provider_id`. |
| ^tracking_number | string |  | For package with `SEND_BY_SELLER` as `delivery_option` (merchant self-shipping mode), you must input a `tracking_number` to call this API. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPackageShippingDocument

For orders shipped by TikTok Shop, this API retrieves the URL of shipping documents (shipping label and packing slip) for a package specified by the package ID. This API is only applicable to "TikTok Shipping" orders. To obtain the shipping documents URL via this API, first call "Ship Package" to ship the corresponding package.

**Path:** `/fulfillment/202309/packages/{package_id}/shipping_documents`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-package-shipping-document-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | TikTok Shop package ID. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| document_type | string | Y | Available document types: - `SHIPPING_LABEL`: Returns the shipping label in PDF format by default. - `PACKING_SLIP`: Returns the packing slip in PDF format by default. - `SHIPPING_LABEL_AND_PACKING_SLIP`: Returns both the shipping label and the packing slip for the package, both in PDF format by default. - `SHIPPING_LABEL_PICTURE`: Returns the shipping label in PNG format. - `HAZMAT_LABEL`: Returns the hazmat label in PDF format by default. You must only use this value when there are hazmat items in the package. When you use the value, `document_size` is fixed to A4, and you don't need to specify `document_size`. - `INVOICE_LABEL`: For Brazil market only, document_size is fixed to A6, and you don't need to specify `document_size`. Returns the invoice label in PDF format by default |
| document_size | string |  | Use this field to specify the size of the document to obtain. This parameter is only applicable to shipping labels, picking slips, and packing slips that are in the PDF format. It is not applicable for hazmat labels as these are fixed to A4. If you specify `SHIPPING_LABEL_PICTURE` for the `document_type`, any value specified in the `document_size` will be ignored. Possible values: - `A6` (Default) - `A5` |
| document_format | string |  | The format of the shipping document. Possible values: - PDF (Default) - ZPL (Only for BR and MX market) **Note**: Not applicable for `SHIPPING_LABEL_PICTURE` document type. |
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
| ^doc_url | string |  | The URL of the shipping label and packing slip generated for the specified package. The URL is valid for 24 hours. |
| ^tracking_number | string |  | The package tracking number from the shipping carrier. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdatePackageShippingInfo

If the seller entered an incorrect tracking number, this API allows the seller to update the tracking number and shipping provider for a package that has already been shipped. Attention: This API is only applicable to orders (or packages) shipped by the seller.  It is only used to update the tracking number and shipping provider for packages that have already been shipped.

**Path:** `/fulfillment/202309/packages/{package_id}/shipping_info/update`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/update-package-shipping-info-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | TikTok Shop package ID. |

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
| shipping_provider_id | string |  | Identifies the carrier that will deliver the package. Please call the [Get Shipping Providers API](https://partner.tiktokshop.com/docv2/page/650aa48d4a0bb702c06d85cd?external_id=650aa48d4a0bb702c06d85cd#Back%20To%20Top) to retrieve the available shipping provider(s). |
| tracking_number | string |  | The shipment tracking number provided by the carrier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UncombinePackages

Use this API to uncombine one or more orders from an already combined package.

**Path:** `/fulfillment/202309/packages/{package_id}/uncombine`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/uncombine-packages-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| package_id | string | Y | Package ID you wish to uncombine an order(s) from. |

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
| order_ids | array<string> |  | TikTok Shop order ID. Indicate the orders that need to be removed from the package. Please make sure the orders belong to the package. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^packages | array<object> |  | Return list of packages after being uncombined. |
| ^^id | string |  | The newly generated package ID(s) after being uncombined. |
| ^^order_ids | array<string> |  | List of order ID(s) corresponding to the uncombined package ID(s). |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateFirstMileBundle

If you send multiple packages to TikTok Shop warehouse in a single first-mile bundle, you can use the API to create a first-mile bundle on TikTok Shop and get the bundle ID.

**Path:** `/fulfillment/202407/bundles`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/create-first-mile-bundle-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| handover_method | string |  | The way you send the first-mile bundle. Possible enumerations are: - `PICKUP`: You use the logistic service provided by TikTok Shop to send the bundle. - `DROP_OFF`: You contact the logistic provider and send the bundle. The logistic provider must be registered at TikTok Shop. |
| order_ids | array<string> |  | The IDs of all the orders sent in a single first-mile bundle. The orders must follow the restrictions: - Each of the orders must exist and be RTS and shipping label printed. - The orders are sent by the same seller. - The orders belong to a single group of TikTok Shop service districts. The groups are: - Group 1: PH, SG, MY, VN, TH, and JP. - Group 2: DE, FR, IT, ES. You can not create first mile bundles for US/UK orders using this API. |
| phone_tail_number | string |  | Last 4 digits of the sender's phone number. Required when `handover_method == DROP_OFF`. |
| shipping_provider_id | string |  | The logistic provider ID in TikTok Shop. Required when `handover_method == DROP_OFF`. |
| tracking_number | string |  | The logistic tracking number of the bundle. Required when `handover_method == DROP_OFF`. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Specific return information (returns multiple errors and reasons) |
| ^^code | integer |  | The success or failure status code returned in API response. |
| ^^detail | object |  | Error detail |
| ^^^order_id | string |  | TikTok Shop order ID |
| ^^message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| ^first_mile_bundle_id | string |  | The ID of the first-mile bundle. |
| ^url | string |  | The returned waybill link. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateLastMileBundle

When you consolidate multiple packages into a last mile bundle and ship it to the TikTok Shop warehouse, you should call this API to inform TTS platform about the last mile bundle.

**Path:** `/fulfillment/202408/last_mile_bundles`
**Method:** `POST`
**Version:** 202408
**Docs:** https://partner.tiktokshop.com/docv2/page/create-last-mile-bundle-202408

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| fulfillment_unit_ids | array<string> |  | List of fulfillment Unit IDs included in the bundle. The length must not exceed `300`. |
| last_mile_bundle | object |  | Last mile bundle |
| ^dimensions | object |  | Bundle dimensions |
| ^^height | integer |  | Height value |
| ^^length | integer |  | Length value |
| ^^unit | string |  | Unit. Possible enumerations: - `centimeter`. |
| ^^width | integer |  | Width value |
| ^external_bundle_id | string |  | Bundle ID in your order management system |
| ^fulfillment_unit_count | integer |  | Number of small packages in the bundle |
| ^outbound_time | integer |  | UNIX timestamp of outbounding from your warehouse in milliseconds. |
| ^weight | object |  | Bundle weight |
| ^^unit | string |  | Unit. Possible enumerations: - `gram`. |
| ^^value | integer |  | value |
| logistics_group_id | integer |  | Logistics group id for biz |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^last_mile_bundle_id | string |  | TikTok Shop last mile bundle ID |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UploadInvoice

Upload the invoice document.
**Note**: Applicable only for local sellers in the Brazil market.

**Path:** `/fulfillment/202502/invoice/upload`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/upload-invoice-202502

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
| invoices | array<object> |  | The list of invoices to upload. |
| ^file | string |  | Base64 encoding of the invoice file to upload. Max file size: 1MB |
| ^file_type | string |  | The invoice file format. Possible values: - `XML` |
| ^order_ids | array<string> |  | The list of TikTok Shop order IDs, retrieved from [Get Order List](650aa8094a0bb702c06df242). |
| ^package_id | string |  | The TikTok Shop package ID, retrieved from [Search Package](650aa592bace3e02b75db748). |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | integer |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^order_ids | array<string> |  | The order IDs where errors occurred. |
| ^^^package_id | string |  | The package ID where the error occurred. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## TTSTrackingValidation

Enables a seller or warehouse to validate whether a tracking number is covered by TikTok Shipping (TTS) or Collection by TikTok (CBT). 

Available only in the **US Market**.

**Path:** `/fulfillment/202508/tts_tracking_validation`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/ttstracking-validation-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| tracking_number | string | Y | The tracking number provided by shipping provider |
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
| ^is_tiktok_collection | boolean |  | A flag to determine whether the package is TikTok Collections |
| ^is_tiktok_shipping | boolean |  | A flag to determine whether the package is TikTok Shipping |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateFirstMileBundleV2

If you send multiple packages to TikTok Shop warehouse in a single first-mile bundle, you can use the API to create a first-mile bundle on TikTok Shop and get the bundle ID.

**Path:** `/fulfillment/202510/first_mile_bundle`
**Method:** `POST`
**Version:** 202510
**Docs:** https://partner.tiktokshop.com/docv2/page/create-first-mile-bundle-v2-202510

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
| handover_method | string |  | The way you send the first-mile bundle. Possible enumerations are: - `PICKUP`: You use the logistic service provided by TikTok Shop to send the bundle. - `DROP_OFF`: You contact the logistic provider and send the bundle. The logistic provider must be registered at TikTok Shop. |
| order_ids | array<string> |  | The IDs of all the orders sent in a single first-mile bundle. The orders must follow the restrictions: - Each of the orders must exist and be RTS and shipping label printed. - The orders are sent by the same seller. - The orders belong to a single group of TikTok Shop service districts. The groups are: - Group 1: PH, SG, MY, VN, TH, and JP. - Group 2: DE, FR, IT, ES. You can not create first mile bundles for US/UK orders using this API. |
| phone_tail_number | string |  | Last 4 digits of the sender's phone number. Required when `handover_method == DROP_OFF`. |
| shipping_provider_id | string |  | The logistic provider ID in TikTok Shop. Required when `handover_method == DROP_OFF`. |
| tracking_number | string |  | The logistic tracking number of the bundle. Required when `handover_method == DROP_OFF`. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | Specific return information (returns multiple errors and reasons) |
| ^^code | integer |  | The success or failure status code returned in API response. |
| ^^detail | object |  | Error detail |
| ^^^order_id | string |  | TikTok Shop order ID |
| ^^message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| ^first_mile_bundle_id | string |  | The ID of the first-mile bundle. |
| ^url | string |  | The returned waybill link. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreatePackages

Use this API to ship orders (purchase labels). This API is region specific to the US. The shipping fee and delivery time is an estimate only and is based on the package dimensions and weight you provided. Based on the package attributes, options listed below may differ from your shipping subscriptions.

**Path:** `/fulfillment/202512/packages`
**Method:** `POST`
**Version:** 202512
**Docs:** https://partner.tiktokshop.com/docv2/page/create-packages-202512

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
| dimension | object |  | Package dimensions. |
| ^height | string |  | Package height. The length, width, and height must be passed together. |
| ^length | string |  | Package length. The length, width, and height must be passed together. |
| ^unit | string |  | The unit of measurement for the package dimensions. Available values: - `CM` - `INCH` |
| ^width | string |  | Package width. The length, width, and height must be passed together. |
| order_id | string |  | TikTok Shop order ID. If ship_type=0&1,This is a required field;If ship_type=2,we will not use |
| order_line_item | array<object> |  | List of order line item IDs. If ship_type=2,This is a required field;If ship_type=1&3,we will not use this field |
| ^order_line_id | string |  | List of order line item IDs. If ship_type=2,This is a required field;If ship_type=1&3,we will not use this field |
| order_list_ids | array<string> |  | List of order line item IDs. If ship_type=3,This is a required field;If ship_type=1&2,we will not use this field |
| ship_type | string |  | 1:All the products in one order are shipped in one package with one tracking number 2:Partical products in one parent order are shipped in multiple packages with multiple tracking numbers 3:All the products in multiple orders are shipped in one package with one tracking number. |
| shipping_service_id | string |  | Specify the shipping service used. If not specified, use the default service obtained from [Get Eligible Shipping Service](https://partner.tiktokshop.com/docv2/page/650aa6b2bace3e02b75dda4e). |
| weight | object |  | Package weight. |
| ^unit | string |  | The unit of measurement for the package weight. Available values: - `GRAM` - `POUND` |
| ^value | string |  | The numerical value of the package weight. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^create_time | integer |  | The time when the product was created. Unix timestamp. |
| ^dimension | object |  | Package dimensions. |
| ^^height | string |  | Package height. |
| ^^length | string |  | Package length. |
| ^^unit | string |  | The unit of measurement for the package dimensions. Available values: - `CM` - `INCH` |
| ^^width | string |  | Package width. |
| ^package_id | string |  | Package ID. |
| ^shipping_service_info | object |  | The available shipping service's information. |
| ^^currency | string |  | Currency of the price. |
| ^^earliest_delivery_days | integer |  | The minimum estimated duration required for package delivery. |
| ^^id | string |  | Shipping service ID. |
| ^^latest_delivery_days | integer |  | The maximum estimated duration required for package delivery. |
| ^^name | string |  | Shipping service name. |
| ^^price | string |  | Estimated price for this service. |
| ^^shipping_provider_id | string |  | Shipping provider ID. |
| ^^shipping_provider_name | string |  | Shipping provider name. |
| ^weight | object |  | Package weight. |
| ^^unit | string |  | The unit of measurement for the package weight. Available values: - `GRAM` - `POUND` |
| ^^value | string |  | The numerical value of the package weight. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## RedeemInfoCallback

Description of [POST]/fulfillment/:version/redeem_info/callback

**Path:** `/fulfillment/202601/redeem_info/callback`
**Method:** `POST`
**Version:** 202601
**Docs:** https://partner.tiktokshop.com/docv2/page/redeem-info-callback-202601

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
| order_id | string |  | TikTok Shop order id. |
| order_info_list | array<object> |  | Order lines that need to send redeem info related to the order id. |
| ^order_line_id | string |  | Line order id. |
| ^redeem_info | object |  | The redeem item generated by your system that you need to callback. |
| ^^redeem_data | string |  | Redeem type is 'CODE', set redeem code to this field. Redeem type is 'URL', set redeem url to this field. |
| ^^redeem_type | string |  | What redeem type that you callback. 'CODE' - type code 'URL' - type url |
| ^source_unique_id | string |  | Optional, a unique id related to the order line in the caller system |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^order_statuses | array<object> |  | Callback result. |
| ^^order_line_id | string |  | Line order id, same as the input line order id. |
| ^^status_code | integer |  | callback status of this line order id. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
