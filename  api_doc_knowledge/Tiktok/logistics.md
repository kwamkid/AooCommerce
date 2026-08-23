# TikTok Shop API — logistics

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 8 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202412, 202502, 202510

---

## GetShippingProviders

This API is used to obtain the shipping provider corresponding to the specified delivery option

**Path:** `/logistics/202309/delivery_options/{delivery_option_id}/shipping_providers`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-shipping-providers-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_option_id | string | Y | The specific delivery option identifier for getting the shipping provider list. |

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
| ^shipping_providers | array<object> |  | shipping provider list |
| ^^id | string |  | shipping provider id |
| ^^name | string |  | shipping provider name |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalSellerWarehouse

This API retrieves all global warehouse information associated with the seller. Warehouse information includes global warehouse ID, warehouse name, and warehouse ownership.

**Path:** `/logistics/202309/global_warehouses`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-seller-warehouse-202309

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
| ^global_warehouses | array<object> |  | Global warehouse information. |
| ^^id | string |  | Global warehouse ID, a unique and immutable primary key, used for all global warehouse logistics. |
| ^^name | string |  | Global warehouse name. This name is not unique across the TikTok Shop system. |
| ^^ownership | string |  | Possible values: - SELLER: Warehouse owned by the seller. - PLATFORM_COOPERATION: Warehouse owned by TikTok Shop. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetWarehouseList

This API retrieves all warehouse information associated with the seller. Warehouse information includes name, status, address, and other details.

**Path:** `/logistics/202309/warehouses`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-warehouse-list-202309

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
| ^warehouses | array<object> |  | All the warehouses associated with the seller. |
| ^^address | object |  | Warehouse address. |
| ^^^address_line1 | string |  | The first line of the warehouse address, like street name and street number. Note: - For Brazilian market, this represents the neighborhood or district. - For the JP market, this represents the district (Chome), block (Banchi), building number (Go). |
| ^^^address_line2 | string |  | The second line of the warehouse address, like flat, apartment, or suit. Note: For the Brazilian market, this represents the street name. |
| ^^^address_line3 | string |  | This represents the street number. If it's `s/n`, it means null. Note: Available only in the Brazilian market. |
| ^^^address_line4 | string |  | This represents supplement information, like flat, apartment, or suit (optional). Note: Available only in the Brazilian market. |
| ^^^city | string |  | Warehouse city. |
| ^^^contact_person | string |  | Warehouse contact person name. |
| ^^^distict | string |  | Warehouse district. |
| ^^^first_name | string |  | Kanji first name Applicable only for the JP market. |
| ^^^first_name_local_script | string |  | Hiragana or Katakana first name Applicable only for the JP market. |
| ^^^full_address | string |  | The combined warehouse address, including the street address and other address information such as apartment number, building, floor..etc (optional) |
| ^^^geolocation | object |  | The geographical location of the address. |
| ^^^^latitude | string |  | The latitude of the address. |
| ^^^^longitude | string |  | The longitude of the address. |
| ^^^last_name | string |  | Kanji last name Applicable only for the JP market. |
| ^^^last_name_local_script | string |  | Hiragana or Katakana last name Applicable only for the JP market. |
| ^^^phone_number | string |  | Warehouse phone number. |
| ^^^postal_code | string |  | Warehouse address postal code (also known as zip code) |
| ^^^region | string |  | Warehouse region. |
| ^^^region_code | string |  | Warehouse region code. |
| ^^^state | string |  | Warehouse state or province. |
| ^^^town | string |  | Warehouse town. |
| ^^effect_status | string |  | Possible values: - ENABLED: All products in stock are available for sale. - DISABLED: All products in stock are unavailable for sale. - RESTRICTED: The warehouse is either on "holiday mode" or "order limit mode." All products in stock are unavailable for sale. -Holiday mode: When the seller cannot fulfill an order from a warehouse, the seller can turn on holiday mode for the warehouse in seller center. - Order limit mode: When the seller violates TikTok Shop policies, TikTok Shop will limit the order volume that can be fulfilled by a warehouse. |
| ^^entity_id | string |  | The warehouse entity ID, used to associate physical information of a warehouse, different warehouses may be associated with the same entity. |
| ^^id | string |  | The warehouse ID, a unique and immutable primary key, used for all warehouse logistics. |
| ^^is_default | boolean |  | The default warehouse.  If a product is listed with no designated warehouse, the default warehouse will be used. |
| ^^name | string |  | Warehouse name. This name is not unique across the TikTok Shop system. |
| ^^sub_type | string |  | Possible values: - DOMESTIC_WAREHOUSE: The warehouse is in the same country as the target market and the seller. - CB_OVERSEA_WAREHOUSE: For cross-border sellers, a local warehouse in the target market. - CB_DIRECT_SHIPPING_WAREHOUSE: For cross-border sellers, a warehouse in the seller's base country, e.g., Mainland China or Hong Kong. |
| ^^type | string |  | Possible values: - SALES_WAREHOUSE: Warehouse for shipping products. - RETURN_WAREHOUSE: Warehouse for receiving returned products. You can have the same warehouse for both shipping and receiving returns, but they will have different warehouse IDs with the same address. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetWarehouseDeliveryOptions

This API is used to obtain a list of delivery options available through the seller's designated warehouse.

**Path:** `/logistics/202309/warehouses/{warehouse_id}/delivery_options`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-warehouse-delivery-options-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| warehouse_id | string | Y | The warehouse ID. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| scope | string |  | Specify the scope of delivery options to retrieve. - `WAREHOUSE`: Returns all delivery options currently active for the warehouse. By default, orders will be shipped based on these options. - `PRODUCT`: Returns the delivery options that can be assigned directly to a product. Use this if you want to enable custom delivery options for a product, overriding the default warehouse options. Only `delivery_options.id` and `delivery_options.name` will be included in the response when this is specified. Default: `WAREHOUSE` |
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
| ^delivery_options | array<object> |  | List of deliver options available through the seller's warehouse, and the respective carriers and attribute restrictions depending on the commodity. |
| ^^description | string |  | Delivery option description. |
| ^^dimension_limit | object |  | The length, width, and height restrictions of the delivery option. |
| ^^^max_height | integer |  | Maximum height limit. |
| ^^^max_length | integer |  | Maximum length limit. |
| ^^^max_width | integer |  | Maximum width limit. |
| ^^^unit | string |  | The unit of measurement for the dimensions, with possible values: - CM - INCH |
| ^^id | string |  | Delivery option ID. |
| ^^name | string |  | Delivery option name. |
| ^^platform | array<string> |  | The platform on which the delivery option is available Possible values: - TIKTOK_SHOP - TOKOPEDIA |
| ^^type | string |  | Delivery option type. This is an enumerated type with values: - STANDARD - EXPRESS - ECONOMY - SEND_BY_SELLER |
| ^^weight_limit | object |  | The weight restrictions of this delivery option. |
| ^^^max_weight | integer |  | Maximum weight limit. |
| ^^^min_weight | integer |  | Minimum weight limit. |
| ^^^unit | string |  | The unit of measurement for the weight, with possible values: - GRAM - POUND |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## StandardizeWarehouseAddress

Returns the best standardized address for a given address, suggested calling this API before calling [create warehouse]. Only available in the US market.

**Path:** `/logistics/202412/addresses/standardize`
**Method:** `POST`
**Version:** 202412
**Docs:** https://partner.tiktokshop.com/docv2/page/standardize-warehouse-address-202412

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
| address | object |  | Input address to be corrected by platform. |
| ^address_line1 | string |  | First line of the address |
| ^address_line2 | string |  | Second line of the address |
| ^city | string |  | City of the address |
| ^district | string |  | District of the address |
| ^postal_code | string |  | postal code (also known as zip code) |
| ^region_code | string |  | 2 letter region code, ISO 3166-1 international standard. |
| ^state | string |  | State or province |
| ^town | string |  | Town of the address |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^standardization_result | object |  | Address standardization result |
| ^^standardized_address | object |  | Address standardized by the platform |
| ^^^address_line1 | string |  | First line of the address |
| ^^^address_line2 | string |  | Second line of the address |
| ^^^city | string |  | City of the address |
| ^^^district | string |  | District of the address |
| ^^^postal_code | string |  | postal code (also known as zip code) |
| ^^^region_code | string |  | 2 letter country region code, ISO 3166-1 international standard. |
| ^^^state | string |  | State or province of the address |
| ^^^town | string |  | Town of the address |
| ^^updated | boolean |  | Whether the address has been standardized by the platform |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateWarehouse

Create seller's warehouse

**Path:** `/logistics/202502/warehouses`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/create-warehouse-202502

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
| warehouse | object |  | The warehouse needs to create |
| ^address | object |  | Warehouse address. |
| ^^address_line_1 | string |  | The first line of the warehouse address.Such as street name、street number Note: For the Brazilian market, this represents the neighborhood or district. |
| ^^address_line_2 | string |  | The second line of the warehouse address.Such as flat, apartment, suit. Note: For the Brazilian market, this represents the street name |
| ^^address_line_3 | string |  | This represents street numbers, such as 3 or s/n(means null). Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^address_line_4 | string |  | This represents supplement information, such as flat、apartment、suit. Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^city | string |  | Warehouse city. |
| ^^district | string |  | Warehouse district. |
| ^^postcode | string |  | Warehouse address postal code (also known as zip code) |
| ^^region | string |  | Warehouse region. |
| ^^state | string |  | Warehouse state or province. |
| ^contact_person | string |  | Warehouse contact person's name. |
| ^cover_address_detail | array<object> |  | Details of the Address covered by this warehouse |
| ^^address_line_1 | string |  | The first line of the warehouse address.Such as street name、street number Note: For the Brazilian market, this represents the neighborhood or district. |
| ^^address_line_2 | string |  | The second line of the warehouse address.Such as flat, apartment, suit. Note: For the Brazilian market, this represents the street name |
| ^^address_line_3 | string |  | This represents street numbers, such as 3 or s/n(means null). Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^address_line_4 | string |  | This represents supplement information, such as flat、apartment、suit. Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^city | string |  | City of address covered by warehouse. |
| ^^district | string |  | District of address covered by warehouse. |
| ^^postcode | string |  | Postcode of address covered by warehouse. |
| ^^region | string |  | Region of address covered by warehouse. |
| ^^state | string |  | State of address covered by warehouse. |
| ^cover_region_code | string |  | Region code covered by this warehouse |
| ^default_warehouse | boolean |  | Whether to set this warehouse as the default warehouse. |
| ^external_warehouse_id | string |  | The warehouse ID from the third party. |
| ^first_name | string |  | Kanji first name Applicable only for the JP market. |
| ^first_name_local_script | string |  | Hiragana or Katakana first name Applicable only for the JP market. |
| ^last_name | string |  | Kanji last name Applicable only for the JP market. |
| ^last_name_local_script | string |  | Hiragana or Katakana last name Applicable only for the JP market. |
| ^name | string |  | Warehouse name. This name is not unique across the TikTok Shop system. |
| ^phone_number | string |  | Warehouse contact phone number. |
| ^type | string |  | Warehouse type. - SALES_WAREHOUSE: Warehouse for shipping products. - RETURN_WAREHOUSE: Warehouse for receiving returned products. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^error_list | array<object> |  | Error code list |
| ^^code | integer |  | Error code |
| ^^message | string |  | Error message |
| ^warehouse_id | string |  | The warehouse ID, a unique and immutable primary key, used for all warehouse logistics. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateWarehouse

update seller's warehouse info

