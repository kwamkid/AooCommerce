# TikTok Shop API — gs_full_service_shipment

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 33 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202405, 202407, 202409, 202410, 202503

---

## GSCreateDeliveryOrder

This API is used to create a delivery-order for stockup-order.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-delivery-order-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_order | object |  | The information list for batch delivery order creation |
| ^package_quantity | integer |  | The quantity of delivery package |
| ^packages | array<object> |  | The list of delivery package |
| ^^items | array<object> |  | Delivery package item infomation |
| ^^^platform_sku_code | string |  | Platform-defined code of spu |
| ^^^quantity | integer |  | The quantity of sku |
| ^stockup_order_code | string |  | The code of stockup order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_order_code | string |  | Delivery order code |
| ^stockup_order_code | string |  | Stockup order code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSConfirmDelivery

This API is used to Confirm that the delivery order has been completed.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/confirm`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsconfirm-delivery-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_order_code | string |  | The code of delivery order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSQueryDeliveryBatchs

This API is used to query delivery batch information by multi delivery batch codes.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/delivery_batchs`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsquery-delivery-batchs-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_batch_codes | array<string> | Y | A delivery batch code will be generated for logistics tracking when delivery-order is operated ship by logistics. Up to 50 |

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
| ^delivery_batchs | array<object> |  | The information list of delivery batch |
| ^^code | string |  | The code of delivery batch |
| ^^create_time | integer |  | The time of main-logistics order creatation |
| ^^logistics | object |  | The information of logistics |
| ^^^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^^shipping_provider_code | string |  | The code of logistics provider which transports merchant's goods to warehouse |
| ^^^shipping_provider_name | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^logistics_order_quantity | integer |  | The quantity of  logistics order under the main logistics order |
| ^^logistics_orders | array<object> |  | The information list of logistics order |
| ^^^code | string |  | The code of  logistics order |
| ^^^failed_reason | string |  | The failure reason of logistics order creatation |
| ^^^package_weight | object |  | The weight of  logistics package |
| ^^^^unit | string |  | The unit of  logistics package weight, like GRAM/KILOGRAM |
| ^^^^value | string |  | The number of  logistics package weight |
| ^^^status | string |  | The status of  logistics order creatation 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. SHIPPED 8. SHIPPED_ABNORMAL 9. DELIVERED 10. DELIVERED_ABNORMAL 11. SIGNED 12. FINISHED 13. CANCELED 14. RETURNING_TO_SENDER 15. RETURNED_TO_SENDER |
| ^^^tracking_number | string |  | The track no of  logistics order |
| ^^^tracking_records | array<object> |  | The  track records of logistics track |
| ^^^^message | string |  | The standard message of logistic track record |
| ^^^^title | string |  | The title of logistics track record |
| ^^^^update_time | integer |  | The time of logistic track record |
| ^^logistics_package_quantity | integer |  | The quantity of  logistics package under the main logistics order |
| ^^logistics_picker_name | string |  | The name of logistics picker that packed goods to transport |
| ^^logistics_picker_phone | string |  | The phone_number of logistics picker |
| ^^predicted_arrive_time | integer |  | The predicted arrival time is based on schedule shipping time |
| ^^predicted_pick_info | object |  | Make an appointment for pick-up time |
| ^^^end_time | integer |  | Predict pick-up end time |
| ^^^start_time | integer |  | Predict pick-up start time |
| ^^predicted_ship_time | integer |  | Schedule shipping time |
| ^^receiver_contact | object |  | The contact information of receiver |
| ^^^address_detail | object |  | The multilevel address info of receiver contact |
| ^^^^city_id | integer |  | The city ID |
| ^^^^city_name | string |  | The city name |
| ^^^^country_id | integer |  | Country ID |
| ^^^^country_name | string |  | Country Name |
| ^^^^detail | string |  | The detail address under town |
| ^^^^district_id | integer |  | The district ID |
| ^^^^district_name | string |  | The district name |
| ^^^^province_id | integer |  | The province ID |
| ^^^^province_name | string |  | The province name |
| ^^^^town_id | integer |  | The town ID |
| ^^^^town_name | string |  | The town name |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address |
| ^^^full_address | string |  | The detail address |
| ^^^phone_number | string |  | The phone number |
| ^^^postal_code | string |  | The postal code |
| ^^sender_contact | object |  | The contact information of sender |
| ^^^address_detail | object |  | The multilevel address info of sender contact |
| ^^^^city_id | integer |  | The city ID |
| ^^^^city_name | string |  | The city name |
| ^^^^country_id | integer |  | The country ID |
| ^^^^country_name | string |  | The country name |
| ^^^^detail | string |  | The detail address under town |
| ^^^^district_id | integer |  | The district ID |
| ^^^^district_name | string |  | The district name |
| ^^^^province_id | integer |  | The province ID |
| ^^^^province_name | string |  | The  name of province |
| ^^^^town_id | integer |  | The town ID |
| ^^^^town_name | string |  | The town name |
| ^^^contact_name | string |  | Contact name |
| ^^^email | string |  | The email address area of contact |
| ^^^full_address | string |  | The  detail address of contact |
| ^^^phone_number | string |  | The phone number |
| ^^^postal_code | string |  | The Postal code |
| ^^status | string |  | The status of delivery batch 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. PARTIAL_SHIPPED 8. SHIPPED_ABNORMAL 9. SHIPPED 10. PARTIAL_DELIVERED 11. DELIVERED 12. PARTIAL_SIGNED 13. SIGNED 14. CANCELED 15. RETURNING_TO_SENDER 16. RETURNED_TO_SENDER |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetDelivery-OrderPrintDocument

The API is used to get delivery-order print document.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/documents`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsget-delivery-order-print-document-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_order_codes | array<string> | Y | The list of delivery order code. Up to 50. |

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
| ^document_url | string |  | The url of a printable pdf document for multiple delivery order. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSReserveShipping

This API is used to reserve shipping for multi delivery-order.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/reserve_ship`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsreserve-shipping-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode that supplier delivers goods to warehouse of GS 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| delivery_order_codes | array<string> |  | The code list of delivery order，Up to 50 |
| logistics | object |  | The information of logistics |
| ^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^shipping_provider_code | string |  | The name of logistics provider |
| ^shipping_provider_name | string |  | The code of logistics provider |
| reserve | object |  | The reserve information for shipment |
| ^predicted_arrived_time | integer |  | The predicted arrival date is based on reservation shipment time |
| ^predicted_pickup_ge | integer |  | The start time of Schedule delivery timeslot |
| ^predicted_pickup_lt | integer |  | The end time of Schedule delivery timeslot |
| ^predicted_pickup_time | integer |  | The predicted date of logistics pickup |
| ^predicted_ship_time | integer |  | Schedule delivery date |
| sender_contact | object |  | The contact info of sender for logistics |
| ^address_detail | object |  | The multilevel address of contact |
| ^^city_id | integer |  | City ID |
| ^^city_name | string |  | City Name |
| ^^country_id | integer |  | Country ID |
| ^^country_name | string |  | Country Name |
| ^^detail | string |  | The detail address under town |
| ^^district_id | integer |  | District ID |
| ^^district_name | string |  | District Name |
| ^^province_id | integer |  | Province ID |
| ^^province_name | string |  | Province Name |
| ^^town_id | integer |  | Town ID |
| ^^town_name | string |  | Town Name |
| ^contact_name | string |  | Contact name |
| ^email | string |  | The email address for contact |
| ^full_address | string |  | The detail address text of contact location |
| ^phone_number | string |  | The phone number of contact |
| ^postal_code | string |  | The  postal code of address |
| shipping_box_quantity | integer |  | The quantity of shipping box |
| total_weight | object |  | The weight of goods which are reserved for shipping |
| ^unit | string |  | The unit of weight, like GRAM/KILOGRAM |
| ^value | string |  | The number of weight |
| warehouse_code | string |  | The code of warehouse that receives goods |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_batch_code | string |  | A delivery-batch-order will be generated for logistics tracking when a delivery-order operated ship by logistics. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSSearchDeliveryOrders

This API is used to search delivery-order information by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gssearch-delivery-orders-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| arrived_time_ge | integer |  | Search delivery orders which the actual arrival time is greater or equal to arrived_time_ge. |
| arrived_time_lt | integer |  | Search delivery orders that the actual arrival time is less than arrived_time_lt. |
| delivery_batch_codes | array<string> |  | A main-logistics-order will be generated for logistics tracking when a delivery-order operated ship by logistics. Up to 50. |
| delivery_order_codes | array<string> |  | Delivery order code,  support multiple selection.Up to 50. |
| delivery_types | array<string> |  | Delivery type, support multiple selection. 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| emergency_levels | array<string> |  | Delivery-Order's Emergency level code. 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | merchant defined product code of skc. Up to 50. |
| external_sku_codes | array<string> |  | merchant defined product code of sku. Up to 50. |
| is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery. |
| latest_status_update_ge | integer |  | Search delivery orders that the time of the latest status update is greater or equal to latest_status_update_ge. |
| latest_status_update_lt | integer |  | Search delivery orders that the time of the latest status update is less than latest_status_update_lt. |
| order_types | array<string> |  | The order type of delivery JIT: Stockup is determined by sales. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset. |
| platform_spu_codes | array<string> |  | Platform-defined spu(Standard Product Unit) code. Up to 50. |
| relative_codes | array<string> |  | The relative code of delivery order, such as stockup order code and abnormal order code. Up to 50. |
| require_arrived_time_ge | integer |  | Search delivery orders that the required arrival time is greater or equal to require_arrived_time_ge. |
| require_arrived_time_lt | integer |  | Search delivery orders that the required arrival time is less than require_arrived_time_lt. |
| ship_time_ge | integer |  | Search delivery orders that the required shipment time  is greater or equal to ship_time_ge. |
| ship_time_lt | integer |  | Search delivery orders that the required shipment time  is less than ship_time_lt. |
| warehouse_codes | array<string> |  | The code list of warehouse which receive goods. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_orders | array<object> |  | The information list of delivery-order. |
| ^^arrived_time | integer |  | The actual time to arrive at the warehouse |
| ^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^code | string |  | Delivery type, support multiple selection. 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| ^^delivery_batch_code | string |  | The code of delivery batch |
| ^^delivery_packages | array<object> |  | The information list of delivery package |
| ^^^logistics_order_code | string |  | The code of  logistics order for delivery package |
| ^^^package_code | string |  | The code of delivery package |
| ^^^skus | array<object> |  | The sku list of delivery package |
| ^^^^quantity | integer |  | The quantity of specified sku in the delivery package |
| ^^^^sku_code | string |  | The code of platform-defined sku |
| ^^delivery_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^delivery_type | string |  | Delivery type, support multiple selection. 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| ^^emergency_level | string |  | Delivery-Order's Emergency level code. 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods which have beeninbound by the warehouse. |
| ^^is_first_order | boolean |  | Whether first delivery order for merchant |
| ^^is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery |
| ^^latest_status_update_time | integer |  | The time of the latest status update. |
| ^^logistics | object |  | The information of delivery-order used logistics |
| ^^^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^mode | string |  | The mode of delivery goods to GS. 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| ^^platform_spu_code | string |  | The code of platform-defined sku. |
| ^^predicted_arrived_time | integer |  | The predicted time to arrive at the warehouse |
| ^^predicted_ship_time | integer |  | The predicted time for merchant delivery goods |
| ^^qualified_quantity | integer |  | The quantity of goods which is quality-check qualified in warehouse. |
| ^^quality_check_result | string |  | The result of quality-check 1. PASS 2. FAIL 3. PART_FAIL |
| ^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^relative_code | string |  | The relative code of delivery order |
| ^^relative_code_type | string |  | The relative code of delivery order, such as stockup order code and abnormal order code. Up to 50 1. STOCKUP_ORDER 2. ABNORMAL_ORDER |
| ^^require_arrived_time | integer |  | The deadline should arrive at the warehouse |
| ^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^sample_code | string |  | The code of sample product |
| ^^sample_status | string |  | The status of sample product management 1. WAIT_FOR_SEND 2. SAMPLE_SENT 3. PLATFORM_SIGNED 4. WAIT_FOR_SUPPLIER_SIGN 5. SUPPLIER_SIGNED 6. CANCELED |
| ^^ship_time | integer |  | The actual time of merchant delivery goods by logistics |
| ^^skc | object |  | The information of platform-defined. |
| ^^^external_skc_code | string |  | The code of supplier-defined skc. |
| ^^^first_key_attribute_name_en | string |  | The first key attribute English-Name of skc |
| ^^^first_key_attribute_name_zh | string |  | The first key attribute Chinese-Name of skc |
| ^^^first_key_attribute_value_en | string |  | The first key attribute English-Value of skc |
| ^^^first_key_attribute_value_zh | string |  | The first key attribute Chinese-Value of skc |
| ^^^platform_skc_code | string |  | The code of  platform-defined skc. |
| ^^skus | array<object> |  | The information list of sku |
| ^^^barcode | string |  | The barcode of platform-defined sku |
| ^^^external_sku_code | string |  | The code of merchant-defined sku |
| ^^^platform_sku_code | string |  | The code of platform-defined sku |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for Platform-defined sku |
| ^^status | string |  | The status code of delivery-order. 1. WAIT_DELIVERY:  wait for merchants to deliver goods 2. DELIVERED: Merchant already delivered goods to GS by logistics. 3. SIGNED: The logistics track shows that it has been signed by the warehouse 4. RECEIVED: The goods have been received and unpacked in the warehouse. 5. IN_QUALITY_CHECK:  The goods are being quality inspected in the warehouse. 6. QUALITY_CHECK_COMPLETED: The goods have finished quality inspected in the warehouse. 7. INBOUND: The goods haveinbounded in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. CANCELED: The delivery order was canceled, merchants didn't need to deliver goods to GS. |
| ^^stockup_type | string |  | The stockup type of delivery JIT: Stockup is determined by sales. NORMAL: Stockup is for sales. |
| ^^unqualified_quantity | integer |  | The quantity of goods which is quality-check unqualified in warehouse. |
| ^^warehouse_code | string |  | warehouse code |
| ^^warehouse_contact | object |  | The contact info of  warehouse |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_id | integer |  | The city ID of  warehouse location |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_id | integer |  | The country ID of the  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_id | integer |  | The district ID of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_id | integer |  | The province ID of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_id | integer |  | The town ID of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contact |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contact |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^warehouse_name | string |  | warehouse name |
| ^next_page_token | string |  | The next page encode. |
| ^total_count | integer |  | The count of stockup order list which search by request conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetSKUPrintDocument

The API is used to generate a printable pdf document for multiple SKUs.

**Path:** `/gs_full_service_shipment/202405/beta/delivery_orders/sku_documents/generate`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsget-skuprint-document-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| dimension | object |  | The dimension info of sku barcord. |
| ^height | string |  | The number of height. |
| ^unit | string |  | The unit of dimension, CENTIMETER. |
| ^width | string |  | The number of width. |
| platform_sku_items | array<object> |  | The information list of platform-defined sku. |
| ^platform_sku_code | string |  | Platform-defined code of sku. |
| ^quantity | integer |  | Specify sku barcode print quantity, Up to  99999. |
| print_sku_code | boolean |  | Whether to print the supplier-defined sku code. |
| stockup_order_code | string |  | The code of stockup order. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^document_url | string |  | The url of a printable pdf document for multiple sku. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSSearchAvailableShippingProviders

This API is used to search the available shipping providers.

**Path:** `/gs_full_service_shipment/202405/beta/shipping_providers/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gssearch-available-shipping-providers-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode of delivery goods to GS. 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| delivery_order_codes | array<string> |  | The list of delivery order, up to 50. |
| sender_contact | object |  | The contact info of sender for logistics |
| ^address_detail | object |  | The multilevel address of contact |
| ^^city_id | integer |  | City ID |
| ^^city_name | string |  | City Name |
| ^^country_id | integer |  | Country ID |
| ^^country_name | string |  | Country Name |
| ^^detail | string |  | The detail address under town |
| ^^district_id | integer |  | District ID |
| ^^district_name | string |  | District Name |
| ^^province_id | integer |  | Province ID |
| ^^province_name | string |  | Province Name |
| ^^town_id | integer |  | Town ID |
| ^^town_name | string |  | Town Name |
| ^contact_name | string |  | Contact name |
| ^email | string |  | The email address for contact |
| ^full_address | string |  | The detail address text of contact location |
| ^phone_number | string |  | Contact phone NO. |
| ^postal_code | string |  | The  postal code of address |
| total_weight | object |  | Enquiry available logistics service provider based on total weight |
| ^unit | string |  | The unit of weight, only support GRAM/KILOGRAM |
| ^value | string |  | The number of weight |
| warehouse_code | string |  | The code of warehouse that merchant deliver goods wants to arrive |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^reserve_arrived_times | array<object> |  | The information about whether the capacity of warehouse  can be reserved at specific time |
| ^^arrived_time | integer |  | The time when goods arrive at warehouse |
| ^^can_reserve | boolean |  | Whether the capacity of warehouse when specify arrival time can be reserve |
| ^shipping_providers | array<object> |  | The list of logistics provider |
| ^^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^max_charge_fee | object |  | The max amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The currency of charge fee, CNY. |
| ^^min_charge_fee | object |  | The min amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The currency of charge fee, CNY. |
| ^^provider_code | string |  | The code of logistics provider which transports supplier's goods to warehouse |
| ^^provider_name | string |  | The name of logistics provider which transports supplier's goods to warehouse |
| ^^reserve_data | array<object> |  | The available reservation information of logistics provider |
| ^^^can_reserve | boolean |  | Whether the shipment time can be reserve |
| ^^^reserve_segments | array<object> |  | The segment list of reservation shipment time |
| ^^^^can_reserve | boolean |  | Whether the shipment time slot can be reserve |
| ^^^^end_time | integer |  | The end time of timeslot |
| ^^^^start_time | integer |  | The start time of timeslot |
| ^^^ship_time | integer |  | The time for shipping goods by logistic |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSSearchStockupOrders

This API is used to search stockup-order information by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202405/beta/stockup_orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gssearch-stockup-orders-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| emergency_levels | array<string> |  | The emergency level of stockup order 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | The code list of merchant defined sku. Up to 50. |
| external_sku_codes | array<string> |  | The code list of merchant defined skc. Up to 50. |
| is_delivery_completed | boolean |  | whether all the require delivery goods had been delivered completely. |
| is_first_order | boolean |  | Whether first stockup order for merchant. Up to 50 |
| is_normal | boolean |  | Whether is normal when deliver goods to GS. |
| latest_status_update_ge | integer |  | Search stockup orders that the time of the latest status update is greater or equal to latest_status_update_ge. |
| latest_status_update_lt | integer |  | Search stockup orders that the time of the latest status update is less than latest_status_update_lt. |
| order_create_time_ge | integer |  | Search delivery order that create time greater or equal to order_create_time_ge. |
| order_create_time_lt | integer |  | Search stockup order that create time less than order_create_time_lt. |
| order_sources | array<string> |  | The source of stockup order creatation 1. PLATFORM: Stockup orders are initiated by the platform. 2. MERCHANT: Stockup orders are initiated by the merchant. 3. ABNORMAL_REDELIVERY: Stockup orders are initiated by the abnormal situation. |
| order_status | array<string> |  | The status of stockup order 1. WAIT_CONFIRM: The stockup order needs to be confirmed or rejected. 2. WAIT_SEND: the goods haven't been shipped by merchant. 3. SENDED: the goods have been shipped by merchant. 4. SIGNED: The logistics track shows that it has been signed by the warehouse 5. RECEIVED: The goods have been received and unpacked in the warehouse. 6. IN_QUALITY_CHECK:  The goods will be quality inspected in the warehouse. 7. QUALITY_CHECK_COMPLETED: The goods completed quality inspected in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. INBOUND: The goods have beeninbound and on shelves in the warehouse. 10. INVAILD: The stockup order was invalid, the merchant doesn't need to prepare goods. |
| order_types | array<string> |  | The type of stockup order 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset |
| platform_sku_codes | array<string> |  | The code list of Platform-defined  sku. Up to 50. |
| platform_spu_codes | array<string> |  | The code list of Platform-defined  spu. Up to 50. |
| require_arrived_time_ge | integer |  | Search stockup order that require arrival time greater or equal to require_arrive_time_ge. |
| require_arrived_time_lt | integer |  | Search stockup order that require arrival time less than require_arrive_time_lt. |
| require_ship_time_ge | integer |  | Search stockup order that require shipment time greater or equal to require_ship_time_ge. |
| require_ship_time_lt | integer |  | Search stockup order that require shipment time less than require_ship_time_lt. |
| stockup_order_codes | array<string> |  | The code list of stockup order. Up to 50. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | The next page encode. |
| ^stockup_orders | array<object> |  | The information list of stockup-order. |
| ^^can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| ^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^code | string |  | The code of stockup-order. |
| ^^create_time | integer |  | The create time of stockup order |
| ^^delivery_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^emergency_level | string |  | The emergency level of stockup order 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods which have been inbound by the warehouse. |
| ^^is_delivery_completed | boolean |  | Whether require goods have already been delivered to GS |
| ^^is_first_order | boolean |  | Whether first stockup order for merchant. |
| ^^is_normal | boolean |  | Whether is normal when deliver goods to GS |
| ^^latest_status_update_time | integer |  | The time of the latest status update. |
| ^^manufacture_mode | string |  | The mode of manufacture 1. OBM_TYPE: Own Branding & Manufacturing 2. ODM_MADE_TO_ORDER: Original Design Manufacture, Make to Order 3. ODM_READY_TO_BUY: Original Design Manufacture, Ready to Buy 4. OEM: Original Equipment Manufacture |
| ^^platform_spu_code | string |  | Platform-defined code of spu. |
| ^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^require_arrived_time | integer |  | Merchant should guarantee all require goods arrived at warehouse of GS before specified time. |
| ^^require_ship_time | integer |  | The required time of merchant begins to ship goods to GS before the merchant should begin to ship goods to GS before the specified time. |
| ^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^skc | object |  | The skc information list of the spu. |
| ^^^external_skc_code | string |  | The merchant defined code of skc. |
| ^^^first_key_attribute_name_en | string |  | The English name of the first key attribute for Platform-defined skc . |
| ^^^first_key_attribute_name_zh | string |  | The Chinese name of the first key attribute for Platform-defined skc. |
| ^^^first_key_attribute_value_en | string |  | The English value of the first key attribute for Platform-defined skc. |
| ^^^first_key_attribute_value_zh | string |  | The Chinese value of the first key attribute for Platform-defined skc. |
| ^^^platform_skc_code | string |  | The platform defined code of skc. |
| ^^skus | array<object> |  | The information list of the sku. |
| ^^^barcode | string |  | The barcode of Platform-defined sku. |
| ^^^delivered_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^^external_sku_code | string |  | The merchant-defined code of sku. |
| ^^^inbound_quantity | integer |  | The quantity of goods which have beeninbound and on shelf by the warehouse. |
| ^^^platform_sku_code | string |  | Platform-defined code of sku. |
| ^^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for Platform-defined sku. |
| ^^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^source | string |  | The source of stockup order creatation. PS: Optional values are listed in description of request params 'order_sources'. |
| ^^status | string |  | The status of stockup-order PS: status machines of stockup-order are listed in description of request param 'order_status' |
| ^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^type | string |  | The type of stockup order 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| ^total_count | integer |  | The count of stockup order list which search by request conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetLogisticsWaybillsPrintDocument

The API is used to get a printable pdf document for multiple logistics waybills.

**Path:** `/gs_full_service_shipment/202405/beta/waybills`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsget-logistics-waybills-print-document-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| logistics_codes | array<string> | Y | The list of  logistics order code. Up to 50. |

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
| ^document_url | string |  | The url of a printable pdf document for multiple logistics waybills. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## CreateDeliveryOrder

This API is used to create a delivery-order for stockup-order.

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/create-delivery-order-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID of supplier |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_order | object |  | The information list for batch delivery order creation |
| ^delivery_items | array<object> |  | The list of delivery item infomation |
| ^^platform_sku_code | string |  | Platform-defined code of sku |
| ^^quantity | integer |  | The quantity of sku |
| ^package_quantity | integer |  | The quantity of delivery package |
| ^packages | array<object> |  | The list of delivery package |
| ^^items | array<object> |  | Delivery package item infomation |
| ^^^platform_sku_code | string |  | Platform-defined code of sku |
| ^^^quantity | integer |  | The quantity of spu |
| ^stockup_order_code | string |  | The code of stockup order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_order_code | string |  | Delivery order code |
| ^stockup_order_code | string |  | Stockup order code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ConfirmDelivery

This API is used to Confirm that the delivery order has been completed.

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders/confirm`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/confirm-delivery-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | The platform-defined ID for supplier. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_order_code | string |  | The code of delivery order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QueryDeliveryBatchs