**Path:** `/logistics/202502/warehouses/{warehouse_id}`
**Method:** `POST`
**Version:** 202502
**Docs:** https://partner.tiktokshop.com/docv2/page/update-warehouse-202502

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| warehouse_id | string | Y | The warehouse ID, a unique and immutable primary key, used for all warehouse logistics. |

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
| warehouse | object |  | The warehouse needs to update |
| ^address | object |  | Warehouse address. |
| ^^address_line_1 | string |  | The first line of the warehouse address.Such as street name、street number Note: For the Brazilian market, this represents the neighborhood or district. |
| ^^address_line_2 | string |  | The second line of the warehouse address.Such as flat, apartment, suit. Note: For the Brazilian market, this represents the street name |
| ^^address_line_3 | string |  | This represents street numbers, such as 3 or s/n(means null). Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^address_line_4 | string |  | This represents supplement information, such as flat、apartment、suit. Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^city | string |  | Warehouse city. |
| ^^district | string |  | Warehouse district. |
| ^^postcode | string |  | Warehouse address postal code (also known as zip code) |
| ^^region | string |  | Warehouse region. |
| ^^state | string |  | Warehouse state or province. |
| ^contact_person | string |  | Warehouse contact person's name. |
| ^cover_address_detail | array<object> |  | Details of the Address covered by this warehouse |
| ^^address_line_1 | string |  | The first line of the warehouse address.Such as street name、street number Note: For the Brazilian market, this represents the neighborhood or district. |
| ^^address_line_2 | string |  | The second line of the warehouse address.Such as flat, apartment, suit. Note: For the Brazilian market, this represents the street name |
| ^^address_line_3 | string |  | This represents street numbers, such as 3 or s/n(means null). Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^address_line_4 | string |  | This represents supplement information, such as flat、apartment、suit. Note: Only applicable in the Brazilian market, invalid in the other markets. |
| ^^city | string |  | City of address covered by warehouse. |
| ^^district | string |  | District of address covered by warehouse. |
| ^^postcode | string |  | Postcode of address covered by warehouse. |
| ^^region | string |  | Region of address covered by warehouse. |
| ^^state | string |  | State of address covered by warehouse. |
| ^cover_region_code | string |  | Region code covered by this warehouse |
| ^default_warehouse | boolean |  | Whether to set this warehouse as the default warehouse. |
| ^external_warehouse_id | string |  | The warehouse ID from the external system. |
| ^first_name | string |  | Warehouse contact person's first name. Note: Only applicable in the Japan market, invalid in the other markets. |
| ^first_name_local_script | string |  | Hiragana or Katakana first name Applicable only for the JP market. |
| ^last_name | string |  | Warehouse contact person's last name. Note: Only applicable in the Japan market, invalid in the other markets. |
| ^last_name_local_script | string |  | Hiragana or Katakana last name Applicable only for the JP market. |
| ^name | string |  | Warehouse name. This name is not unique across the TikTok Shop system. |
| ^phone_number | string |  | Warehouse contact phone number. |
| ^type | string |  | Warehouse type. - SALES_WAREHOUSE: Warehouse for shipping products. - RETURN_WAREHOUSE: Warehouse for receiving returned products. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^error_list | array<object> |  | Error code list |
| ^^code | integer |  | Error code |
| ^^message | string |  | Error message |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetAvailableShippingTemplate

get seller's available shipping template and return the reason  why the template is not available

**Path:** `/logistics/202510/seller_templates`
**Method:** `GET`
**Version:** 202510
**Docs:** https://partner.tiktokshop.com/docv2/page/get-available-shipping-template-202510

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
| product_attribute | object |  | Attribute of the product,including dimension and weight |
| ^dimension | object |  | The dimension of the product |
| ^^height | string |  | The height of the product |
| ^^length | string |  | The length of the product |
| ^^unit | integer |  | 1: centimeter 2:inch 3:foot 4:millimeter 5:meter |
| ^^width | string |  | The width of the product |
| ^weight | object |  | The weight of product |
| ^^unit | integer |  | 1:gram 2:pound 3:ounce 4:kilogram |
| ^^weight | string |  | The weight of product |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^templates | array<object> |  | All the seller's template |
| ^^service_unreachable_reason | array<object> |  | If service_unreachable_reason is not empty, it will contain a "reason" why this template is not usable. If service_unreachable_reason is empty, then template is usable |
| ^^^filter_reason | array<object> |  | Contains the reason why this template is not usable |
| ^^^^filter_type | string |  | 1 for length filter 2 for width filter 3 for height filter 4 for weight filter 9 for service mode filter 11 for service filter |
| ^^^^reason | string |  | Detailed reason for unreachable |
| ^^^service_id | string |  | Id of the service |
| ^^template | object |  | Template details, including the template_name and other messages |
| ^^^is_default | boolean |  | Is default template or not |
| ^^^template_id | string |  | The template_id |
| ^^^template_name | string |  | The template name |
| ^^^template_party | integer |  | 1 for shipping by platform template 2 for shipping by seller template |
| ^^template_is_available | boolean |  | Whether the template is available |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