This API is used to query delivery batch information by multi delivery batch codes.

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders/delivery_batchs`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/query-delivery-batchs-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | The platform-defined ID for supplier. |
| delivery_batch_codes | array<string> | Y | The list of  logistics order codes. Up to 50 |

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
| ^delivery_batchs | array<object> |  | The information of delivery batch |
| ^^code | string |  | The code of delivery batch |
| ^^create_time | integer |  | The time of main-logistics order creatation |
| ^^logistics | object |  | The information of logistics |
| ^^^delivery_option | string |  | The type of logistics express, all values are listed below: 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^^shipping_provider_name | string |  | The code of logistics provider which transports merchant's goods to warehouse |
| ^^logistics_order_quantity | integer |  | The quantity of  logistics order under the main logistics order |
| ^^logistics_orders | array<object> |  | The information list of logistics order |
| ^^^code | string |  | The code of  logistics order |
| ^^^failed_reason | string |  | The failure reason of logistics order creatation |
| ^^^package_weight | object |  | The weight of  logistics package |
| ^^^^unit | string |  | The unit of  logistics package weight, like GRAM/KILOGRAM |
| ^^^^value | integer |  | The number of  logistics package weight |
| ^^^status | string |  | The status of  logistics order creatation, all values are listed below: 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. SHIPPED 8. SHIPPED_ABNORMAL 9. DELIVERED 10. DELIVERED_ABNORMAL 11. SIGNED 12. FINISHED 13. CANCELED 14. RETURNING_TO_SENDER 15. RETURNED_TO_SENDER |
| ^^^tracking_number | string |  | The track no of  logistics order |
| ^^^tracking_records | array<object> |  | The  track records of logistics track |
| ^^^^message | string |  | The standard message of logistic track record |
| ^^^^title | string |  | The title of logistics track record |
| ^^^^update_time | integer |  | The time of logistic track record |
| ^^logistics_package_quantity | integer |  | The quantity of  logistics package under the main logistics order |
| ^^logistics_picker_name | string |  | The name of logistics picker that packed goods to transport |
| ^^logistics_picker_phone | string |  | The phone_number of logistics picker |
| ^^predicted_arrive_time | integer |  | The predicted arrival time is based on schedule shipping time |
| ^^predicted_pick_info | object |  | Make an appointment for pick-up time |
| ^^^end_time | integer |  | Predict pick-up end time |
| ^^^start_time | integer |  | Predict pick-up start time |
| ^^predicted_ship_time | integer |  | Schedule shipping time |
| ^^receiver_contact | object |  | The contact information of receiver |
| ^^^address_detail | object |  | The multilevel address info of contact |
| ^^^^city_id | integer |  | City ID |
| ^^^^city_name | string |  | City Name |
| ^^^^country_id | integer |  | Country ID |
| ^^^^country_name | string |  | Country name |
| ^^^^detail | string |  | The detail address under town |
| ^^^^district_id | integer |  | District ID |
| ^^^^district_name | string |  | District name |
| ^^^^province_id | integer |  | Province ID |
| ^^^^province_name | string |  | Province Name |
| ^^^^town_id | integer |  | Town ID |
| ^^^^town_name | string |  | Town name |
| ^^^contact_name | string |  | Contact name |
| ^^^email | string |  | Email address area |
| ^^^full_address | string |  | Detail address of  contact |
| ^^^phone_number | string |  | Phone number |
| ^^^postal_code | string |  | Postal code |
| ^^sender_contact | object |  | The contact information of sender |
| ^^^address_detail | object |  | The multilevel address info of contact |
| ^^^^city_id | integer |  | City ID |
| ^^^^city_name | string |  | City name |
| ^^^^country_id | integer |  | Country ID |
| ^^^^country_name | string |  | Country Name |
| ^^^^detail | string |  | The detail address under town |
| ^^^^district_id | integer |  | District ID |
| ^^^^district_name | string |  | District name |
| ^^^^province_id | integer |  | Province ID |
| ^^^^province_name | string |  | Province Name |
| ^^^^town_id | integer |  | Town ID |
| ^^^^town_name | string |  | Town name |
| ^^^contact_name | string |  | Contact name |
| ^^^email | string |  | Email address area |
| ^^^full_address | string |  | Detail address of  contact |
| ^^^phone_number | string |  | Phone number |
| ^^^postal_code | string |  | Postal code |
| ^^status | string |  | The status of delivery batch, all values are listed below： 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. PARTIAL_SHIPPED 8. SHIPPED_ABNORMAL 9. SHIPPED 10. PARTIAL_DELIVERED 11. DELIVERED 12. PARTIAL_SIGNED 13. SIGNED 14. CANCELED 15. RETURNING_TO_SENDER 16. RETURNED_TO_SENDER |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetDelivery-OrderPrintDocument

The API is used to get delivery-order print document.

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders/documents`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-delivery-order-print-document-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID of supplier |
| delivery_order_codes | array<string> | Y | The list of delivery order code Up to 50 |

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
| ^document_url | string |  | The url of a printable pdf document for multiple delivery order |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## ReserveShipping

This API is used to reserve shipping for multi delivery-order.

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders/reserve_ship`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/reserve-shipping-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID of supplier |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode that supplier deliver goods to warehouse of GS. |
| delivery_order_codes | array<string> |  | The code list of delivery order，Up to 50. |
| logistics | object |  | The information of logistics |
| ^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^shipping_provider_code | string |  | The name of shipping provider |
| ^shipping_provider_name | string |  | The code of shipping provider |
| reserve | object |  | The reserve information for shipment |
| ^predicted_arrived_time | integer |  | The predicted arrival date is based on reservation shipment time |
| ^predicted_pickup_ge | integer |  | The start time of Schedule delivery timeslot |
| ^predicted_pickup_lt | integer |  | The end time of Schedule delivery timeslot |
| ^predicted_pickup_time | integer |  | The predicted date of logistics pickup |
| ^predicted_ship_time | integer |  | Schedule delivery date |
| sender_contact | object |  | The unit of weight, like GRAM/KILOGRAM |
| ^address_detail | object |  | The multilevel address of contact |
| ^^city_id | integer |  | City ID |
| ^^city_name | string |  | City Name |
| ^^country_id | integer |  | Country ID |
| ^^country_name | string |  | Country Name |
| ^^detail | string |  | The detail address under town |
| ^^district_id | integer |  | District ID |
| ^^district_name | string |  | District Name |
| ^^province_id | integer |  | Province ID |
| ^^province_name | string |  | Province Name |
| ^^town_id | integer |  | Town ID |
| ^^town_name | string |  | Town Name |
| ^contact_name | string |  | Contact name |
| ^email | string |  | The email address for contact |
| ^full_address | string |  | The detail address text of contact location |
| ^phone_number | string |  | Contact phone NO. |
| ^postal_code | string |  | The  postal code of address |
| total_weight | object |  | The weight of goods which are reserved for shipping. |
| ^unit | string |  | The unit of weight, like GRAM/KILOGRAM. |
| ^value | string |  | The number of weight. |
| warehouse_code | string |  | The code of warehouse that receives goods. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_batch_code | string |  | Main logistics order belong to Delivery order |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchDeliveryOrders

Search Delivery Orders

**Path:** `/gs_full_service_shipment/202405/preview/delivery_orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-delivery-orders-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID of merchant |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| arrived_time_ge | integer |  | Search delivery orders which the actual arrival time is greater or equal to arrived_time_ge. |
| arrived_time_lt | integer |  | Search delivery orders that the actual arrival time is less than arrived_time_lt. |
| delivery_batch_codes | array<string> |  | A main-logistics-order will be generated for logistics tracking when a delivery-order operated ship by logistics.Up to 50 |
| delivery_order_codes | array<string> |  | Delivery order code,  support multiple selection.Up to 50 |
| delivery_types | array<string> |  | Delivery type, support multiple selection. 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| emergency_levels | array<string> |  | Delivery-Order's Emergency level code. 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | merchant defined product code of skc.Up to 50 |
| external_sku_codes | array<string> |  | merchant defined product code of sku.Up to 50 |
| is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery |
| order_types | array<string> |  | The order type of delivery JIT: Stockup is determined by sales. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset. |
| platform_spu_codes | array<string> |  | Platform-defined spu(Standard Product Unit) code.Up to 50 |
| relative_codes | array<string> |  | The relative code of delivery order, such as stockup order code and abnormal order code. Up to 50 |
| require_arrived_time_ge | integer |  | Search delivery orders that the require arrival time is greater or equal to require_arrived_time_ge. |
| require_arrived_time_lt | integer |  | Search delivery orders that the require arrival time less than require_arrived_time_lt. |
| ship_time_ge | integer |  | Search delivery orders that the require shipment time  is greater or equal to ship_time_lt. |
| ship_time_lt | integer |  | Search delivery orders that the require shipment time  is less than ship_time_lt. |
| warehouse_codes | array<string> |  | warehouse code |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_orders | array<object> |  | The information list of delivery-order |
| ^^arrived_time | integer |  | The actual time to arrive at the warehouse |
| ^^category_id | string |  | The category ID of product which has been defined by platform |
| ^^code | string |  | Delivery order code |
| ^^delivery_batch_code | string |  | The code of delivery batch |
| ^^delivery_packages | array<object> |  | The list of package for delivery-order |
| ^^^logistics_order_code | string |  | The code of  logistics order for delivery package |
| ^^^package_code | string |  | The code of delivery package |
| ^^^skus | array<object> |  | The sku list of delivery package |
| ^^^^quantity | integer |  | The quantity of specified sku in the delivery package |
| ^^^^sku_code | string |  | The code of platform-defined sku |
| ^^delivery_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^delivery_type | string |  | Delivery type, support multiple selection. 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| ^^emergency_level | string |  | Delivery-Order's Emergency level code. 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods which have beeninbound by the warehouse. |
| ^^is_first_order | boolean |  | Whether first delivery order for merchant |
| ^^is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery |
| ^^logistics | object |  | The information of delivery-order used logistics |
| ^^^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^mode | string |  | Delivery mode 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| ^^platform_spu_code | string |  | The code of platform-defined sku |
| ^^predicted_arrived_time | integer |  | The predicted time to arrive at the warehouse |
| ^^predicted_ship_time | integer |  | The predicted time for merchant delivery goods |
| ^^qualified_quantity | integer |  | The quantity of goods which is quality-check qualified in warehouse. |
| ^^quality_check_result | string |  | The result of quality-check 1. PASS 2. FAIL 3. PART_FAIL |
| ^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^relative_code | string |  | The relative code of delivery order |
| ^^relative_code_type | string |  | The relative code of delivery order, such as stockup order code and abnormal order code.Up to 50 1. STOCKUP_ORDER 2. ABNORMAL_ORDER |
| ^^require_arrived_time | integer |  | The deadline should arrive at the warehouse |
| ^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^sample_code | string |  | The code of sample product |
| ^^sample_status | string |  | The status of sample product management 1. WAIT_FOR_SEND 2. SAMPLE_SENT 3. PLATFORM_SIGNED 4. WAIT_FOR_SUPPLIER_SIGN 5. SUPPLIER_SIGNED 6. CANCELED |
| ^^ship_time | integer |  | The actual time of merchant delivery goods by logistics |
| ^^skc | object |  | The information of platform-defined |
| ^^^external_skc_code | string |  | The code of supplier-defined skc |
| ^^^first_key_attribute_name_en | string |  | The first key attribute English-Name of skc |
| ^^^first_key_attribute_name_zh | string |  | The first key attribute Chinese-Name of skc |
| ^^^first_key_attribute_value_en | string |  | The first key attribute English-Value of skc |
| ^^^first_key_attribute_value_zh | string |  | The first key attribute Chinese-Value of skc |
| ^^^platform_skc_code | string |  | The code of  platform-defined skc |
| ^^skus | array<object> |  | The information list of sku |
| ^^^barcode | string |  | The barcode of platform-defined sku |
| ^^^external_sku_code | string |  | The code of merchant-defined sku |
| ^^^platform_sku_code | string |  | The code of platform-defined sku |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for Platform-defined sku |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for Platform-defined sku |
| ^^status | string |  | The status code of delivery-order. 1. WAIT_DELIVERY:  wait for merchant deliver goods 2. DELIVERED: Merchant already delivered goods to GS by logistics. 3. SIGNED: The logistics track shows that it has been signed by the warehouse 4. RECEIVED: The goods have been received and unpacked in the warehouse. 5. IN_QUALITY_CHECK:  The goods are being quality inspected in the warehouse. 6. QUALITY_CHECK_COMPLETED: The goods have finished quality inspected in the warehouse. 7. INBOUND: The goods haveinbounded in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. CANCELED: The delivery order was canceled, merchants didn't need to deliver goods to GS |
| ^^stockup_type | string |  | The stockup type of delivery JIT: Stockup is determined by sales. NORMAL: Stockup is for sales. |
| ^^unqualified_quantity | integer |  | The quantity of goods which is quality-check unqualified in warehouse. |
| ^^warehouse_code | string |  | warehouse code |
| ^^warehouse_contact | object |  | The contact info of  warehouse |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_id | integer |  | The city ID of  warehouse location |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_id | integer |  | The country ID of the  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_id | integer |  | The district ID of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_id | integer |  | The province ID of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_id | integer |  | The town ID of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contacts |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contacts |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^warehouse_name | string |  | warehouse name |
| ^next_page_token | string |  | The next page encode |
| ^total_count | integer |  | The count of stockup order list which search by request conditions |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchAvailableShippingProviders

This API is used to search the available shipping providers.

**Path:** `/gs_full_service_shipment/202405/preview/shipping_providers/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-available-shipping-providers-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID of supplier. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode of delivery goods to GS. 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| delivery_order_codes | array<string> |  | The list of delivery order |
| sender_contact | object |  | The contact info of sender for logistics |
| ^address_detail | object |  | The multilevel address of contact |
| ^^city_id | integer |  | City ID |
| ^^city_name | string |  | City Name |
| ^^country_id | integer |  | Country ID |
| ^^country_name | string |  | Country Name |
| ^^detail | string |  | The detail address under town |
| ^^district_id | integer |  | District ID |
| ^^district_name | string |  | District Name |
| ^^province_id | integer |  | Province ID |
| ^^province_name | string |  | Province Name |
| ^^town_id | integer |  | Town ID |
| ^^town_name | string |  | Town Name |
| ^contact_name | string |  | Contact name |
| ^email | string |  | The email address for contact |
| ^full_address | string |  | The detail address text of contact location |
| ^phone_number | string |  | Contact phone NO. |
| ^postal_code | string |  | The  postal code of address |
| total_weight | object |  | Enquiry available logistics service provider based on total weight |
| ^unit | string |  | The unit of weight, like GRAM/KILOGRAM. |
| ^value | string |  | The number of weight |
| warehouse_code | string |  | The code of warehouse that merchant deliver goods wants to arrive |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^reserve_arrived_times | array<object> |  | The information about whether the capacity of warehouse  can be reserved at specific time |
| ^^arrived_time | integer |  | The time when goods arrive at warehouse |
| ^^can_reserve | boolean |  | Whether the capacity of warehouse when specify arrival time can be reserve |
| ^shipping_providers | array<object> |  | The list of logistics provider |
| ^^delivery_option | string |  | The type of logistics express 1. SUPER_SPEEDY_EXPRESS 2. SPEEDY_EXPRESS 3. STANDARD_EXPRESS |
| ^^max_charge_fee | object |  | The max amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The currency of charge fee, CNY. |
| ^^min_charge_fee | object |  | The min amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The currency of charge fee, CNY. |
| ^^provider_code | string |  | The code of logistics provider which transports supplier's goods to warehouse |
| ^^provider_name | string |  | The name of logistics provider which transports supplier's goods to warehouse |
| ^^reserve_data | array<object> |  | The available reservation information of logistics provider |
| ^^^can_reserve | boolean |  | Whether the shipment time can be reserve |
| ^^^reserve_segments | array<object> |  | The segment list of reservation shipment time |
| ^^^^can_reserve | boolean |  | Whether the shipment time slot can be reserve |
| ^^^^end_time | integer |  | The end time of timeslot |
| ^^^^start_time | integer |  | The start time of timeslot |
| ^^^ship_time | integer |  | The time for shipping goods by logistic |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchStockupOrders

This API is used to search stockup-order information by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202405/preview/stockup_orders/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/search-stockup-orders-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | Platform-defined ID for supplier. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| emergency_levels | array<string> |  | The emergency level of stockup order 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | The code list of merchant defined skc. Up to 50 |
| external_sku_codes | array<string> |  | The code list of merchant defined sku. Up to 50 |
| is_delivery_completed | boolean |  | whether all the require delivery goods had been delivered completely |
| is_first_order | boolean |  | Whether first stockup order for supplier.Up to 50 |
| is_normal | boolean |  | Whether is normal when deliver goods to GS. |
| order_create_time_ge | integer |  | Search delivery order that create time greater or equal to order_create_time_ge. |
| order_create_time_lt | integer |  | Search stockup order that create time less than order_create_time_lt. |
| order_sources | array<string> |  | The source of stockup order creatation 1. PLATFORM: Stockup orders are initiated by the platform. 2. MERCHANT: Stockup orders are initiated by the merchant. 3. ABNORMAL_REDELIVERY: Stockup orders are initiated by the abnormal situation. |
| order_status | array<string> |  | The status of stockup order 1. WAIT_CONFIRM: The stockup order needs to be confirmed or rejected. 2. WAIT_SEND: the goods haven't been shipped by merchant. 3. SENDED: the goods have been shipped by merchant. 4. SIGNED: The logistics track shows that it has been signed by the warehouse 5. RECEIVED: The goods have been received and unpacked in the warehouse. 6. IN_QUALITY_CHECK:  The goods will be quality inspected in the warehouse. 7. QUALITY_CHECK_COMPLETED: The goods completed quality inspected in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. INBOUND: The goods have beeninbound and on shelves in the warehouse. 10. INVAILD: The stockup order was invalid, the merchant doesn't need to prepare goods. |
| order_types | array<string> |  | The type of stockup order 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset |
| platform_sku_codes | array<string> |  | The code list of sku.Up to 50 |
| platform_spu_codes | array<string> |  | The code list of spu.Up to 50 |
| require_arrived_time_ge | integer |  | Search stockup order that require arrival time greater or equal to require_arrive_time_ge. |
| require_arrived_time_lt | integer |  | Search stockup order that require arrival time less than require_arrive_time_ge. |
| require_ship_time_ge | integer |  | Search stockup order that require shipment time greater or equal to require_ship_time_ge. |
| require_ship_time_lt | integer |  | Search stockup order that require shipment time less than require_ship_time_ge. |
| stockup_order_codes | array<string> |  | The code list of stockup order. Up to 50 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | The next page encode |
| ^stockup_orders | array<object> |  | The information list of stockup-order. |
| ^^can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| ^^category_id | string |  | The category ID of product which has been defined by platform |
| ^^code | string |  | The code of stockup-order. |
| ^^create_time | integer |  | The create time of stockup order |
| ^^delivery_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^emergency_level | string |  | The emergency level of stockup order 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods which have been inbound by the warehouse. |
| ^^is_delivery_completed | boolean |  | Whether require goods have already been delivered to GS |
| ^^is_first_order | boolean |  | Whether first stockup order for merchant. |
| ^^is_normal | boolean |  | Whether is normal when deliver goods to GS |
| ^^manufacture_mode | string |  | The mode of manufacture 1. OBM_TYPE: Own Branding & Manufacturing 2. ODM_MADE_TO_ORDER: Original Design Manufacture, Make to Order 3. ODM_READY_TO_BUY: Original Design Manufacture, Ready to Buy 4. OEM: Original Equipment Manufacture |
| ^^platform_spu_code | string |  | Platform-defined code of spu |
| ^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^require_arrived_time | integer |  | Merchant should guarantee all require goods arrived at warehouse of GS before specified time. |
| ^^require_ship_time | integer |  | The required time of merchant begins to ship goods to GS before the merchant should begin to ship goods to GS before the specified time. |
| ^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^skc | object |  | The skc information list of the spu |
| ^^^external_skc_code | string |  | The merchant defined code of skc |
| ^^^first_key_attribute_name_en | string |  | The English name of the first key attribute for Platform-defined skc |
| ^^^first_key_attribute_name_zh | string |  | The Chinese name of the first key attribute for Platform-defined skc |
| ^^^first_key_attribute_value_en | string |  | The English value of the first key attribute for Platform-defined skc |
| ^^^first_key_attribute_value_zh | string |  | The Chinese value of the first key attribute for Platform-defined skc |
| ^^^platform_skc_code | string |  | The platform defined code of skc |
| ^^skus | array<object> |  | The information list of the spu. |
| ^^^barcode | string |  | The barcode of Platform-defined sku. |
| ^^^delivered_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^^external_sku_code | string |  | The merchant-defined code of sku. |
| ^^^inbound_quantity | integer |  | The quantity of goods which have beeninbound and on shelf by the warehouse. |
| ^^^platform_sku_code | string |  | Platform-defined code of sku. |
| ^^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for Platform-defined sku. |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for Platform-defined sku. |
| ^^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^source | string |  | The source of stockup order creatation |
| ^^status | string |  | The status of stockup-order PS: status machines of stockup-order are listed in request params |
| ^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^type | string |  | The type of stockup order 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| ^total_count | integer |  | The count of stockup order list which search by request conditions |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetLogisticsWaybillsPrintDocurement

The API is used to get a printable pdf document for multiple logistics waybills.

**Path:** `/gs_full_service_shipment/202405/preview/waybills`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/get-logistics-waybills-print-docurement-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | The platform-defined ID for supplier. |
| logistics_codes | array<string> | Y | The list of  logistics order codes. Up to 50 |

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
| ^document_url | string |  | The url of a printable pdf document for multiple logistics waybills. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchAbnormalOrders

This API is used to search abnormal-order information by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202407/abnormal_orders/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-abnormal-orders-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| abnormal_order_codes | array<string> |  | The abnormal order codes. The length is no more than 50. |
| abnormal_types | array<string> |  | The list of abnormal type. Possible enumerations are: 1. AT_PLATFORM_DELIVERY_TRANS_TIMEOUT：Shipping timeout of platform logistics 2. AT_SELF_DELIVERY_TRANS_TIMEOUT：Shipping timeout of self delivery 3. AT_LOGISTICS_DAMAGE：Shipment damage 4. AT_LOGISTICS_PKG_ATTACH_MULTI_DELIVERY_ORDER：Multiple delivery orders are attached to the logistics package 5. AT_DELIVERY_PKG_BOX_MARK_NO_RECOGNIZED：The logistics parcel mark can not be recognized 6. AT_DELIVERY_PACKAGE_NO_BOX_MARK：The delivery package is not labeled 7. AT_DELIVERY_ORDER_NO_DELIVERYED：The delivery order isn't confirmed. 8. AT_DELIVERY_ORDER_CANCELED：The delivery order has been cancelled 9. AT_QUANTITY_ABNORMAL_MORE：The quantity of goods exceeds expectation 10. AT_MISPLACED_GOODS：Wrong goods 11. AT_WRONG_BARCODE：The barcode is wrong labelled 12. AT_BARCODE_DAMAGED_DIRTY：The barcode is damaged or dirty 13. AT_PRODUCT_EXPANSION_BAG：The package of product is bulging 14. AT_PRODUCT_DAMAGED_DIRTY：The product is damaged or soiled 15. AT_MISSING_PACKAGE：The goods exceed the size limit 16. AT_ABNORMAL_QUANTITY：Shortage of goods 17. AT_DELIVERY_PKG_NO_ARRIVE_WAREHOUSE：The delivery package has not arrived 18. AT_ABNORMAL_QUALITY：Failed in the quality check during inbound. 19. AT_INSPECT_QUALITY：Failed in the quality check during inspection. |
| delivery_order_codes | array<string> |  | The delivery order codes. The length is no more than 50. |
| external_skc_codes | array<string> |  | The SKC code list of your OMS. The length is no more than 50. |
| external_sku_codes | array<string> |  | The SPU code of your OMS. The length is no more than 50. |
| latest_update_time_ge | integer |  | The latest update time is greater than or equal to the UNIX timestamp. |
| latest_update_time_lt | integer |  | The latest update time is less than or equal to the UNIX timestamp. |
| order_create_time_ge | integer |  | The creation time is greater than or equal to the UNIX timestamp. |
| order_create_time_lt | integer |  | The creation time is greater than or equal to the UNIX timestamp. |
| page_size | integer |  | Page size. The range is `[0, 50]`. 10 by default. |
| page_token | string |  | Page offset. `1` by default. |
| platform_sku_codes | array<string> |  | The SKU code of TikTok Shop. The length is no more than 50. |
| platform_spu_codes | array<string> |  | The SPU code of TikTok Shop.  less or equal to 50. |
| relative_return_status | array<string> |  | The list of status of return order. Possible enumerations are: 1. OPERATER_CONFIRMING：Merchants have initiated the return order. The order is yet to be confirmed by the platform. 2. MERCHANT_CONFIRMING：Platform has initiated the return order. The order is yet to be confirmed by the merchants. 3. TO_TRANSIT: Waiting for transit in the warehouse. 4. IN_TRANSIT: transiting in the warehouse. 5. OUTBOUND：Transit finished in the warehouse. Ready for pick up. 6. SHIPPED： Return packages have been collected by logistics. 7. COMPLETED：The return process has been completed. 8. CANCELED：The return process has been cancelled. |
| stockup_order_codes | array<string> |  | The stockup order codes. The length is no more than 50. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^abnormal_orders | array<object> |  | The information of abnormal order list |
| ^^abnormal_quantity | string |  | The count of abnormality |
| ^^abnormality_register_image_url | string |  | The image url address when abnormal register |
| ^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^code | string |  | The code of abnormal order. |
| ^^create_time | integer |  | The creation time of abnormal order |
| ^^delivery_order_code | string |  | The code of the delivery order |
| ^^handle_method | string |  | Actions of handling the abnormal situation. |
| ^^inspect_order_code | string |  | The code of the inspection order |
| ^^platform_spu_code | string |  | The SPU code of TikTok Shop. |
| ^^quality_check_result | string |  | The result of the quality check |
| ^^relative_return_status | string |  | The list of status of return order. Possible enumerations are: 1. OPERATER_CONFIRMING：Merchants have initiated the return order. The order is yet to be confirmed by the platform. 2. MERCHANT_CONFIRMING：Platform has initiated the return order. The order is yet to be confirmed by the merchants. 3. TO_TRANSIT: Waiting for transit in the warehouse. 4. IN_TRANSIT: transiting in the warehouse. 5. OUTBOUND：Transit finished in the warehouse. Ready for pick up. 6. SHIPPED： Return packages have been collected by logistics. 7. COMPLETED：The return process has been completed. 8. CANCELED：The return process has been cancelled. |
| ^^remark | string |  | The remark of handling abnormal order. |
| ^^return_order_code | string |  | The code of the return order |
| ^^skc | object |  | The information for SKC of TikTok Shop. |
| ^^^external_skc_code | string |  | The SKC code of your OMS. |
| ^^^first_key_attribute_name_en | string |  | The first key attribute is the English name of skc |
| ^^^first_key_attribute_name_zh | string |  | The first key attribute Chinese Name of skc |
| ^^^first_key_attribute_value_en | string |  | The first key attribute English value of skc |
| ^^^first_key_attribute_value_zh | string |  | The first key attribute Chinese value of skc |
| ^^^image_url | string |  | The snapshot of the SKC when creating the order. |
| ^^^platform_skc_code | string |  | The SKC code of TikTok Shop |
| ^^skus | array<object> |  | The information list for SKU of TikTok Shop. |
| ^^^abnormal_quantity | integer |  | The abnormal quantity for sku. |
| ^^^barcode | string |  | The SKU barcode of TikTok Shop. |
| ^^^external_sku_code | string |  | The SKU code of your OMS. |
| ^^^platform_sku_code | string |  | The SKU code of TikTok Shop. |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for SKU of TikTok Shop. . |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for SKU of TikTok Shop. |
| ^^stockup_order_code | string |  | The code of the stockup order |
| ^^type | string |  | The list of abnormal type. Possible enumerations are: 1. AT_PLATFORM_DELIVERY_TRANS_TIMEOUT：Shipping timeout of platform logistics 2. AT_SELF_DELIVERY_TRANS_TIMEOUT：Shipping timeout of self delivery 3. AT_LOGISTICS_DAMAGE：Shipment damage 4. AT_LOGISTICS_PKG_ATTACH_MULTI_DELIVERY_ORDER：Multiple delivery orders are attached to the logistics package 5. AT_DELIVERY_PKG_BOX_MARK_NO_RECOGNIZED：The logistics parcel mark can not be recognized 6. AT_DELIVERY_PACKAGE_NO_BOX_MARK：The delivery package is not labeled 7. AT_DELIVERY_ORDER_NO_DELIVERYED：The delivery order hasn't been confirmed shipment 8. AT_DELIVERY_ORDER_CANCELED: The delivery order has been cancelled 9. AT_QUANTITY_ABNORMAL_MORE: The quantity of goods is excessive 10. AT_MISPLACED_GOODS: Wrong goods 11. AT_WRONG_BARCODE: The barcode is wrong labelled 12. AT_BARCODE_DAMAGED_DIRTY: The barcode is damaged or dirty 13. AT_PRODUCT_EXPANSION_BAG: The package of product is bulging 14. AT_PRODUCT_DAMAGED_DIRTY: The product is damaged or soiled 15. AT_MISSING_PACKAGE: The goods exceed the size limit 16. AT_ABNORMAL_QUANTITY：Shortage of goods 17. AT_PLATFORM_DELIVERY_TRANS_TIMEOUT：The delivery package has not arrived 18. AT_ABNORMAL_QUALITY：Failed in the quality check during inbound. 19. AT_INSPECT_QUALITY：Failed in the quality check during inspection. |
| ^next_page_token | string |  | The next page encode |
| ^total_count | integer |  | The count of abnormal orders. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingReserveShipment

This API is used to reserve shipping for multi delivery-order.

**Path:** `/gs_full_service_shipment/202407/delivery_orders/reserve_ship`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-reserve-shipment-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode that merchant deliver goods to the warehouse of GS. Possible enumerations are: 1. PLATFORM_DELIVERY 2. SELF_DELIVERY |
| delivery_order_codes | array<string> |  | The code list of delivery orders, less or equal to 50. |
| logistics | object |  | The information of logistics If delivery_mode == PLATFORM_DELIVERY, the field is required. |
| ^delivery_option | string |  | The type of the delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^shipping_provider_code | string |  | The code of the logistic provider. If `delivery_mode == PLATFORM_DELIVERY`, the value is required. |
| ^shipping_provider_name | string |  | The name of logistics provider |
| reserve | object |  | The reserve information for shipment |
| ^predicted_arrived_time | integer |  | The predicted arrival time is based on reservation shipment time |
| ^predicted_pickup_ge | integer |  | The start time of Schedule delivery timeslot |
| ^predicted_pickup_lt | integer |  | The end time of Schedule delivery timeslot |
| ^predicted_pickup_time | integer |  | The predicted datetime of logistics pickup |
| ^predicted_ship_time | integer |  | Schedule delivery datetime |
| sender_contact_id | string |  | The ID of the sender. If `delivery_mode == PLATFORM_DELIVERY`, the value is required |
| shipping_box_quantity | integer |  | The quantity of shipping boxes |
| total_weight | object |  | Total weight |
| ^unit | string |  | The unit. Possible enumerations are: - `"GRAM"` - `"KILOGRAM"` |
| ^value | string |  | value |
| warehouse_code | string |  | The code of warehouse that receives goods |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^logistics_order | string |  | Main logistics order belong to Delivery order |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchDeliveryOrders

This API is used to list delivery orders by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202407/delivery_orders/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-delivery-orders-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| arrived_time_ge | integer |  | Search delivery orders which the actual arrival time is greater or equal to arrived_time_ge. |
| arrived_time_lt | integer |  | Search delivery orders that the actual arrival time is less than arrived_time_lt. |
| delivery_order_codes | array<string> |  | Delivery order code,  supports multiple selection. less or equal to 50. |
| delivery_types | array<string> |  | Delivery type, possible enumerations are: 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Redelivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Redelivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Redelivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| emergency_levels | array<string> |  | Delivery Order's Emergency level code. Possible enumerations are: 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | The SKC code of your OMS.  less or equal to 50. |
| external_sku_codes | array<string> |  | The SKU code of your OMS. less or equal to 50. |
| is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery. |
| latest_status_update_ge | integer |  | Search delivery orders that the time of the latest status update is greater or equal to latest_status_update_ge. |
| latest_status_update_lt | integer |  | Search delivery orders that the time of the latest status update is less than latest_status_update_lt. |
| logistics_orders | array<string> |  | A main logistics order will be generated for logistics tracking when a delivery order is operated ship by logistics. less or equal to 50. |
| order_types | array<string> |  | The order type of delivery JIT: Stockup is determined by sales. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset, `1` by default. |
| platform_spu_codes | array<string> |  | The SPU code of TikTok Shop.  less or equal to 50. |
| relative_codes | array<string> |  | The relative code of delivery order, such as stockup order code and abnormal order code. less or equal to 50. |
| require_arrived_time_ge | integer |  | Search delivery orders that the required arrival time is greater or equal to require_arrived_time_ge. |
| require_arrived_time_lt | integer |  | Search delivery orders that the required arrival time is less than require_arrived_time_lt. |
| ship_time_ge | integer |  | Search delivery orders that the required shipment time  is greater or equal to ship_time_ge. |
| ship_time_lt | integer |  | Search delivery orders that the required shipment time  is less than ship_time_lt. |
| warehouse_codes | array<string> |  | The code list of warehouse which receive goods. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^delivery_orders | array<object> |  | The information list of delivery-order. |
| ^^arrived_time | integer |  | The actual time to arrive at the warehouse |
| ^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^code | string |  | Delivery order code. |
| ^^delivered_quantity | integer |  | The quantity of goods shipped from the merchant. |
| ^^delivery_packages | array<object> |  | The information list of delivery package |
| ^^^package_code | string |  | The code of delivery package. |
| ^^^skus | array<object> |  | The sku list of the delivery package. |
| ^^^^quantity | integer |  | The quantity of specified sku in the delivery package |
| ^^^^sku_code | string |  | The SKU code of TikTok Shop. |
| ^^delivery_type | string |  | Delivery type, possible enumerations are: 1. DELIVERY_NORMAL: Delivery of normal stockup process. 2. DEFECTIVE_REPAIR: Re-delivery of partial defective products returned for repair. 3. ALL_RETURN_REPAIR: Re-delivery of all defective products returned for repair. 4. LESS_SUPPLEMENT: Re-delivery of shortage of delivery quantity. 5. LOGISTICS_IN_BATCH: The logistics provider delivers the goods to the warehouse in multiple batches. 6. REPLENISH_IN_WAREHOUSE: The platform receives goods in multiple batches in the warehouse. |
| ^^emergency_level | string |  | Delivery-Order's Emergency level code. Possible enumerations are: 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods inbounded by the warehouse. |
| ^^is_first_order | boolean |  | Whether first delivery order for merchant |
| ^^is_sample_included | boolean |  | Whether sample product should be sent with bulk delivery |
| ^^latest_status_update_time | integer |  | The time of the latest status update. |
| ^^logistics | object |  | The information of delivery order used logistics |
| ^^^delivery_option | string |  | The type of the delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^^^logistics_order | string |  | The code of delivery batch |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^mode | string |  | The mode of delivery goods to GS. Possible enumerations are: 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| ^^platform_spu_code | string |  | The SKU code of TikTok Shop. |
| ^^predicted_arrived_time | integer |  | The predicted time to arrive at the warehouse |
| ^^predicted_ship_time | integer |  | The predicted time for merchant delivery goods |
| ^^qualified_quantity | integer |  | The quantity of goods confirmed qualified by the warehouse. |
| ^^quality_check_result | string |  | The result of quality-check. Possible enumerations are: 1. PASS 2. FAIL 3. PART_FAIL |
| ^^received_quantity | integer |  | The quantity of goods confirmed received by the warehouse. |
| ^^relative_code | string |  | The relative code of delivery order |
| ^^relative_code_type | string |  | The relative code of delivery order, such as stockup order code and abnormal order code. Possible enumerations are: 1. STOCKUP_ORDER 2. ABNORMAL_ORDER |
| ^^require_arrived_time | integer |  | The deadline should arrive at the warehouse |
| ^^returned_quantity | integer |  | The quantity of goods returned to the merchant due to quality issues. |
| ^^sample_code | string |  | The code of sample product |
| ^^sample_status | string |  | The status of sample product management. Possible enumerations are: 1. WAIT_FOR_SEND 2. SAMPLE_SENT 3. PLATFORM_SIGNED 4. WAIT_FOR_SUPPLIER_SIGN 5. SUPPLIER_SIGNED 6. CANCELED |
| ^^ship_time | integer |  | The actual time of merchant delivery goods by logistics |
| ^^skc | object |  | The information for SKC of TikTok Shop. |
| ^^^external_skc_code | string |  | The SKC code of your OMS. |
| ^^^first_key_attribute_name_en | string |  | The first key attribute English-Name of skc |
| ^^^first_key_attribute_name_zh | string |  | The first key attribute Chinese-Name of skc |
| ^^^first_key_attribute_value_en | string |  | The first key attribute English-Value of skc |
| ^^^first_key_attribute_value_zh | string |  | The first key attribute Chinese-Value of skc |
| ^^^image_url | string |  | The SKC shapshot created along with the order. |
| ^^^platform_skc_code | string |  | The SKC code of TikTok Shop. |
| ^^skus | array<object> |  | The information list of sku |
| ^^^barcode | string |  | The SKU barcode of TikTok Shop. |
| ^^^delivered_quantity | integer |  | The quantity of the specified SKU shipped from the merchant. |
| ^^^external_sku_code | string |  | The SKU code of your OMS. |
| ^^^inbound_quantity | integer |  | The quantity of specified SKU inbound by the warehouse. |
| ^^^platform_sku_code | string |  | The SKU code of TikTok Shop. |
| ^^^qualified_quantity | integer |  | The quantity of specified SKU confirmed qualified by the warehouse. |
| ^^^received_quantity | integer |  | The quantity of specified SKU confirmed received by the warehouse. |
| ^^^returned_quantity | integer |  | The quantity of specified SKU returned to the merchant due to quality issues. |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for SKU of TikTok Shop. |
| ^^^unqualified_quantity | integer |  | The quantity of specified SKU failed to pass the quality check conducted by the warehouse. |
| ^^status | string |  | The status code of delivery-order. Possible enumerations are: 1. WAIT_DELIVERY:  wait for merchants to deliver goods 2. DELIVERED: Merchant already delivered goods to GS by logistics. 3. SIGNED: The logistics track shows that it has been signed by the warehouse 4. RECEIVED: The goods have been received and unpacked in the warehouse. 5. IN_QUALITY_CHECK:  The goods are being quality inspected in the warehouse. 6. QUALITY_CHECK_COMPLETED: The goods have finished quality inspected in the warehouse. 7. INBOUND: The goods haveinbounded in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. CANCELED: The delivery order was canceled, merchants didn't need to deliver goods to GS. |
| ^^stockup_type | string |  | The stockup type of delivery. Possible enumerations are: 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| ^^unqualified_quantity | integer |  | The quantity of goods failed to pass the quality check conducted by the warehouse. |
| ^^warehouse_code | string |  | warehouse code |
| ^^warehouse_contact | object |  | The contact info of  warehouse |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contact |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contact |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^warehouse_name | string |  | warehouse name |
| ^next_page_token | string |  | The next page encode. |
| ^total_count | integer |  | The count of stockup order list which search by request conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingQueryLogisticsOrders

This API is used to query logistics information by multi logistics order codes.

**Path:** `/gs_full_service_shipment/202407/logistics_orders`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-query-logistics-orders-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| logistics_orders | array<string> | Y | A delivery batch code will be generated for logistics tracking when delivery-order is operated ship by logistics.  less or equal to 50. |

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
| ^logistics_orders | array<object> |  | The information list of delivery batch. |
| ^^code | string |  | The code of delivery batch. |
| ^^completion_time | integer |  | The UNIX timestamp of creating the delivery order. |
| ^^create_time | integer |  | The time of main logistics order creatation |
| ^^delivery_time | integer |  | The UNIX timestamp of delivery. |
| ^^latest_update_time | integer |  | The UNIX timestamp of the latest status change. |
| ^^logistics | object |  | The information of logistics |
| ^^^delivery_option | string |  | The type of delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse |
| ^^^shipping_provider_name | string |  | The code of logistics provider which transports merchant's goods to warehouse |
| ^^logistics_package_quantity | integer |  | The quantity of  logistics package under the main logistics order |
| ^^logistics_picker_name | string |  | The name of the postman who pick up the package. |
| ^^logistics_picker_phone | string |  | The phone number of the postman who pick up the package. |
| ^^logistics_sub_order_quantity | integer |  | The quantity of  logistics order under the main logistics order |
| ^^logistics_sub_orders | array<object> |  | The information list of logistics order |
| ^^^code | string |  | The code of  logistics order |
| ^^^completion_time | integer |  | The UNIX timestamp of creating the sub logistic successfully. |
| ^^^create_time | integer |  | The UNIX timestamp of begin creating the sub logistic. |
| ^^^delivery_time | integer |  | The UNIX timestamp of the sub logistic delivery. |
| ^^^failed_reason | string |  | The failure reason of logistics order creatation. |
| ^^^latest_update_time | integer |  | The UNIX timestamp of the latest status update of the sub logistic. |
| ^^^loss_suspend_time | integer |  | The UNIX timestamp of discovering the package is missing. |
| ^^^package_weight | object |  | The weight of  logistics package |
| ^^^^unit | string |  | The unit. Possible enumerations are: - `"GRAM"` - `"KILOGRAM"` |
| ^^^^value | string |  | The number of  logistics package weight |
| ^^^pickup_time | integer |  | The UNIX timestamp of the sub logistic pickup. |
| ^^^sign_time | integer |  | The UNIX timestamp of the sign for receipt of the sub logistic. |
| ^^^status | string |  | The status of  logistics order creatation. Possible enumerations are: 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. SHIPPED 8. SHIPPED_ABNORMAL 9. DELIVERED 10. DELIVERED_ABNORMAL 11. SIGNED 12. FINISHED 13. CANCELED 14. RETURNING_TO_SENDER 15. RETURNED_TO_SENDER |
| ^^^tracking_number | string |  | The track No of  logistics order |
| ^^^tracking_records | array<object> |  | The  track records of logistics track |
| ^^^^message | string |  | The standard message of logistic track record |
| ^^^^title | string |  | The title of logistics track record |
| ^^^^update_time | integer |  | The time of logistic track record |
| ^^pickup_time | integer |  | The UNIX timestamp of pickup. |
| ^^predicted_arrive_time | integer |  | The predicted arrival time is based on reservation shipment time |
| ^^predicted_pick_info | object |  | Make an appointment for pickup time |
| ^^^end_time | integer |  | Predict pickup end time |
| ^^^start_time | integer |  | Predict pickup start time |
| ^^predicted_ship_time | integer |  | Schedule delivery time |
| ^^receiver_contact | object |  | The detail address of logistics sender |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contacts |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contacts |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^sender_contact | object |  | The detail address of logistics sender |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contacts |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contacts |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^sign_time | integer |  | The UNIX timestamp of signing for receipt of the order. |
| ^^status | string |  | The status of delivery batch. Possible enumerations are: 1. INIT 2. WAIT_CREATE 3. CREATE_FAILED 4. RTS 5. RTS_FAILED 6. TTS 7. PARTIAL_SHIPPED 8. SHIPPED_ABNORMAL 9. SHIPPED 10. PARTIAL_DELIVERED 11. DELIVERED 12. PARTIAL_SIGNED 13. SIGNED 14. CANCELED 15. RETURNING_TO_SENDER 16. RETURNED_TO_SENDER |
| ^^type | string |  | The type of delivery batch. Possible enumerations are: 1. DELIVERY 2. RETURN |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingCancelShipment

This API is used to cancel the shipment for the logistics order.

**Path:** `/gs_full_service_shipment/202407/logistics_orders/cancel_ship`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-cancel-shipment-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| logistics_order | string |  | The code of delivery batch. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingGetQualityDocuments

This API is used to query quality documents by delivery order code or inspect order code.

**Path:** `/gs_full_service_shipment/202407/quality_documents`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-get-quality-documents-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_code | string | Y | The code of order. |
| order_type | string | Y | The type of order. Possible enumerations are: - `"DELIVERY_ORDER"` - `"INSPECT_ORDER"` |

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
| ^document_url | string |  | The url of a printable pdf document of quality check results. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchReturnOrders

This API is used to list return orders by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202407/return_orders/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-return-orders-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| external_skc_codes | array<string> |  | The SKC code list of your OMS. The length is no more than `50`. |
| external_sku_codes | array<string> |  | The SKU code list of your OMS. The length is no more than `50`. |
| order_create_time_ge | integer |  | The creation time of the return order is greater than or equal to the value. |
| order_create_time_lt | integer |  | The creation time of the return order is less than the value. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset, `1` by default. |
| platform_sku_codes | array<string> |  | The SKU code list of TikTok Shop. The length is no more than `50`. |
| platform_spu_codes | array<string> |  | The SPU code list of TikTok Shop.  The length is no more than `50`. |
| return_methods | array<string> |  | The method of returning goods to the merchant. Possible enumerations are: 1. SELF_PICKUP 2. EXPRESS_DELIVERY 3. PLATFORM_DELIVERY 4. ABANDON_GOODS |
| return_order_codes | array<string> |  | The code list of return orders. The length is no more than `50`. |
| return_source | string |  | The source that triggers return goods to the merchant. Possible enumerations are: 1. MERCHANT 2. PLATFORM 3. INVENTORY_HEALTH 4. PRODUCT_DISUSE |
| return_status | array<string> |  | The list of status of return order. Possible enumerations are: 1. OPERATER_CONFIRMING：Merchants have initiated the return order. The order is yet to be confirmed by the platform. 2. MERCHANT_CONFIRMING：Platform has initiated the return order. The order is yet to be confirmed by the merchants. 3. TO_TRANSIT: Waiting for transit in the warehouse. 4. IN_TRANSIT: transiting in the warehouse. 5. OUTBOUND：Transit finished in the warehouse. Ready for pick up. 6. SHIPPED： Return packages have been collected by logistics. 7. COMPLETED：The return process has been completed. 8. CANCELED：The return process has been cancelled. |
| return_types | array<string> |  | The type of return goods to merchant. Possible enumerations are: 1. ABNORMAL_INVENTORY：Inventory returns are caused by problems such as slow sales. 2. ABNORMAL_QUALITY：Quality problems are identified by quality check. 3. INSPECT_ABNORMAL：Quality problems are identified by inspection in the warehouse. 4. RECEIVE_ABNORMAL：The labels of delivery packages identified in the receiving process are not clear. 5. PRODUCT_ABNORMAL：Products are damaged, with bulging bags or with abnormal barcodes. 6. QUANTITY_ABNORMAL_MORE：The goods are in excessive quantity and need to be returned. 7. MISPLACED_GOODS：Incorrect goods need to be returned. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | The next page encode. |
| ^return_orders | array<object> |  | The information of the return order list. |
| ^^code | string |  | The code of the return order. |
| ^^detailed_reason | string |  | The detailed reason for returning goods to merchant. |
| ^^logistics | object |  | The logistics info  that the return order returns goods back to merchant. |
| ^^^actual_quantity | integer |  | The SKC actual quantity of returning goods. |
| ^^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^^confirm_quantity | integer |  | The SKC quantity that confirms returning goods. |
| ^^^logistics_order | string |  | A delivery batch order will be generated for logistics tracking when returning goods to merchat by logistics. |
| ^^^platform_spu_code | string |  | The SPU code list of TikTok Shop. |
| ^^^request_quantity | integer |  | The SKC quantity of requests for returning goods. |
| ^^^shipping_provider_code | string |  | The name of logistics provider which transports merchant's goods to warehouse. |
| ^^^skus | array<object> |  | The information list for SKU of TikTok Shop. |
| ^^^^actual_quantity | integer |  | The sku actual quantity of returning goods |
| ^^^^barcode | string |  | The SKU barcode of TikTok Shop. |
| ^^^^cancel_reason | string |  | The reason for canceling return goods. |
| ^^^^confirm_quantity | integer |  | The sku quantity that confirms returning goods |
| ^^^^confirm_reason | string |  | The reason for modifying quantity or confirming return goods. |
| ^^^^external_skc_code | string |  | The SKC code of your OMS. |
| ^^^^external_sku_code | string |  | The SKU code of your OMS. |
| ^^^^first_key_attribute_name_en | string |  | The first key attribute is the English name of SKC. |
| ^^^^first_key_attribute_name_zh | string |  | The first key attribute is the Chinese name of SKC. |
| ^^^^first_key_attribute_value_en | string |  | The first key attribute is the English value of SKC. |
| ^^^^first_key_attribute_value_zh | string |  | The first key attribute is the Chinese value of SKC. |
| ^^^^image_url | string |  | The image url address for SKU of TikTok Shop. |
| ^^^^platform_sku_code | string |  | The SKU code of TikTok Shop. |
| ^^^^request_quantity | integer |  | The sku quantity of requests for returning goods |
| ^^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for SKU of TikTok Shop. |
| ^^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for SKU of TikTok Shop. |
| ^^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for SKU of TikTok Shop. |
| ^^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for SKU of TikTok Shop. |
| ^^method | string |  | The method of returning goods to the merchant. Possible enumerations are: 1. SELF_PICKUP 2. EXPRESS_DELIVERY 3. PLATFORM_DELIVERY 4. ABANDON_GOODS |
| ^^outbound_batch_code | string |  | The code of outbound batch associated with the return order. |
| ^^reason_type | string |  | The reason for returning goods to merchant. |
| ^^source | string |  | The source that triggers return goods to the merchant. Possible enumerations are: 1. MERCHAT 2. PLATFORM 3. INVENTORY_HEALTH 4. PRODUCT_DISUSE |
| ^^status | string |  | The list of status of return order. Possible enumerations are: 1. OPERATER_CONFIRMING：Merchants have initiated the return order. The order is yet to be confirmed by the platform. 2. MERCHANT_CONFIRMING：Platform has initiated the return order. The order is yet to be confirmed by the merchants. 3. TO_TRANSIT: Waiting for transit in the warehouse. 4. IN_TRANSIT: transiting in the warehouse. 5. OUTBOUND：Transit finished in the warehouse. Ready for pick up. 6. SHIPPED： Return packages have been collected by logistics. 7. COMPLETED：The return process has been completed. 8. CANCELED：The return process has been cancelled. |
| ^^type | string |  | The type of return goods to merchant. Possible enumerations are: 1. ABNORMAL_INVENTORY：Inventory returns are caused by problems such as slow sales. 2. ABNORMAL_QUALITY：Quality problems are identified by quality check. 3. INSPECT_ABNORMAL：Quality problems are identified by inspection in the warehouse. 4. RECEIVE_ABNORMAL：The labels of delivery packages identified in the receiving process are not clear. 5. PRODUCT_ABNORMAL：Products are damaged, with bulging bags or with abnormal barcodes. 6. QUANTITY_ABNORMAL_MORE：The goods are in excessive quantity and need to be returned. 7. MISPLACED_GOODS：Incorrect goods need to be returned. |
| ^^warehouse_code | string |  | The code of warehouse where the goods to be returned are located. |
| ^total_count | integer |  | The count of return order list which search by request conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchAvailableShippingProviders

This API is used to search the available shipping providers.

**Path:** `/gs_full_service_shipment/202407/shipping_providers/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-available-shipping-providers-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode of delivery goods to GS. 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| delivery_option | string |  | The type of delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| delivery_order_codes | array<string> |  | The list of delivery order,  less or equal to 50. |
| sender_contact_id | string |  | The ID of the sender. If `delivery_mode == PLATFORM_DELIVERY`, the value is required. |
| shipping_box_quantity | integer |  | The quantity of shipping boxes. |
| total_weight | object |  | Total weight |
| ^unit | string |  | The unit. Possible enumerations are: - `"GRAM"` - `"KILOGRAM"` |
| ^value | string |  | Value |
| warehouse_code | string |  | The code of warehouse that merchant deliver goods wants to arrive |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^reserve_arrived_times | array<object> |  | The information about whether the capacity of warehouse  can be reserved at specific time |
| ^^arrived_time | integer |  | The time when goods arrive at warehouse |
| ^^can_reserve | boolean |  | Whether the capacity of warehouse when specify arrival time can be reserve |
| ^shipping_providers | array<object> |  | The list of logistics provider |
| ^^delivery_option | string |  | The type of delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^^max_charge_fee | object |  | The max amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The amount of charge fee |
| ^^min_charge_fee | object |  | The min amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The unit. Possible enumerations are: - `"CNY"` |
| ^^provider_code | string |  | The code of logistics provider which transports goods to warehouse |
| ^^provider_name | string |  | The name of logistics provider which transports goods to warehouse |
| ^^reserve_datas | array<object> |  | The available reservation information of logistics provider |
| ^^^can_reserve | boolean |  | Whether the shipment time can be reserve |
| ^^^reserve_segments | array<object> |  | The segment list of reservation shipment time |
| ^^^^can_reserve | boolean |  | Whether the shipment time slot can be reserve |
| ^^^^end_time | integer |  | The end time of timeslot |
| ^^^^start_time | integer |  | The start time of timeslot |
| ^^^ship_time | integer |  | The time for shipping goods by logistic |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchStockupOrders

This API is used to search stockup-order information by multi-dimensional search condition.

**Path:** `/gs_full_service_shipment/202407/stockup_orders/search`
**Method:** `POST`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-stockup-orders-202407

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| emergency_levels | array<string> |  | The emergency level of stockup order. Possible enumerations are: 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| external_skc_codes | array<string> |  | The SKC code list of your OMS. less or equal to 50. |
| external_sku_codes | array<string> |  | The SKU code list of your OMS. less or equal to 50. |
| is_delivery_completed | boolean |  | whether all the require delivery goods had been delivered completely |
| is_first_order | boolean |  | Whether first stockup order for merchant.  less or equal to 50. |
| is_normal | boolean |  | Whether is normal when deliver goods to GS |
| latest_status_update_ge | integer |  | Search stockup orders that the time of the latest status update is greater or equal to latest_status_update_ge. |
| latest_status_update_lt | integer |  | Search stockup orders that the time of the latest status update is less than latest_status_update_lt. |
| order_create_time_ge | integer |  | Search delivery order that create time greater or equal to order_create_time_ge. |
| order_create_time_lt | integer |  | Search stockup order that create time less than order_create_time_lt. |
| order_sources | array<string> |  | The source of stockup order creation. Possible enumerations are: 1. PLATFORM: Stockup orders are initiated by the platform. 2. MERCHANT: Stockup orders are initiated by the merchant. 3. ABNORMAL_REDELIVERY: Stockup orders are initiated by the abnormal situation. |
| order_status | array<string> |  | The status of stockup order. Possible enumerations are: 1. WAIT_CONFIRM: The stockup order needs to be confirmed or rejected. 2. WAIT_SEND: the goods haven't been shipped by merchant. 3. SENDED: the goods have been shipped by merchant. 4. SIGNED: The logistics track shows that it has been signed by the warehouse 5. RECEIVED: The goods have been received and unpacked in the warehouse. 6. IN_QUALITY_CHECK:  The goods will be quality inspected in the warehouse. 7. QUALITY_CHECK_COMPLETED: The goods completed quality inspected in the warehouse. 8. RETURN_COMPLETED:  The goods have returned and shipped to merchant. 9. INBOUND: The goods have been inbound and on shelves in the warehouse. 10. INVAILD: The stockup order was invalid, the merchant doesn't need to prepare goods. |
| order_types | array<string> |  | The type of stockup order. Possible enumerations are: 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| page_size | integer |  | Page size,  default 10,  less or equal to 50. |
| page_token | string |  | Page offset,  `1` by default. |
| platform_sku_codes | array<string> |  | The code list of sku. less or equal to 50. |
| platform_spu_codes | array<string> |  | The code list of spu. less or equal to 50. |
| require_arrived_time_ge | integer |  | Search stockup orders that require arrival time greater or equal to require_arrive_time_ge. |
| require_arrived_time_lt | integer |  | Search stockup orders that require arrival time less than require_arrive_time_lt. |
| require_ship_time_ge | integer |  | Search stockup orders that require shipment time greater or equal to require_ship_time_ge. |
| require_ship_time_lt | integer |  | Search stockup orders that require shipment time less than require_ship_time_lt. |
| stockup_order_codes | array<string> |  | The code list of stockup orders.  less or equal to 50. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | The next page encode. |
| ^stockup_orders | array<object> |  | The information of the stockup order list |
| ^^can_deliver | boolean |  | Whether the merchant can begin to deliver goods to GS，exist some precondition，such as photography approved for skc. |
| ^^category_id | string |  | The category ID of product which has been defined by platform. |
| ^^code | string |  | The code of stockup order |
| ^^create_time | integer |  | The create time of stockup order. |
| ^^delivered_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^emergency_level | string |  | The emergency level of stockup order. Possible enumerations are: 1. URGENT: the emergency level of stockup order is defined as urgent once created. 2. EXPEDITED: the emergency level of stockup order is defined as expedited in transit. 3. GENERAL: the emergency level of stockup order is defined as general. |
| ^^inbound_quantity | integer |  | The quantity of goods which have been inbound by the warehouse. |
| ^^is_delivery_completed | boolean |  | Whether required goods have already been delivered to GS. |
| ^^is_first_order | boolean |  | Whether first stockup order for merchant. |
| ^^is_normal | boolean |  | Whether is normal when delivering goods to GS. |
| ^^latest_status_update_time | integer |  | The time of the latest status update. |
| ^^manufacture_mode | string |  | The mode of manufacture 1. OBM_TYPE: Own Branding & Manufacturing 2. ODM_MADE_TO_ORDER: Original Design Manufacture, Make to Order 3. ODM_READY_TO_BUY: Original Design Manufacture, Ready to Buy 4. OEM: Original Equipment Manufacture |
| ^^platform_spu_code | string |  | The SPU code of TikTok Shop. |
| ^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^require_arrived_time | integer |  | Merchant should guarantee all require goods arrived at warehouse of GS before specified time. |
| ^^require_ship_time | integer |  | The required time of merchant begins to ship goods to GS before the merchant should begin to ship goods to GS before the specified time. |
| ^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^skc | object |  | The information list for SKC of TikTok Shop. |
| ^^^external_skc_code | string |  | The SKC code of your OMS. |
| ^^^first_key_attribute_name_en | string |  | The English name of the first key attribute for SKC of TikTok Shop |
| ^^^first_key_attribute_name_zh | string |  | The Chinese name of the first key attribute for SKC of TikTok Shop |
| ^^^first_key_attribute_value_en | string |  | The English value of the first key attribute for SKC of TikTok Shop |
| ^^^first_key_attribute_value_zh | string |  | The Chinese value of the first key attribute for SKC of TikTok Shop |
| ^^^image_url | string |  | The SKC shapshot created along with the order. |
| ^^^platform_skc_code | string |  | The SKC code of TikTok Shop. |
| ^^skus | array<object> |  | The information list for SKU of TikTok Shop. |
| ^^^barcode | string |  | The SKU barcode of TikTok Shop. |
| ^^^delivered_quantity | integer |  | The quantity of goods which have been shipped from the merchant. |
| ^^^external_sku_code | string |  | The SKU code of your OMS. |
| ^^^inbound_quantity | integer |  | The quantity of goods which have beeninbound and on shelf by the warehouse. |
| ^^^platform_sku_code | string |  | The SKU code of TikTok Shop. |
| ^^^received_quantity | integer |  | The quantity of goods which have been received and counted by the warehouse. |
| ^^^returned_quantity | integer |  | The quantity of goods which have been returned due to quality problems. |
| ^^^second_key_attribute_name_en | string |  | The English name of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_name_zh | string |  | The Chinese name of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_en | string |  | The English value of the second key attribute for SKU of TikTok Shop. |
| ^^^second_key_attribute_value_zh | string |  | The Chinese value of the second key attribute for SKU of TikTok Shop. |
| ^^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^source | string |  | The source of stockup order creatation |
| ^^status | string |  | The status of stockup order PS: status machines of stockup order are listed in request params |
| ^^stockup_quantity | integer |  | The stockup quantity which has been confirmed. |
| ^^type | string |  | The type of stockup order. Possible enumerations are: 1. JIT: Stockup is determined by sales. 2. NORMAL: Stockup is for sales. |
| ^total_count | integer |  | The count of return order list which search by request conditions. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingGetSKUPrintDocument

The API is used to generate a printable pdf document for multiple SKUs.

**Path:** `/gs_full_service_shipment/202409/delivery_orders/sku_documents/generate`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-get-skuprint-document-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| platform_sku_items | array<object> |  | The information list of platform-defined sku |
| ^code | string |  | Platform-defined code of sku |
| ^quantity | integer |  | Specify sku barcode print quantity, Up to  99999 |
| size | object |  | Barcode specifications. Common sizes: `5cm*2cm`, `5cm*3cm`, `7cm*2cm`, `7cm*3cm`, `8cm*2cm`, `8cm*3cm`. |
| ^height | string |  | The number of height |
| ^unit | string |  | The unit of dimension, CENTIMETER |
| ^width | string |  | The number of width |
| stockup_order_code | string |  | The code of stockup order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^document_url | string |  | The url of a printable pdf document for multiple sku |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingConfirmStockupOrder

This API is used to confirm the stock-up order

**Path:** `/gs_full_service_shipment/202409/stockup_orders/confirm`
**Method:** `POST`
**Version:** 202409
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-confirm-stockup-order-202409

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| is_order_confirmed | boolean |  | Whether the stock-up order is confirmed. To confirm the order, use `true`; to reject the order, use `false`. |
| reject_note | string |  | The detailed reasons for rejecting the stockup order. The length must not exceed `200`. |
| reject_reason | string |  | The reason you reject the stockup order. Possible enumerations: - PICTURE_NOT_MATCH - RAW_MATERIAL_OR_PROCESS_CHANGES - NOT_MEET_MINIMUM_LIMIT - STOP_PRODUCTION - SALES_STRATEGY_ADJUSTMENT_REDUCES_INVENTORY - ORDER_DEMAND_ADJUSTMENT - ORDER_SENT_INCORRECTLY - CF: Duplicated orders. - TC: Quality issues leading to production discontinuation. - QQXJ: Remove infringing/unauthorized products from listing. - CT: Product information is incorrect and needs correction. - REPAIR_ORDER_TERMINATED - TERMINATION_OF_OVERDUE_ORDERS - SELF_STOCKING_BASED_ON_SALES_VOLUME - HIGH_TURNOVER_DAYS_IN_THE_WAREHOUSE - INSUFFICIENT_INVENTORY - `OTHER_REASONS`. |
| skus | array<object> |  | The information list of SKU. |
| ^code | string |  | Platform-defined code of sku. The SKU code must come from the above stockup order. And all SKU codes in this stockup order must be included in each operation. |
| ^confirm_stockup_quantity | integer |  | The quantity of goods which have been confirmed for stock-up |
| stockup_order_code | string |  | Stockup order code. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingReserveShipment

This API is used to reserve shipping for multi delivery-order.

**Path:** `/gs_full_service_shipment/202410/delivery_orders/reserve_ship`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-reserve-shipment-202410

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode that merchant deliver goods to the warehouse of GS. Possible enumerations are: 1. PLATFORM_DELIVERY 2. SELF_DELIVERY |
| delivery_order_codes | array<string> |  | The code list of delivery orders, less or equal to 50. |
| logistics | object |  | The information of logistics If delivery_mode == PLATFORM_DELIVERY, the field is required. |
| ^delivery_option | string |  | The type of the delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^shipping_provider_code | string |  | The code of the logistic provider. If `delivery_mode == PLATFORM_DELIVERY`, the value is required. |
| ^shipping_provider_name | string |  | The name of logistics provider |
| reserve | object |  | The reserve information for shipment |
| ^predicted_arrived_time | integer |  | The predicted arrival time is based on reservation shipment time |
| ^predicted_pickup_ge | integer |  | The start time of Schedule delivery timeslot |
| ^predicted_pickup_lt | integer |  | The end time of Schedule delivery timeslot |
| ^predicted_pickup_time | integer |  | The predicted datetime of logistics pickup |
| ^predicted_ship_time | integer |  | Schedule delivery datetime |
| sender_contact_id | string |  | The ID of the sender. |
| shipping_box_quantity | integer |  | The quantity of shipping boxes |
| total_weight | object |  | Total weight |
| ^unit | string |  | The unit. Possible enumerations are: - `"GRAM"` - `"KILOGRAM"` |
| ^value | string |  | value |
| warehouse_code | string |  | The code of warehouse that receives goods |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^logistics_order | string |  | Main logistics order belong to Delivery order |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingSearchAvailableShippingProviders

This API is used to search the available shipping providers.

**Path:** `/gs_full_service_shipment/202410/shipping_providers/search`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-search-available-shipping-providers-202410

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| delivery_mode | string |  | The mode of delivery goods to GS. 1. SELF_DELIVERY 2. PLATFORM_DELIVERY |
| delivery_option | string |  | The type of delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| delivery_order_codes | array<string> |  | The list of delivery order,  less or equal to 50. |
| sender_contact_id | string |  | The ID of the sender. |
| shipping_box_quantity | integer |  | The quantity of shipping boxes. |
| total_weight | object |  | Total weight |
| ^unit | string |  | The unit. Possible enumerations are: - `"GRAM"` - `"KILOGRAM"` |
| ^value | string |  | Value |
| warehouse_code | string |  | The code of warehouse that merchant deliver goods wants to arrive |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^reserve_arrived_times | array<object> |  | The information about whether the capacity of warehouse  can be reserved at specific time |
| ^^accurate_warehouse_code | string |  | warehouse code which is precisely assigned |
| ^^arrived_time | integer |  | The time when goods arrive at warehouse |
| ^^can_reserve | boolean |  | Whether the capacity of warehouse when specify arrival time can be reserve |
| ^^max_charge_fee | object |  | The max amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The unit. Possible enumerations are: - `"CNY"` |
| ^^min_charge_fee | object |  | The min amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The unit. Possible enumerations are: - `"CNY"` |
| ^shipping_providers | array<object> |  | The list of logistics provider |
| ^^delivery_option | string |  | The type of delivery service. The possible enumerations are: - `"SUPER_SPEEDY_EXPRESS"` - `"SPEEDY_EXPRESS"` - `"STANDARD_EXPRESS"` Notes: - `"SUPER_SPEEDY_EXPRESS"` is the only option for JIT orders. - `"SPEEDY_EXPRESS"` and `"STANDARD_EXPRESS"` are options for ordinary orders. |
| ^^max_charge_fee | object |  | The max amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The amount of charge fee |
| ^^min_charge_fee | object |  | The min amount which the logistics provider charge |
| ^^^amount | string |  | The amount of charge fee |
| ^^^currency | string |  | The unit. Possible enumerations are: - `"CNY"` |
| ^^provider_code | string |  | The code of logistics provider which transports goods to warehouse |
| ^^provider_name | string |  | The name of logistics provider which transports goods to warehouse |
| ^^reserve_datas | array<object> |  | The available reservation information of logistics provider |
| ^^^can_reserve | boolean |  | Whether the shipment time can be reserve |
| ^^^reserve_segments | array<object> |  | The segment list of reservation shipment time |
| ^^^^accurate_warehouse_code | string |  | warehouse code which is precisely assigned |
| ^^^^can_reserve | boolean |  | Whether the shipment time slot can be reserve |
| ^^^^end_time | integer |  | The end time of timeslot |
| ^^^^start_time | integer |  | The start time of timeslot |
| ^^^ship_time | integer |  | The time for shipping goods by logistic |
| ^warehouse_list | array<object> |  | The contact info of warehouse which is precisely assigned |
| ^^warehouse_code | string |  | warehouse code which is precisely assigned |
| ^^warehouse_contact | object |  | The contact info of warehouse which is precisely assigned |
| ^^^address_detail | object |  | The detail address info of the  warehouse |
| ^^^^city_name | string |  | The city name of  warehouse location |
| ^^^^country_name | string |  | The country name of the  warehouse location |
| ^^^^detail | string |  | The detail address of  warehouse location |
| ^^^^district_name | string |  | The district name of  warehouse location |
| ^^^^province_name | string |  | The province name of  warehouse location |
| ^^^^town_name | string |  | The town name of  warehouse location |
| ^^^contact_name | string |  | Contacts name |
| ^^^email | string |  | The email address area of contact |
| ^^^full_address | string |  | The multilevel address detail of  warehouse location |
| ^^^phone_number | string |  | The phone number  of contact |
| ^^^postal_code | string |  | The Postal code of the  warehouse location |
| ^^warehouse_name | string |  | warehouse name which is precisely assigned |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingGetSKUPrintDocument

The API is used to generate a printable pdf document for multiple SKUs.

**Path:** `/gs_full_service_shipment/202503/delivery_orders/sku_documents/generate`
**Method:** `POST`
**Version:** 202503
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-get-skuprint-document-202503

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| need_separator | boolean |  | Whether to print the separator between the barcodes of different SKUs. `true` by default. |
| platform_sku_items | array<object> |  | The information list of platform-defined sku |
| ^code | string |  | Platform-defined code of sku |
| ^quantity | integer |  | Specify sku barcode print quantity, Up to  99999 |
| size | object |  | Barcode specifications. Common sizes: `5cm*2cm`, `5cm*3cm`, `7cm*2cm`, `7cm*3cm`, `8cm*2cm`, `8cm*3cm`. |
| ^height | string |  | The number of height |
| ^unit | string |  | The unit of dimension, CENTIMETER |
| ^width | string |  | The number of width |
| stockup_order_code | string |  | The code of stockup order |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^document_url | string |  | The url of a printable pdf document for multiple sku |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
