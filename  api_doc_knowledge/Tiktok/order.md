# TikTok Shop API — order

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 9 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202406, 202407, 202507, 202511

---

## GetOrderDetail

Get the detailed order information of an order, including important attributes such as order status, shipping addresses, payment details, price and tax info, and package information.

**Path:** `/order/202309/orders`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-order-detail-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| ids | array<string> | Y | A list of TikTok Shop order ID values. Max count: 50 |
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
| ^orders | array<object> |  | Order information. |
| ^^auto_combine_group_id | string |  | An identifier assigned to orders from the same customer during a LIVE session to facilitate combined order shipping when "auto-combination" is activated in Seller Center. |
| ^^buyer_avatar | string |  | The avatar of the TikTok buyer, which is defined by the TikTok user. The buyer_avatar can be used in conjunction with the buyer_nickname when displaying the unboxing results within the TikTok Live Session. |
| ^^buyer_email | string |  | The anonymized email address of the buyer. It is not recommended to send messages directly to this email address. If you need to contact the buyer, please go to Seller Center - Buyer Messages page. |
| ^^buyer_message | string |  | The note from buyer. |
| ^^buyer_nickname | string |  | The nickname of the TikTok buyer, which is defined by the TikTok user. The buyer_nickname can be used to identify the buyer when displaying the unboxing results within the TikTok Live Session. |
| ^^cancel_order_sla_time | integer |  | The automatic cancellation time for orders specified by the platform. Unix timestamp. |
| ^^cancel_reason | string |  | The order level cancellation reason. **Note**: A multi-line order may have different `cancel_reason` across the multiple items. If this occurs, the order-level `cancel_reason` will surface the `cancel_reason` from the first line item. [See here](https://partner.tiktokshop.com/docv2/page/cancel-reasons) for more details on cancellation reasons. |
| ^^cancel_time | integer |  | The timestamp of the order's status update to `CANCELLED`. |
| ^^cancellation_initiator | string |  | The initiator of a cancellation request. Possible values: - `SELLER` - `BUYER` - `SYSTEM` |
| ^^channel_entity_national_registry_id | string |  | The national channel entity registration ID of payment institution/creditor. In Brazil, it is the CNPJ of payment instituion. |
| ^^collection_due_time | integer |  | If the order hasn't updated its status to `IN_TRANSIT` before this time, the order will be automatically canceled by TikTok Shop |
| ^^collection_time | integer |  | The timestamp of the order's status update to `IN_TRANSIT`. |
| ^^commerce_platform | string |  | The platform where the order was placed. Possible values: - TIKTOK_SHOP - TOKOPEDIA **Note**: Available only in the Indonesia market. |
| ^^consultation_id | string |  | An ID to identify the corresponding ePharmacy consultation. Applicable only if an ePharmacy consultation was initiated. Not applicable if the prescription was provided by the customer through an image upload. |
| ^^cpf | string |  | CPF (invoice number), used to issue an invoice. Exclusive for the Brazil market. |
| ^^cpf_name | string |  | Name belonging to the CPF number for the Brazil market. |
| ^^create_time | integer |  | The date and time that the order was created. Unix timestamp. |
| ^^delivery_due_time | integer |  | If the order hasn't updated its status to `DELIVERED` before this time, the order will be automatically canceled by TikTok Shop. |
| ^^delivery_option_id | string |  | Order delivery option ID. |
| ^^delivery_option_name | string |  | Delivery option name. For display purposes only. |
| ^^delivery_option_required_delivery_time | integer |  | Order should be delivered before this time. |
| ^^delivery_sla_time | integer |  | Order should arrive by this date to be considered on-time and to avoid late delivery penalties. |
| ^^delivery_time | integer |  | The timestamp of the order's status update to `DELIVERED`. |
| ^^delivery_type | string |  | Indicates whether it is a PickUp DropOff (PUDO) location. The PUDO location is selected by the buyer when placing orders. - `HOME_DELIVERY`: not a PUDO location - `COLLECTION_POINT`: a PUDO location |
| ^^exchange_source_order_id | string |  | If the order is an exchange order, this field returns the original order's order ID, from which the exchange order was generated. Returned only if is_exchange_order = true. Note: Only available in US and UK. |
| ^^fast_delivery_program | string |  | A badge presented on the merchandise to tell the buyer that the seller participates in the fast delivery program, such that the order should arrive in a promised time period. Possible values: - `3_DAY_DELIVERY` Not returned if order did not meet fast delivery program requirements. Note: Applicable only for the US market. |
| ^^fast_dispatch_sla_time | integer |  | The latest collection time to gain incentives of NDD (Next Day Delivery) project. Unix timestamp Only available in Thailand and Philippines. |
| ^^fulfillment_priority_level | integer |  | Fulfillment priority value that can be used to prioritize shipping (only available in SEA) 100 = Instant 200 = Sameday 8 Hours 300 = Sameday 400 = Next Day Delivery 500 = Express 600 = Standard 700 = Economy 800 = Cargo |
| ^^fulfillment_type | string |  | Fulfillment type. Only orders with fulfillment type can be shipped by sellers. Possible values: - `FULFILLMENT_BY_SELLER`: a method where sellers fulfill orders directly from their own inventory, without using TikTok's fulfillment centers. In this model, the seller is responsible for storing, packaging, and shipping the product to customers. - `FULFILLMENT_BY_TIKTOK`: a service offered by TikTok that enables sellers to send their products to TikTok's fulfillment centers. TikTok then takes care of storing, picking, packing, and shipping the products to customers. - `FULFILLMENT_BY_DILAYANI_TOKOPEDIA`: a method where Tokopedia GoTo Logistics provides warehousing and logistics services to sellers and charges a fee for the service. |
| ^^handling_duration | object |  | The duration for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the `order_type` is `MADE_TO_ORDER` or `BACK_ORDER`. |
| ^^^days | string |  | The number of days. |
| ^^^type | string |  | Indicates if the duration is calculated in calendar days or business days. Possible values: - `CALENDAR_DAY`: Represents consecutive days, including weekends and holidays. - `BUSINESS_DAY`: Represents business days, excluding weekends and public holidays. Default: `BUSINESS_DAY` |
| ^^has_updated_recipient_address | boolean |  | Whether the recipient address has been updated. - `false`: no update - `true`: updated |
| ^^id | string |  | A unique identifier for a TikTok Shop order. |
| ^^is_buyer_request_cancel | boolean |  | True when the buyer has a pending cancellation request |
| ^^is_cod | boolean |  | This option is for sellers that accept cash payment on delivery which is rare. Buyers will pay in cash upon receipt of package. Default value is `FALSE`. Only applicable to countries where Cash on Delivery (COD) is supported. |
| ^^is_exchange_order | boolean |  | When TRUE, this is an exchange order. Note: Only available in US and UK. |
| ^^is_on_hold_order | boolean |  | Indicates whether the order experienced or will be experienced `ON_HOLD` status. |
| ^^is_replacement_order | boolean |  | When true, this is a replacement order. |
| ^^is_sample_order | boolean |  | Use this field to determine whether the order is a sample order. |
| ^^line_items | array<object> |  | Line item info list. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. Only available in Indonesia market. |
| ^^^cancel_reason | string |  | Item cancellation reason. |
| ^^^cancel_user | string |  | The initiator of a cancellation request: - `BUYER` - `SELLER` - `OPERATOR` - `SYSTEM` |
| ^^^combined_listing_skus | array<object> |  | For a virtual bundle SKU, returns an array of related product SKUs that compose the virtual bundle SKU. |
| ^^^^product_id | string |  | The original `product_id` related to the virtual bundle SKU. |
| ^^^^seller_sku | string |  | The original `seller_sku` (which is defined by sellers) related to the virtual bundle SKU. |
| ^^^^sku_count | integer |  | The quantity of original SKU that compose the virtual bundle SKU. |
| ^^^^sku_id | string |  | The original `sku_id` related to the virtual bundle SKU. |
| ^^^currency | string |  | Currency for payment. |
| ^^^display_status | string |  | - `UNPAID`: The order is placed, but payment is not yet completed. - `AWAITING_SHIPMENT`: The order is ready for shipment, but no items are shipped yet. - `AWAITING_COLLECTION`:  The shipment is arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package is collected by the carrier and delivery is in progress. - `DELIVERED`: The package is delivered to buyer. - `COMPLETED`: The order is completed, and no further returns or refunds are allowed. - `CANCELLED`: The order is canceled. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^gift_retail_price | string |  | Retail price of the free item in orders Live giveaway, free sample and gift with purchase. For other orders, this field always returns 0. This amount can be used for free samples and live giveaway order invoice in Brazil |
| ^^^handling_duration_days | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `handling_duration` instead.] The number of business days required for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the value for `sku_type` is `MADE_TO_ORDER`. |
| ^^^id | string |  | Line item ID. |
| ^^^is_dangerous_good | boolean |  | Whether the SKU is a hazmat item. When creating the label for a hazmat item, you must follow the platform rules to put certain items into one package. Please refer to the relationship between `sku_id` and `package_id` to determine how to follow platform rules. |
| ^^^is_gift | boolean |  | Indicates whether the current order line is a gift. |
| ^^^is_unboxing_item | boolean |  | If `true`, indicates the sku is a blind box item that will need be unboxed to reveal the actual product to the buyer. The actual product sku name and picture can also be updated to TikTok after the unboxing is completed. Note: This is currently only available in the US market. |
| ^^^item_tax | array<object> |  | Item tax detail. |
| ^^^^tax_amount | string |  | Tax amount. |
| ^^^^tax_rate | string |  | Tax rate. |
| ^^^^tax_type | string |  | Tax type. - `SALES_TAX` (US market sales tax) Currently only sales tax is available. |
| ^^^needs_prescription | boolean |  | A flag to indicate whether the included product requires a prescription. |
| ^^^original_price | string |  | Item original price, please refer to the currency of `payment_info`. |
| ^^^package_id | string |  | An order can contain one or more packages based on how the seller chooses to ship. Each package has a unique `package_id` (and also a `tracking_id`, which is used to track the progress of the package as it is shipped). For local sellers in the US and UK markets, the `package_id` and `package_status` property will not be returned before the package is shipped |
| ^^^package_status | string |  | The package status of the item: - `TO_FULFILL`: package waiting seller to arrange shipment. - `PROCESSING`: package shipment has been arranged by seller. Waiting carrier to collect the parcel. - `FULFILLING`: package has been collected by carrier and in transit. - `COMPLETED`: package has been delivered. - `CANCELLED`: package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^^^pfand_fee | string |  | Deposit fee that is applied to certain products, typically beverage containers such as bottles or cans. **Note** Only available in Germany market |
| ^^^platform_discount | string |  | Platform discount amount, please refer to the currency of `payment_info`. |
| ^^^product_id | string |  | Product ID. |
| ^^^product_name | string |  | Product name. |
| ^^^retail_delivery_fee | string |  | RDF (retail delivery fee). Available only in the US market. |
| ^^^rts_time | integer |  | The time seller shipped line order (call Ship Order endpoint successfully). Unix timestamp. |
| ^^^sale_price | string |  | Item sale price, please refer to the currency of `payment_info`. |
| ^^^seller_discount | string |  | Seller discount amount. Please refer to the currency of `payment_info`. |
| ^^^seller_sku | string |  | The seller stock keeping unit (SKU) of the item. |
| ^^^shipping_provider_id | string |  | The shipping provider ID of the item. |
| ^^^shipping_provider_name | string |  | The shipping provider name of the item. |
| ^^^sku_id | string |  | SKU ID. |
| ^^^sku_image | string |  | SKU image. |
| ^^^sku_name | string |  | The name of the SKU, combined by product SKU attribute like size or color. For example, "Black, 26." |
| ^^^sku_type | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `order_type` instead.] The order line type: Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY:` An item purchased during a lottery event in TikTok LIVE. - `SHOP_PARTNER`: An item purchased from a TikTok Shop partner store. **US** - `PRE_ORDER`: An item that is not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An item that is produced only after the order is received. Fulfillment starts after the product is produced. |
| ^^^small_order_fee | string |  | Small order fee for TH. |
| ^^^tracking_number | string |  | Tracking number. Available after package has been shipped. |
| ^^^unboxing_sku_code | string |  | A seller's third party sku code for the actual unboxed item, which warehouse fulfillment operations can reference to identify the accurate product they are shipping. Note: This is currently only available in the US market. |
| ^^need_upload_invoice | string |  | Whether an invoice needs to be uploaded and uploaded status (only for Brazil market). - UNKNOWN:  Currently unable to confirm whether an invoice is needed - NEED_INVOICE: This order requires an invoice and the invoice has not been uploaded yet - NO_NEED：This order does not require an invoice - INVOICE_UPLOADED: The invoice for this order has been uploaded and verified. If the order is split, it will be marked as "uploaded" once any sub-order's invoice is uploaded. - INVOICE_PROCESSING: The invoice for this order is currently being uploaded/cancelled. Please wait for the final result and do not repeat the operation |
| ^^order_rights | array<integer> |  | Order tag identifier if has certain rights within the order based on the program subscribed by sellers. 1 = Shipping Fee Reimbursement Program 2 = Horizon+ Program Applicable for SEA market only |
| ^^order_type | string |  | The order type. Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY`: An order placed during a lottery event in TikTok LIVE. **US** - `PRE_ORDER`: An advance order for items that are not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An order for items that are produced only after the order is received. Fulfillment starts after the product is produced. - `BACK_ORDER`: An order for items that are out of stock but expected to be restocked. Fulfillment starts after the product is restocked. Returns an empty value for standard orders or other types that don't fall into the above categories. |
| ^^packages | array<object> |  | List of packages included in this order |
| ^^^id | string |  | Package ID |
| ^^paid_time | integer |  | The date and time that the order was paid. Unix timestamp. |
| ^^payment | object |  | Payment info about a TikTok Shop order. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. Only available in Indonesia market. |
| ^^^currency | string |  | Currency for payment. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^handling_fee | string |  | A fee charged to buyers to cover the additional processing/handling costs associated with the chosen payment method. |
| ^^^item_insurance_fee | string |  | The cost incurred by the buyers for coverage against defects or damage to the product after purchase. **Note**: Available only in the Indonesia market. |
| ^^^item_insurance_tax | string |  | The tax paid on the insurance purchased by buyers. Note: Only applicable in US market. |
| ^^^original_shipping_fee | string |  | Shipping fee before discount |
| ^^^original_total_product_price | string |  | Total original price of products (VAT included for crossborder shop). For the US market, this is pre-tax total amount. |
| ^^^payment_discount_service_fee | string |  | Service fee as paid by the buyer to apply payment platform discount |
| ^^^payment_platform_discount | string |  | Discount applied to the order funded by a payment platform |
| ^^^platform_discount | string |  | Product discount by platform. |
| ^^^product_tax | string |  | The tax on the total item price. |
| ^^^retail_delivery_fee | string |  | RDF (retail delivery fee). Available only in the US market. |
| ^^^seller_discount | string |  | Product discount by seller. |
| ^^^shipping_fee | string |  | Buyer paid shipping fee. `shipping_fee` = `original_shipping_fee` - `shipping_fee_seller_discount` - `shipping_fee_platform_discount` For the US market, this is pre-tax total amount. |
| ^^^shipping_fee_cofunded_discount | string |  | Shipping fee discount provided by seller, eligible for co-funded reimbursement upon order delivery, based on Co-Funded Free Shipping program terms. **Note**: This will be 0 for orders that did not meet minimum order value for co-funded reimbursement. In this case, refer to `shipping_fee_seller_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_platform_discount | string |  | Shipping fee discount by platform. |
| ^^^shipping_fee_seller_discount | string |  | Shipping fee discount provided by seller for an order that will not qualify for co-funded reimbursement. **Note**: If an order meets the minimum order value for co-funded reimbursement, this will be 0. In this case, refer to `shipping_fee_cofunded_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_tax | string |  | The tax on the shipping price. |
| ^^^shipping_insurance_fee | string |  | The cost incurred by the buyers for coverage against loss or damage to goods during transit. **Note**: Available only in the Indonesia market. |
| ^^^small_order_fee | string |  | Small order fee for TH. Small order fee is for Thailand only. small order fee means that the platform will set a minimum order spending amount, when the order amount is lower than the minimum order spending amount, the user needs to pay small order fee to meet the platform minimum spending amount. e.g. Minimum order spending amount is 100, order amount is 80. So the small order fee will be 20. |
| ^^^sub_total | string |  | Buyer paid subtotal of all the SKUs in the order. For the US market, this is pre-tax total amount. `sub_total` = `original_total_product_price` - `seller_discount` - `platform_discount` |
| ^^^tax | string |  | Buyer paid total taxes of the order. Applicable to crossborder shops and the US market. |
| ^^^total_amount | string |  | Buyer paid total amount. `total_amount` = `sub_total` + `shipping_fee` + `taxes` + `retail_delivery_fee` |
| ^^payment_auth_code | string |  | Authorization code of current transaction (only for the Brazilian market). For card transactions (credit/debit card), this field will be transaction authorization code. For PIX transactions, this field will be E2E ID. |
| ^^payment_card_type | string |  | Code to distinguish different payment method. Only assigned when the payment method is using bank card. Possible values are: Debit, Credit, Prepaid |
| ^^payment_method_code | string |  | Payment method code identifying current transaction. It will contains payment method and card brand if it is card transaction. |
| ^^payment_method_name | string |  | Payment method name, only for display |
| ^^pick_up_cut_off_time | integer |  | To avoid LDR, you must ensure the package is picked up by this time. Only applicable in Southeast Asia regions. |
| ^^recipient_address | object |  | `recipient_address` is not available under `UNPAID` and `ON_HOLD` status. |
| ^^^address_detail | string |  | Full buyer detail address. |
| ^^^address_line1 | string |  | The first line of the street address. |
| ^^^address_line2 | string |  | The second line of the street address |
| ^^^address_line3 | string |  | The third line of the street address. Applicable only for the BR market. |
| ^^^address_line4 | string |  | The fourth line of the street address. Applicable only for the BR market. |
| ^^^delivery_preferences | object |  | Contains all of the delivery instructions provided by the buyer for the shipping address. Currently, only available in the US market. |
| ^^^^drop_off_location | string |  | Drop-off location selected by the buyer. |
| ^^^district_info | array<object> |  | District information list. |
| ^^^^address_level | string |  | Administrative district level code. Value can be L0/L1/L2/L3/L4. eg. US is L0 |
| ^^^^address_level_name | string |  | The name of administrative division that can be used by seller for ship. e.g. state/county/city/district/town etc. |
| ^^^^address_name | string |  | Administrative area name. eg: London |
| ^^^^iso_code | string |  | ISO code of the administrative district level |
| ^^^first_name | string |  | The first name of the recipient. If the buyer does not provide their first and last name separately, this parameter will have the same value as the "name" parameter. |
| ^^^first_name_local_script | string |  | Recipient first name in katakana. **Note**: Applicable only for the JP market. |
| ^^^full_address | string |  | The complete recipient addresses information. |
| ^^^last_name | string |  | The last name of the recipient. If the buyer does not provide their first and last name separately, this parameter will be empty. |
| ^^^last_name_local_script | string |  | Recipient last name in katakana. **Note**: Applicable only for the JP market. |
| ^^^name | string |  | The name of the recipient. Please note, if this order uses platform logistics, recipient name will be desensitized |
| ^^^phone_number | string |  | The telephone number of the buyer. Please notice, if this order uses platform logistics, phone number will be desensitized. |
| ^^^post_town | string |  | Post town of the address Note: Available only in UK market |
| ^^^postal_code | string |  | The postal code that can be used by seller for shipping (in the U.S, this is the ZIP code). |
| ^^^region_code | string |  | Region code. |
| ^^recommended_shipping_time | integer |  | Recommended time to ship based on the each LSP service type (only available in SEA) |
| ^^release_date | integer |  | The date on which order handling starts and the status of the order changes to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only if the `order_type` is `PRE_ORDER`. |
| ^^replaced_order_id | string |  | The order ID for the order that is being replaced. Returned only if `is_replacement_order` = `true` |
| ^^request_cancel_time | integer |  | Buyer request cancel time. |
| ^^rts_sla_time | integer |  | The latest shipping time specified by the platform. Unix timestamp. |
| ^^rts_time | integer |  | The time seller shipped the order (call Ship Order endpoint successfully). Unix timestamp. |
| ^^seller_note | string |  | This field return the note, which seller notes in TikTok Seller Center. |
| ^^shipping_due_time | integer |  | If the order hasn't updated its status to `AWAITING_COLLECTION` before this time, the order will be automatically canceled by TikTok Shop. |
| ^^shipping_provider | string |  | The name of the current shipping provider. |
| ^^shipping_provider_id | string |  | The ID of the current shipping provider. |
| ^^shipping_type | string |  | The method of delivery. - `TIKTOK`: shipping service provided by TikTok. The seller should obtain shipping label from TikTok. - `SELLER`: seller provides shipping, including through 3rd party fulfillment providers on behalf of the seller. |
| ^^split_or_combine_tag | string |  | Indicate whether the order is combined or split. - `COMBINED` - `SPLIT` This field will be used in future fulfillment apis. |
| ^^status | string |  | The order status. Possible values: - `UNPAID`: The order is placed, but payment is not yet completed. - `ON_HOLD`: The order is accepted and is waiting for fulfillment so the buyer may still cancel without the seller’s approval. If `order_type=PRE_ORDER`, it also means the product is still awaiting release so payment will only be authorized 1 day before the release, but the seller should start preparing for the release. - `AWAITING_SHIPMENT`: The order is ready for shipment, but no items are shipped yet. - `PARTIALLY_SHIPPING`: Some items in the order are shipped, but not all. - `AWAITING_COLLECTION`: The shipment is arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package is collected by the carrier and delivery is in progress. - `DELIVERED`: The package is delivered to buyer. - `COMPLETED`: The order is completed, and no further returns or refunds are allowed. - `CANCELLED`: The order is cancelled. |
| ^^tracking_number | string |  | Tracking number. Available after ship package. |
| ^^tts_sla_time | integer |  | The latest collection time specified by the platform. Unix timestamp. |
| ^^update_time | integer |  | Time of order status changes. Unix timestamp. |
| ^^user_id | string |  | The buyer's user ID. |
| ^^warehouse_id | string |  | seller warehouse ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOrderList

Returns a list of orders created or updated during the timeframe indicated by the specified parameters. You can also apply a range of filtering criteria to narrow the list of orders returned, such as order status, delivery option type, and buyer user ID.

**Path:** `/order/202309/orders/search`
**Method:** `POST`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-order-list-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_size | integer | Y | The number of results to be returned per page. Default: 20. Valid range: [1-100]. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: DESC Possible values: - ASC: Ascending order - DESC: Descending order |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| sort_field | string |  | The returned results will be sorted by the specified field. Default: `create_time` Possible values: - `create_time` - `update_time` Specify the order for sorting the returned results by using the `sort_order` parameter. |
| shop_cipher | string |  | Use this property to pass shop information in requesting the API. Failure in passing the correct value when requesting the API for cross-border shops will return incorrect response. |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| buyer_user_id | string |  | Buyer user ID. |
| create_time_ge | integer |  | Filter orders to show only those that are created on or after the specified date and time. Unix timestamp. Note: `create_time_ge` and `create_time_lt` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_lt` is empty, `create_time_lt` will default to the current time. - If `create_time_lt` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
| create_time_lt | integer |  | Filter orders to show only those that are created before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |
| is_buyer_request_cancel | boolean |  | Whether the buyer has initiated an order cancellation request. |
| order_status | string |  | Specific order status. Available values: - `UNPAID`: The order has been placed, but payment has not been completed. - `ON_HOLD`: The order has been accepted and is awaiting fulfillment. The buyer may still cancel without the seller’s approval. If `order_type=PRE_ORDER`, the product is still awaiting release so payment will only be authorized 1 day before the release, but the seller should start preparing for the release. - `AWAITING_SHIPMENT`: The order is ready to be shipped, but no items have been shipped yet. - `PARTIALLY_SHIPPING`: Some items in the order have been shipped, but not all. - `AWAITING_COLLECTION`: Shipping has been arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package has been collected by the carrier and delivery is in progress. - `DELIVERED`: The package has been delivered to the buyer. - `COMPLETED`: The order has been completed, and no further returns or refunds are allowed. - `CANCELLED`: The order has been cancelled. |
| shipping_type | string |  | The delivery method. - `TIKTOK`: Shipping service provided by TikTok. The seller should obtain a shipping label from TikTok. - `SELLER`: Seller provides shipping, including through 3rd party fulfillment providers on behalf of the seller. |
| update_time_ge | integer |  | Filter orders to show only those that are updated on or after the specified date and time. Unix timestamp. Note: `update_time_ge` and `update_time_lt` together define the update time filter condition. - If `update_time_ge` is filled but `update_time_lt` is empty, `update_time_lt` will default to the current time. - If `update_time_lt` is filled but `update_time_ge` is empty, `update_time_ge` will default to the earliest shop time. Update times may exceed the selected search range due to ongoing data refreshes during the search process. |
| update_time_lt | integer |  | Filter orders to show only those that are updated before the specified date and time. Unix timestamp. Refer to notes in `update_time_ge` for more usage information. Update times may exceed the selected search range due to ongoing data refreshes during the search process. |
| warehouse_ids | array<string> |  | Filter orders by pickup/sales warehouse IDs. Applicable only if the multi-warehouse feature is enabled. Max count: 100 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^orders | array<object> |  | Order information. |
| ^^auto_combine_group_id | string |  | An identifier assigned to orders from the same customer during a LIVE session to facilitate combined order shipping when "auto-combination" is activated in Seller Center. |
| ^^buyer_avatar | string |  | The avatar of the TikTok buyer, which is defined by the TikTok user. The buyer_avatar can be used in conjunction with the buyer_nickname when displaying the unboxing results within the TikTok Live Session. |
| ^^buyer_email | string |  | The anonymized email address of the buyer. It is not recommended to send messages directly to this email address. If you need to contact the buyer, please go to the TikTok Shop Seller Center - Buyer Messages page. |
| ^^buyer_message | string |  | The note from the buyer. |
| ^^buyer_nickname | string |  | The nickname of the TikTok buyer, which is defined by the TikTok user. The buyer_nickname can be used to identify the buyer when displaying the unboxing results within the TikTok Live Session. |
| ^^cancel_order_sla_time | integer |  | The automatic cancellation time for orders specified by the platform. Unix timestamp. |
| ^^cancel_reason | string |  | The cancellation reason. Please visit [our list of cancel reasons](https://partner.tiktokshop.com/docv2/page/67e61eee427345048595487d) for more information. |
| ^^cancel_time | integer |  | The time an order's status was updated to `CANCELLED`. Unix timestamp. |
| ^^cancellation_initiator | string |  | Cancellation request initiator. Available values: - `SELLER` - `BUYER` - `SYSTEM` |
| ^^collection_due_time | integer |  | If the order hasn't updated its status to `IN_TRANSIT` before this time, the order will be canceled by TikTok Shop. Unix timestamp. |
| ^^collection_time | integer |  | The time an order's status has been updated to `IN_TRANSIT`. Unix timestamp. |
| ^^commerce_platform | string |  | The platform where the order was placed. Possible values: - `TIKTOK_SHOP` - `TOKOPEDIA` **Note**: Available only in the Indonesia market. |
| ^^consultation_id | string |  | An ID to identify the corresponding ePharmacy consultation. Applicable only if an ePharmacy consultation was initiated. Not applicable if the prescription was provided by the customer through an image upload. |
| ^^cpf | string |  | CPF (invoice number), used to issue an invoice. **Note**: Only available in the Brazil market. |
| ^^cpf_name | string |  | Name belonging to the CPF number for the Brazil market. |
| ^^create_time | integer |  | The date and time that the order was created. Unix timestamp. |
| ^^delivery_due_time | integer |  | If the order hasn't updated its status to `DELIVERED` before this time, the order will be automatically canceled by TikTok Shop. Unix timestamp. |
| ^^delivery_option_id | string |  | Delivery option ID is mapped to seller configured logistics templates ID. |
| ^^delivery_option_name | string |  | Delivery option name. For display purposes only. Available values: - `Economy Shipping` - `Standard Shipping` - `Express Shipping` |
| ^^delivery_option_required_delivery_time | integer |  | Order should be delivered before this time. Unix timestamp. |
| ^^delivery_sla_time | integer |  | Order should arrive by this date to be considered on-time and to avoid late delivery penalties. |
| ^^delivery_time | integer |  | The time an order's status changed to `DELIVERED`. Unix timestamp. |
| ^^delivery_type | string |  | Indicates whether it is a Pick-Up Drop-Off (PUDO) location. The PUDO location is selected by the buyer when placing orders. Available values: - `HOME_DELIVERY`: not a PUDO location - `COLLECTION_POINT`: a PUDO location |
| ^^exchange_source_order_id | string |  | If the order is an exchange order, this field returns the original order's order ID, from which the exchange order was generated. Returned only if is_exchange_order = true. Note: Only available in US and UK. |
| ^^fast_delivery_program | string |  | A badge presented on the merchandise to tell the buyer that the seller participates in the fast delivery program, such that the order should arrive in a promised time period. Possible values: - `3_DAY_DELIVERY` Not returned if order did not meet fast delivery program requirements. Note: Applicable only for the US market. |
| ^^fast_dispatch_sla_time | integer |  | The latest collection time to gain incentives of NDD (Next Day Delivery) project. Unix timestamp. **Note**: Only available in Thailand and the Philippines. |
| ^^fulfillment_priority_level | integer |  | Fulfillment priority value that can be used to prioritize shipping (only available in SEA) 100 = Instant 200 = Sameday 8 Hours 300 = Sameday 400 = Next Day Delivery 500 = Express 600 = Standard 700 = Economy 800 = Cargo |
| ^^fulfillment_type | string |  | Fulfillment type. Only orders with fulfillment type can be shipped by sellers. Available values: - `FULFILLMENT_BY_SELLER`: a method where sellers fulfill orders directly from their own inventory, without using TikTok's fulfillment centers. In this model, the seller is responsible for storing, packaging, and shipping the products to customers. - `FULFILLMENT_BY_TIKTOK`: a service offered by TikTok where sellers can send their products to TikTok's fulfillment centers. TikTok then takes care of storing, picking, packing, and shipping the products to customers. - `FULFILLMENT_BY_DILAYANI_TOKOPEDIA`: a method where Tokopedia GoTo Logistics provides warehousing and logistics services to sellers and charges a fee for the service. |
| ^^handling_duration | object |  | The duration for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the `order_type` is `MADE_TO_ORDER` or `BACK_ORDER`. |
| ^^^days | string |  | The number of days. |
| ^^^type | string |  | Indicates if the duration is calculated in calendar days or business days. Possible values: - `CALENDAR_DAY`: Represents consecutive days, including weekends and holidays. - `BUSINESS_DAY`: Represents business days, excluding weekends and public holidays. Default: `BUSINESS_DAY` |
| ^^has_updated_recipient_address | boolean |  | Whether the recipient address has been updated or changed. |
| ^^id | string |  | TikTok Shop order ID. |
| ^^is_buyer_request_cancel | boolean |  | Whether the buyer has a pending cancellation request. |
| ^^is_cod | boolean |  | This option is for sellers that accept cash payment on delivery (COD). Buyers will pay in cash upon receiving the package. Default: FALSE Only applicable to countries where COD is supported. |
| ^^is_exchange_order | boolean |  | When TRUE, this is an exchange order. Note: Only available in US and UK. |
| ^^is_on_hold_order | boolean |  | Indicates whether the order has been changed to or will be updated to `ON_HOLD` status. |
| ^^is_replacement_order | boolean |  | Whether this is a replacement order. |
| ^^is_sample_order | boolean |  | Use this field to determine whether the order is a sample order. |
| ^^line_items | array<object> |  | Line item info list. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. **Note**: Only available in the Indonesia market. |
| ^^^cancel_reason | string |  | The cancellation reason. Please visit [our list of cancel reasons](https://partner.tiktokshop.com/docv2/page/67e61eee427345048595487d) for more information. |
| ^^^cancel_user | string |  | Cancellation request initiator. Available values: - `BUYER` - `SELLER` - `OPERATOR` - `SYSTEM` |
| ^^^combined_listing_skus | array<object> |  | For a virtual bundle SKU, returns an array of related product SKUs that compose the virtual bundle. |
| ^^^^product_id | string |  | The original product ID related to the virtual bundle SKU. |
| ^^^^seller_sku | string |  | The original seller SKU (which is defined by the seller) related to the virtual bundle SKU. |
| ^^^^sku_count | integer |  | The quantity of original SKUs that compose the virtual bundle. |
| ^^^^sku_id | string |  | The original SKU ID related to the virtual bundle SKU. |
| ^^^currency | string |  | Currency for payment. |
| ^^^display_status | string |  | Available values: - `UNPAID`: The order has been placed, but payment has not yet completed. - `AWAITING_SHIPMENT`: The order is ready for shipment, but no items have been shipped yet. - `AWAITING_COLLECTION`: Shipping has been arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package has been collected by the carrier and delivery is in progress. - `DELIVERED`: The package has been delivered to the buyer. - `COMPLETED`: The order has been completed, and no further returns or refunds are allowed. - `CANCELLED`: The order has been cancelled. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^gift_retail_price | string |  | Retail price of the free item in orders Live giveaway, free sample and gift with purchase. For other orders, this field always returns 0. This amount can be used for free samples and live giveaway order invoice in Brazil |
| ^^^handling_duration_days | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `handling_duration` instead.] The number of business days required for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the value for `sku_type` is `MADE_TO_ORDER`. |
| ^^^id | string |  | Line item ID. |
| ^^^is_dangerous_good | boolean |  | Whether the SKU is a hazmat item. When creating the label for a hazmat item, you must follow the platform rules to put certain items into one package. Please refer to the relationship between `sku_id` and `package_id` to determine how to follow platform rules. |
| ^^^is_gift | boolean |  | Indicates whether the current order line item is a gift. |
| ^^^is_unboxing_item | boolean |  | If `true`, indicates the sku is a blind box item that will need be unboxed to reveal the actual product to the buyer. The actual product sku name and picture can also be updated to TikTok after the unboxing is completed. Note: This is currently only available in the US market. |
| ^^^item_tax | array<object> |  | Item tax detail. |
| ^^^^tax_amount | string |  | Tax amount. |
| ^^^^tax_rate | string |  | Tax rate. |
| ^^^^tax_type | string |  | Tax type. Available values: - `SALES_TAX` (US market sales tax) **Note**: Currently only sales tax is available. |
| ^^^needs_prescription | boolean |  | A flag to indicate whether the included product requires a prescription. |
| ^^^original_price | string |  | Item original price. Please refer to the currency of `payment_info`. |
| ^^^package_id | string |  | An order can contain one or more packages based on how the seller chooses to ship. Each package has a unique `package_id` and `tracking_id`. |
| ^^^package_status | string |  | The package status of the item. Available values: - `TO_FULFILL`: Package awaiting seller to arrange shipment. - `PROCESSING`: Shipping has been arranged by the seller. Awaiting carrier collection. - `FULFILLING`: Package has been collected by carrier and is in transit. - `COMPLETED`: Package has been delivered. - `CANCELLED`: Package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^^^pfand_fee | string |  | Deposit fee that is applied to certain products, typically beverage containers such as bottles or cans. **Note** Only available in Germany market |
| ^^^platform_discount | string |  | Platform discount amount. Please refer to the currency of `payment_info`. |
| ^^^product_id | string |  | Product ID. |
| ^^^product_name | string |  | Product name. |
| ^^^retail_delivery_fee | string |  | Retail delivery fee (RDF). **Note**: Only available in the US market. |
| ^^^rts_time | integer |  | The time sellers shipped the order (called [Ship Package API](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) successfully). Unix timestamp. |
| ^^^sale_price | string |  | Item sale price. Please refer to the currency of `payment_info`. |
| ^^^seller_discount | string |  | Seller discount amount. Please refer to the currency of `payment_info`. |
| ^^^seller_sku | string |  | The seller stock keeping unit (SKU) of the item. |
| ^^^shipping_provider_id | string |  | The shipping provider ID of the item. |
| ^^^shipping_provider_name | string |  | The shipping provider name. |
| ^^^sku_id | string |  | SKU ID. |
| ^^^sku_image | string |  | SKU image. |
| ^^^sku_name | string |  | The name of the SKU, combined by product SKU attribute like size or color. e.g. "Black, 26" |
| ^^^sku_type | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `order_type` instead.] The order line type. Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY`: An item purchased during a lottery event in TikTok LIVE. - `SHOP_PARTNER`: An item purchased from a TikTok Shop partner store. **US** - `PRE_ORDER`: An item that is not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An item that is produced only after the order is received. Fulfillment starts after the product is produced. |
| ^^^small_order_fee | string |  | Small order fee for Thailand (TH). |
| ^^^tracking_number | string |  | Tracking number. Available after package has been shipped. |
| ^^^unboxing_sku_code | string |  | A seller's third party sku code for the actual unboxed item, which warehouse fulfillment operations can reference to identify the accurate product they are shipping. Note: This is currently only available in the US market. |
| ^^need_upload_invoice | string |  | Whether an invoice needs to be uploaded and uploaded status (only for Brazil market). - UNKNOWN:  Currently unable to confirm whether an invoice is needed - NEED_INVOICE: This order requires an invoice and the invoice has not been uploaded yet - NO_NEED：This order does not require an invoice - INVOICE_UPLOADED: The invoice for this order has been uploaded and verified. If the order is split, it will be marked as "uploaded" once any sub-order's invoice is uploaded. - INVOICE_PROCESSING: The invoice for this order is currently being uploaded/cancelled. Please wait for the final result and do not repeat the operation |
| ^^order_rights | array<integer> |  | Order tag identifier if has certain rights within the order based on the program subscribed by sellers. 1 = Shipping Fee Reimbursement Program 2 = Horizon+ Program Applicable for SEA market only |
| ^^order_type | string |  | The order type. Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY`: An order placed during a lottery event in TikTok LIVE. **US** - `PRE_ORDER`: An advance order for items that are not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An order for items that are produced only after the order is received. Fulfillment starts after the product is produced. - `BACK_ORDER`: An order for items that are out of stock but expected to be restocked. Fulfillment starts after the product is restocked. Returns an empty value for standard orders or other types that don't fall into the above categories. |
| ^^packages | array<object> |  | List of packages included in this order. |
| ^^^id | string |  | Package ID. |
| ^^paid_time | integer |  | The date and time that the order was paid. Unix timestamp. |
| ^^payment | object |  | Payment info about this order. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. Only available in the Indonesia market. |
| ^^^currency | string |  | Currency for payment. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^handling_fee | string |  | A fee charged to the buyer to cover the additional processing, handling, and/or installment costs associated with the chosen payment method. |
| ^^^item_insurance_fee | string |  | The cost incurred by the buyers for coverage against defects or damage to the product after purchase. **Note**: Only available in the US and Indonesia markets. |
| ^^^item_insurance_tax | string |  | The tax paid on the insurance purchased by buyers. Note: Only applicable in US market. |
| ^^^original_shipping_fee | string |  | Shipping fee before discount. |
| ^^^original_total_product_price | string |  | Total original price of the products (VAT included for cross-border shops). For the US market, this is pre-tax total amount. |
| ^^^payment_discount_service_fee | string |  | Service fee as paid by the buyer to apply payment platform discount |
| ^^^payment_platform_discount | string |  | Discount applied to the order funded by a payment platform |
| ^^^platform_discount | string |  | Product discount by platform. |
| ^^^product_tax | string |  | The tax on the total item price. |
| ^^^retail_delivery_fee | string |  | Retail delivery fee (RDF). **Note**: Only available in the US market. |
| ^^^seller_discount | string |  | Product discount by seller. |
| ^^^shipping_fee | string |  | Buyer paid shipping fee. `shipping_fee = original_shipping_fee - shipping_fee_seller_discount - shipping_fee_platform_discount` For the US market, this is pre-tax total amount. |
| ^^^shipping_fee_cofunded_discount | string |  | Shipping fee discount provided by seller, eligible for co-funded reimbursement upon order delivery, based on Co-Funded Free Shipping program terms. **Note**: This will be 0 for orders that did not meet minimum order value for co-funded reimbursement. In this case, refer to `shipping_fee_seller_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_platform_discount | string |  | Shipping fee discount provided by platform. |
| ^^^shipping_fee_seller_discount | string |  | Shipping fee discount provided by seller for an order that will not qualify for co-funded reimbursement. **Note**: If an order meets the minimum order value for co-funded reimbursement, this will be 0. In this case, refer to `shipping_fee_cofunded_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_tax | string |  | The tax on the shipping price. |
| ^^^shipping_insurance_fee | string |  | The cost incurred by the buyer for coverage against loss or damage to goods during transit. **Note**: Only available in the Indonesia market. |
| ^^^small_order_fee | string |  | Small order fee for TH (**Thailand market only**). Small order fee means that the platform will set a minimum order spending amount. When the order amount is lower than the minimum order spending amount, the user needs to pay a small order fee to meet the platform minimum spending amount. e.g. Minimum order spending amount is 100, order amount is 80. So the small order fee will be 20. |
| ^^^sub_total | string |  | Buyer paid sub-total of all the SKUs in the order. `sub_total = original_total_product_price - seller_discount - platform_discount` For the US market, this is pre-tax total amount. |
| ^^^tax | string |  | Buyer paid total taxes for the order. Applicable to both cross-border shops and the US market. |
| ^^^total_amount | string |  | Buyer paid total payment. `total_amount = sub_total + shipping_fee + taxes + retail_delivery_fee` |
| ^^payment_method_name | string |  | Payment method name, for display purposes. |
| ^^pick_up_cut_off_time | integer |  | To avoid LDR, you must ensure the package is picked up by this time. Only applicable in South East Asia regions. |
| ^^recipient_address | object |  | `recipient_address` is not available under `UNPAID` and `ON_HOLD` statuses. |
| ^^^address_detail | string |  | Full recipient detailed address. |
| ^^^address_line1 | string |  | The first line of the street address. |
| ^^^address_line2 | string |  | The second line of the street address. |
| ^^^address_line3 | string |  | The third line of the street address. Usually only for the Brazilian market |
| ^^^address_line4 | string |  | The fourth line of the street address. Usually only for the Brazilian market |
| ^^^delivery_preferences | object |  | Contains all of the delivery instructions provided by the recipient for the shipping address. Currently, only available in the US market. |
| ^^^^drop_off_location | string |  | Drop-off location selected by the recipient. |
| ^^^district_info | array<object> |  | `district_info` is unavailable under `UNPAID` and `ON_HOLD` statuses. |
| ^^^^address_level | string |  | Administrative district level code. Value can be L0/L1/L2/L3/L4. eg. US is L0. |
| ^^^^address_level_name | string |  | The name of administrative division that can be used by the seller for shipping. e.g. state/county/city/district/town/etc. |
| ^^^^address_name | string |  | Administrative area name. eg: London. |
| ^^^^iso_code | string |  | ISO code of the administrative district level |
| ^^^first_name | string |  | Recipient first name. If the recipient first and last names are not provided separately, this parameter will have the same value as the `name` parameter. |
| ^^^first_name_local_script | string |  | Recipient first name in katakana. **Note**: Applicable only for the JP market. |
| ^^^full_address | string |  | Complete recipient address information. |
| ^^^last_name | string |  | Recipient last name. If the recipient first and last names are not provided separately, this parameter will be empty. |
| ^^^last_name_local_script | string |  | Recipient last name in katakana. **Note**: Applicable only for the JP market. |
| ^^^name | string |  | Recipient name. **Note**: If this order uses platform logistics, the recipient name will be desensitized. |
| ^^^phone_number | string |  | Recipient telephone number. **Note**: If this order uses platform logistics, the phone number will be desensitized. |
| ^^^post_town | string |  | Post town of the address Note: Available only in UK market |
| ^^^postal_code | string |  | The postal code that can be used by seller for shipping. For the US market, this refers to the ZIP Code. |
| ^^^region_code | string |  | Region code. |
| ^^recommended_shipping_time | integer |  | Recommended time to ship based on the each LSP service type (only available in SEA) |
| ^^release_date | integer |  | The date on which order handling starts and the status of the order changes to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only if the `order_type` is `PRE_ORDER`. |
| ^^replaced_order_id | string |  | The order Id for the order that is being replaced. Returned only if `is_replacement_order = true`. |
| ^^request_cancel_time | integer |  | Buyer request cancellation time. Unix timestamp. |
| ^^rts_sla_time | integer |  | The latest shipping time specified by the platform. Unix timestamp. |
| ^^rts_time | integer |  | The time sellers shipped the order (called [Ship Package API](https://partner.tiktokshop.com/docv2/page/650aa4f1defece02be6e7cb1) successfully). Unix timestamp. |
| ^^seller_note | string |  | The seller note from TikTok Shop Seller Center. |
| ^^shipping_due_time | integer |  | If the order hasn't updated its status to `AWAITING_COLLECTION` before this time, the order will be automatically canceled by TikTok Shop. Unix timestamp. |
| ^^shipping_provider | string |  | The name of the current shipping provider. |
| ^^shipping_provider_id | string |  | The ID of the current shipping provider. |
| ^^shipping_type | string |  | Delivery method. Available values: - `TIKTOK`: Shipping service provided by TikTok. The seller should obtain shipping label from TikTok. - `SELLER`: Seller provides shipping, including through 3rd party fulfillment providers on behalf of the seller. |
| ^^split_or_combine_tag | string |  | Indicates whether the order is combined or split: - `COMBINED` - `SPLIT` This field will be used in future fulfillment APIs. |
| ^^status | string |  | Specific order status. Available values: - `UNPAID`: The order has been placed, but payment has not been completed. - `ON_HOLD`: The order has been accepted and is awaiting fulfillment. The buyer may still cancel without the seller’s approval. If `order_type=PRE_ORDER`, the product is still awaiting release so payment will only be authorized 1 day before the release, but the seller should start preparing for the release. - `AWAITING_SHIPMENT`: The order is ready to be shipped, but no items have been shipped yet. - `PARTIALLY_SHIPPING`: Some items in the order have been shipped, but not all. - `AWAITING_COLLECTION`: Shipping has been arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package has been collected by the carrier and delivery is in progress. - `DELIVERED`: The package has been delivered to the buyer. - `COMPLETED`: The order has been completed, and no further returns or refunds are allowed. - `CANCELLED`: The order has been cancelled. |
| ^^tracking_number | string |  | Tracking number. Available after the package has been shipped. |
| ^^tts_sla_time | integer |  | The latest collection time specified by the platform. Unix timestamp. |
| ^^update_time | integer |  | Time of order status change. Unix timestamp. |
| ^^user_id | string |  | Buyer user ID. |
| ^^warehouse_id | string |  | Seller warehouse ID. |
| ^total_count | integer |  | Total number of orders in the search result. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPrivilegedOrderDetail

Get the detailed order information of an Order, including important attributes such as order status, shipping addresses, payment details, price and tax info, and package information.

**Path:** `/order/202309/privileged_orders`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-privileged-order-detail-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| ids | array<string> | Y | A list of TikTok Shop order ID values. Max count : 50 |
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
| ^orders | array<object> |  | TikTok Shop orders. |
| ^^buyer_email | string |  | The anonymized email address of the buyer. It is not recommended to send messages directly to this email address. If you need to contact the buyer, please go to Seller Center - Buyer Messages page. |
| ^^buyer_message | string |  | The note from buyer. |
| ^^cancel_order_sla_time | integer |  | The automatic cancellation time for orders specified by the platform. Unix timestamp. |
| ^^cancel_reason | string |  | The reason for cancelling action. https://bytedance.feishu.cn/docx/ZUn0djl5LoZdJOxokSOcGdn5nRd |
| ^^cancel_time | integer |  | The timestamp of the order's status update to "CANCELLED" |
| ^^cancellation_initiator | string |  | Cancel request initiator. Avaliable value: SELLER/ BUYER/ SYSTEM . |
| ^^collection_due_time | integer |  | If the order hasn't updated its status to "IN_TRANSIT" before this time, the order will be canceled by TikTok Shop |
| ^^collection_time | integer |  | The timestamp of the order's status update to "IN_TRANSIT" |
| ^^cpf | string |  | CPF(invoice number), used to issue an invoice，only works in Brazil. |
| ^^create_time | integer |  | The date and time that the order was created. Unix timestamp for second. |
| ^^delivery_due_time | integer |  | If the order hasn't updated its status to "DELIVERED" before this time, the order will be canceled by TikTok Shop |
| ^^delivery_option_id | string |  | Order delivery option id. Delivery option ID is mapping to seller configured logistics templates id. |
| ^^delivery_option_name | string |  | Delivery option name. For display purposes only. |
| ^^delivery_option_required_delivery_time | integer |  | Order should be delivered before this time. |
| ^^delivery_sla_time | integer |  | The latest delivery time specified by the platform. |
| ^^delivery_time | integer |  | The timestamp of the order's status update to "DELIVERED" |
| ^^fulfillment_type | string |  | - Fulfillment type. Only orders with fulfillment type  can be shipped by sellers. FULFILLMENT_BY_SELLER: is a method where sellers fulfill orders directly from their own inventory, without using Tiktok's fulfillment centers. In this model, the seller is responsible for storing, packaging, and shipping the products to customers. - FULFILLMENT_BY_TIKTOK: is a service offered by TIktok where sellers can send their products to Tiktok's fulfillment centers. Tiktok then takes care of storing, picking, packing, and shipping the products to customers. |
| ^^has_updated_recipient_address | boolean |  | False: no update True: updated |
| ^^id | string |  | TikTok Shop order id |
| ^^is_buyer_request_cancel | boolean |  | True when the buyer has a pending cancellation request |
| ^^is_cod | boolean |  | This option is for Sellers that accept cash payment on delivery which is rare. Buyers will pay in cash upon receipt of package. Default value is FALSE. Only applicable to countries where Cod is supported. |
| ^^is_on_hold_order | boolean |  | Indicates whether the order experienced or will be experienced ON_HOLD status. |
| ^^is_replacement_order | boolean |  | When true, this is a replacement order. |
| ^^is_sample_order | boolean |  | Use this field to determine whether the order is a sample order. |
| ^^line_items | array<object> |  | Line item info list |
| ^^^cancel_reason | string |  | Item cancel reason |
| ^^^cancel_user | string |  | This is the initiator of the cancellation request - BUYER - SELLER - OPERATOR - SYSTEM |
| ^^^combined_listing_skus | array<object> |  | For a combined listing SKU, returns an array of related product SKUs that compose the combined listing SKU |
| ^^^^product_id | string |  | The original product_id related to the combined listing SKU |
| ^^^^sku_count | integer |  | The quantity of original SKU that compose the combined listing SKU |
| ^^^^sku_id | string |  | The orginal sku_id related to the combined listing SKU |
| ^^^currency | string |  | Currency for payment. |
| ^^^display_status | string |  | - UNPAID: The order has been placed but payment has not been finished. - AWAITING_SHIPMENT: Payment has been finished and order is ready for shipment, but no items in the order have been shipped. - AWAITING_COLLECTION:  Seller arranged shipment, but package is still waiting to handover the parcel to carrier. - IN_TRANSIT: Package has been collected by the carrier. - DELIVERED: Package delivered to buyer. - COMPLETED: Order has been completed. Orders are not allowed to initiate return or refund anymore. - CANCELLED: The order was cancelled. |
| ^^^id | string |  | Line item ID |
| ^^^is_gift | boolean |  | Indicates whether the current order line is a gift. |
| ^^^item_tax | array<object> |  | Item tax detail. |
| ^^^^tax_amount | string |  | Tax amount. |
| ^^^^tax_rate | string |  | Tax rate |
| ^^^^tax_type | string |  | Tax type. - SALES_TAX (US market sales tax) Currently only sales tax is available. |
| ^^^original_price | string |  | Item original price,please refer to the currency of payment_info |
| ^^^package_id | string |  | An Order can contain one more more packages based on how the Seller chooses to ship. Each package has a unique package_id (and also a tracking_id, which is used to track the progress of the package as it is shipped). |
| ^^^package_status | string |  | The package status of the item - TO_FULFILL: package waiting seller to arrange the shipment. - PROCESSING: package has been arranged by seller. Waiting carrier to collect the parcel. - FULFILLING: package has been collected by carrier and in transit. - COMPLETED: package has been delivered. - CANCELLED: package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^^^platform_discount | string |  | Platform discount amount,please refer to the currency of payment_info |
| ^^^product_id | string |  | Product ID |
| ^^^product_name | string |  | Product name |
| ^^^retail_delivery_fee | string |  | RDF(Retail delivery fee). Available only in the US market. |
| ^^^rts_time | integer |  | The time seller shipped line order (call ShipOrder successfully). Unix timestamp. |
| ^^^sale_price | string |  | Item sale price,please refer to the currency of payment_info |
| ^^^seller_discount | string |  | Seller discount amount. Please refer to the currency of payment_info |
| ^^^seller_sku | string |  | The seller stock keeping unit (SKU) of the item. |
| ^^^shipping_provider_id | string |  | The shipping provider id of the item |
| ^^^shipping_provider_name | string |  | The shipping provider name of the item |
| ^^^sku_id | string |  | Sku id |
| ^^^sku_image | string |  | SKU image |
| ^^^sku_name | string |  | The name of the SKU, combined by product SKU attribute like size or color. For example, "Black, 26". |
| ^^^sku_type | string |  | Order line type： - NORMAL: An item for which the selling partner currently has inventory in stock. - PRE_ORDER: An item with a release date that is in the future. - ZERO_LOTTERY:  An item obtained through a lottery event. - SHOP_PARTNER: An shop partner order from Tiktok Shop partner store. |
| ^^^small_order_fee | string |  | Small order fee for TH |
| ^^^tracking_number | string |  | Tracking number. Available after ship pacakge. |
| ^^need_upload_invoice | string |  | need to upload the invoice (Only work in Brazil） - UNKNOWN - NEED_INVOICE - NO_NEED |
| ^^packages | array<object> |  | List of packages included in this order |
| ^^^id | string |  | Package ID |
| ^^paid_time | integer |  | The date and time that the order was paid. Unix timestamp for second. |
| ^^payment | object |  | Payment info about this order |
| ^^^currency | string |  | Currency for payment. |
| ^^^original_shipping_fee | string |  | Shipping fee before discount |
| ^^^original_total_product_price | string |  | Total original price of products. (VAT included for crossborder shop). For the US market, this is pre-tax total amount. |
| ^^^platform_discount | string |  | Product discount by platform. |
| ^^^product_tax | string |  | The tax on the total item price. |
| ^^^retail_delivery_fee | string |  | RDF(Retail delivery fee). Available only in the US market. |
| ^^^seller_discount | string |  | Product discount by seller. |
| ^^^shipping_fee | string |  | Buyer paid shipping fee. Shipping_fee = original_shipping_fee - shipping_fee_seller_discount - shipping_fee_platform_discount For the US market, this is pre-tax total amount. |
| ^^^shipping_fee_platform_discount | string |  | Shipping fee discount by platform. |
| ^^^shipping_fee_seller_discount | string |  | Shipping fee discount by seller. |
| ^^^shipping_fee_tax | string |  | The tax on the shipping price. |
| ^^^small_order_fee | string |  | Small order fee for TH. Small order fee is for Thailand only. small order fee means that the platform will set a minimum order spending amount, when the order amount is lower than the minimum order spending amount, the user needs to pay small order fee to meet the platform minimum spending amount. e.g. Minmum order spending amount is 100, order amount is 80. So the small order fee will be 20. |
| ^^^sub_total | string |  | Buyer paid sub total of all the SKUs in the order. For the US market, this is pre-tax total amount. sub_total = original_total_product_price - seller_discount - platform_discount |
| ^^^tax | string |  | Buyer paid total taxes of the order. Applicable to crossborder shops and the US market. |
| ^^^total_amount | string |  | Buyer paid total payment. Total_amount=sub_total+shipping_fee+taxes+retail_delivery_fee. |
| ^^payment_method_name | string |  | Payment method name, only for display |
| ^^recipient_address | object |  | recipient_address is not available under unpaid and on hold status |
| ^^^address_detail | string |  | Full buyer detail address |
| ^^^address_line1 | string |  | The first line of the street address |
| ^^^address_line2 | string |  | The second line of the street address |
| ^^^address_line3 | string |  | The third line of the street address. Usually only for the Brazilian market |
| ^^^address_line4 | string |  | The fourth line of the street address. Usually only for the Brazilian market |
| ^^^delivery_preferences | object |  | Contains all of the delivery instructions provided by the buyer for the shipping address. Currently, only available in the US market. |
| ^^^^drop_off_location | string |  | Drop-off location selected by the buyer. |
| ^^^district_info | array<object> |  | district_info is unavailable under unpaid and on_hold status |
| ^^^^address_level | string |  | Administrative district level code. Value can be L0/L1/L2/L3/L4. eg. US is L0 |
| ^^^^address_level_name | string |  | The name of administrative division that can be used by seller for ship. e.g. state/county/city/district/town etc. |
| ^^^^address_name | string |  | Administrative area name. eg: London |
| ^^^email | string |  | The email address of the buyer. This field will only return a value if the following conditions are met: - The buyer confirms their willingness to share their real email address at the time of order placement. - The order is a Shopify 1P connector order. |
| ^^^full_address | string |  | The complete recipient addresses information. |
| ^^^name | string |  | The name of the buyer. Please notice, if this order use platform logistics, buyer name will be desensitized |
| ^^^phone_number | string |  | The telephone number of the buyer. Please notice, if this order use platform logistics, phone number will be desensitized |
| ^^^postal_code | string |  | The postal code that can be used by seller for shipping. (In the U.S, it means zipcode) |
| ^^^region_code | string |  | Region code |
| ^^^tokenized_email | string |  | The tokenized email address in which the seller can use to send messages to the buyer via TikTok Shop IM. Please note, the seller will need to first enable the email communication feature in Seller Center, and are subjected to the rules and conditions of TikTok Shop IM. This field will only return a value if the order is a Shopify 1P connector order. |
| ^^replaced_order_id | string |  | The order id for the order that is being replaced. Returned only if is_replacement_order = true |
| ^^request_cancel_time | integer |  | Buyer request cancel time |
| ^^rts_sla_time | integer |  | The latest shipping time specified by the platform. Unix timestamp. |
| ^^rts_time | integer |  | The time sellers shipped order(call ShipOrder successfully). Unix timestamp. |
| ^^sample_order_payer | string |  | Use this field to determine if the sample order is paid by seller or paid by TikTok. - SELLER: The cost of samples is borne by the seller. - TIKTOK: The cost of samples is borne by TikTok. |
| ^^seller_note | string |  | This field return the note, which seller notes in Tiktok seller center |
| ^^shipping_due_time | integer |  | If the order hasn't updated its status to "AWAITING_COLLECTION" before this time, the order will be canceled by TikTok Shop |
| ^^shipping_provider | string |  | The name of the current shipping provider. |
| ^^shipping_provider_id | string |  | The id of the current shipping provider. |
| ^^shipping_type | string |  | The method of delivery. - TIKTOK: shipping service provided by Tiktok. The seller should obtain shipping label from Tiktok. - SELLER: Seller provides shipping, including through 3rd party fulfillment providers on behalf of the Seller. |
| ^^split_or_combine_tag | string |  | Indicate whether the order is combined or split. - COMBINED - SPLIT This field will be used in future fulfillment apis. |
| ^^status | string |  | Order status available value: - ON_HOLD (currently ON_HOLD status is only available in the UK market) - UNPAID: The order has been placed but payment has not been finished. - ON_HOLD: Payment has been finished, but order allow buyer to cancel without seller approval. Not allow seller fulfill order under ON_HOLD status. - PARTIALLY_SHIPPING: One or more (but not all) items in the order have been shipped. - AWAITING_SHIPMENT: Payment has been finished and order is ready for shipment, but no items in the order have been shipped. - AWAITING_COLLECTION:  Seller arranged shipment, but package is still waiting to handover the parcel to carrier. - IN_TRANSIT: Package has been collected by the carrier. - DELIVERED: Package delivered to buyer. - COMPLETED: Order has been completed. Orders are not allowed to initiate return or refund anymore. - CALCELLED: The order was canceled. |
| ^^tracking_number | string |  | Tracking number. Available after ship pacakge. |
| ^^tts_sla_time | integer |  | The latest collection time specified by the platform. Unix timestamp. |
| ^^update_time | integer |  | Time of order status changes. Unix timestamp. |
| ^^user_id | string |  | Buyer User ID. |
| ^^warehouse_id | string |  | Seller warehouse id |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## SearchOrderByExternalOrderReference

If you have used the `Add External Order References` API to sync information from your external order management system (OMS) to corresponding orders in TikTok Shop, you may call this API to search for order information in TikTok Shop based on information in your OMS.

**Path:** `/order/202406/orders/external_order_search`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/search-order-by-external-order-reference-202406

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| platform | string | Y | The alias of your external order management system (OMS). Possible values: - SHOPIFY - WOOCOMMERCE - BIGCOMMERCE - MAGENTO - SALESFORCE_COMMERCE_CLOUD - CHANNEL_ADVISOR - AMAZON - ORDER_MANAGEMENT_SYSTEM - WAREHOUSE_MANAGEMENT_SYSTEM - ERP_SYSTEM |
| external_order_id | string | Y | Order ID in your OMS. |
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
| ^orders | array<object> |  | A list of returned orders. |
| ^^external_order | object |  | Order in your OMS. |
| ^^^id | string |  | Order ID in your OMS. |
| ^^^line_items | array<object> |  | Line items in the order. |
| ^^^^id | string |  | Line item ID in your OMS. |
| ^^^^origin_id | string |  | Line item ID in TikTok Shop. |
| ^^^platform | string |  | The alias of your OMS. |
| ^^id | string |  | The unique identifier for a TikTok Shop order. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## AddExternalOrderReferences

If you are using your own external OMS (order management system) to manage TikTok Shop orders, the corresponding order IDs between your OMS and TikTok Shop may be different.
Use this endpoint to attach the information in your OMS to the correct order(s) in TikTok Shop for further reference.

**Path:** `/order/202406/orders/external_orders`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/add-external-order-references-202406

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
| orders | array<object> |  | Max count: 100. |
| ^external_order | object |  | Order information in your external order management system (OMS). |
| ^^id | string |  | The corresponding order ID in your OMS. |
| ^^line_items | array<object> |  | Max count: 100. |
| ^^^id | string |  | Line item ID in your OMS. |
| ^^^origin_id | string |  | Line item ID in TikTok Shop. |
| ^^platform | string |  | The alias of your OMS. Possible values: - SHOPIFY - WOOCOMMERCE - BIGCOMMERCE - MAGENTO - SALESFORCE_COMMERCE_CLOUD - CHANNEL_ADVISOR - AMAZON - ORDER_MANAGEMENT_SYSTEM - WAREHOUSE_MANAGEMENT_SYSTEM - ERP_SYSTEM Notes: - To attach information from multiple OMSs to the same order in TikTok Shop, call this API multiple times, each with the same TikTok Shop order and a different OMS. - To edit the attached information for a TikTok Shop order, call the API with the same OMS. |
| ^id | string |  | The unique identifier for a TikTok Shop order. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | A list of error codes and their corresponding messages. |
| ^^code | string |  | A machine-readable response code that represents the request result. |
| ^^detail | object |  | The details of the error message. |
| ^^^external_order | object |  | The order information in your OMS. |
| ^^^^id | string |  | The corresponding order ID in your OMS. |
| ^^^^platform | string |  | The alias of your OMS. |
| ^^^order_id | string |  | The unique identifier for a TikTok Shop order. |
| ^^message | string |  | A human-readable message that describes the success or failure of the API request. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetExternalOrderReferences

If you have used the `Add External Order References` API to sync order information between your external order management system (OMS) and TikTok Shop, you may call this API to get information on the synced orders.

**Path:** `/order/202406/orders/{order_id}/external_orders`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/get-external-order-references-202406

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The unique identifier for a TikTok Shop order. |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| platform | string | Y | The alias of your external order management system (OMS). Possible values: - SHOPIFY - WOOCOMMERCE - BIGCOMMERCE - MAGENTO - SALESFORCE_COMMERCE_CLOUD - CHANNEL_ADVISOR - AMAZON - ORDER_MANAGEMENT_SYSTEM - WAREHOUSE_MANAGEMENT_SYSTEM - ERP_SYSTEM |
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
| ^external_orders | array<object> |  | A list of orders that have been synced between your OMS and TikTok Shop. Note: If you've synced order information between multiple OMSs to the same TikTok Shop order, you'll retrieve all external order information. |
| ^^id | string |  | Order ID in your OMS. |
| ^^line_items | array<object> |  | Line items in the order. |
| ^^^id | string |  | Line item ID in your OMS. |
| ^^^origin_id | string |  | Line item ID in TikTok Shop. |
| ^^platform | string |  | The alias of your OMS. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPriceDetail

Get the detailed pricing calculation information of an order or a line item, including vouchers, tax, etc.

**Path:** `/order/202407/orders/{order_id}/price_detail`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/get-price-detail-202407

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | Order ID |

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
| ^cod_fee | string |  | COD fee charged by shipping aggregators. For regions outside of Saudi Arabia, the value is `0.00`. |
| ^cod_fee_net_amount | string |  | COD fee charged by shipping aggregators including tax. For regions outside of Saudi Arabia, the value is `0.00`. |
| ^currency | string |  | Currency Type. Three-letter code, see [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html). |
| ^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^line_items | array<object> |  | Each object is the same as the "data" field (line 5) without "line_items" |
| ^^cod_fee | string |  | COD fee charged by shipping aggregators. For regions outside of Saudi Arabia, the value is `0.00`. |
| ^^cod_fee_amount | string |  | COD fee charged by shipping aggregators including tax. For regions outside of Saudi Arabia, the value is `0.00`. |
| ^^currency | string |  | Currency Type. Three-letter code, see [ISO 4217](https://www.iso.org/iso-4217-currency-codes.html). |
| ^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^id | string |  | corresponding line_item id |
| ^^net_price_amount | string |  | Price after tax |
| ^^payment | string |  | Payment of the order from the buyer. Calculation: `sku_sale_price` + `shipping_sale_price` + `tax_amount` + `small_order_fee` |
| ^^shipping_fee_deduction_platform | string |  | Shipping discount covered by the platform |
| ^^shipping_fee_deduction_platform_voucher | string |  | Shipping discount covered by the platform voucher `1010000`: PLATFORM_NEW_USER `1020000`: SELLER_SKU_PRICE `1030000`: PLATFORM_FREE_SHIPPING |
| ^^shipping_fee_deduction_seller | string |  | Shipping discount covered by the seller. |
| ^^shipping_list_price | string |  | Original shipping price |
| ^^shipping_sale_price | string |  | Promotional shipping price Calculation: shipping_list_price - shipping_fee_deduction -shipping_fee_deduction_platform |
| ^^sku_gift_net_price | string |  | Original sku list price of the gift product from the seller including tax. |
| ^^sku_gift_original_price | string |  | Original sku list price of the gift product from the seller. |
| ^^sku_list_price | string |  | Total MSRP price of the products. |
| ^^sku_sale_price | string |  | Total promotional sale price of the products. Calculation: `sku_list_price` - `subtotal_deduction_seller` - `subtotal_deduction_platform` |
| ^^subtotal | string |  | Total promotional sale price of the products including tax. Calculation: `sku_sale_price` + `subtotal_tax_amount` |
| ^^subtotal_deduction_platform | string |  | Platform provided price discount on the product |
| ^^subtotal_deduction_seller | string |  | Seller provided price discount on the product |
| ^^subtotal_tax_amount | string |  | Total tax amount on the product |
| ^^tax_amount | string |  | Total tax amount. Calculation: subtotal_tax_amount + shipping_fee_tax（in TaxDetail） + cod_fee_tax（TaxDetail） |
| ^^tax_rate | string |  | Tax rate |
| ^^total | string |  | Total number of the original price of the order. Calculation: `sku_list_price` + `shipping_list_price` |
| ^^voucher_deduction_platform | string |  | Type of the platform-providing discount on the product. Possible values: `1010000`: PLATFORM_NEW_USER, `1020000`: SELLER_SKU_PRICE, `1030000`: PLATFORM_FREE_SHIPPING |
| ^^voucher_deduction_seller | string |  | Type of the seller-providing discount on the product. Possible values: `1010000`: PLATFORM_NEW_USER, `1020000`: SELLER_SKU_PRICE, `1030000`: PLATFORM_FREE_SHIPPING |
| ^net_price_amount | string |  | Price after tax |
| ^payment | string |  | Payment of the order from the buyer. Calculation: `sku_sale_price` + `shipping_sale_price` + `tax_amount` + `small_order_fee` |
| ^shipping_fee_deduction_platform | string |  | Shipping discount covered by the platform |
| ^shipping_fee_deduction_platform_voucher | string |  | Shipping discount covered by the platform voucher: `1010000`: PLATFORM_NEW_USER, `1020000`: SELLER_SKU_PRICE `1030000`: PLATFORM_FREE_SHIPPING |
| ^shipping_fee_deduction_seller | string |  | Shipping discount covered by the seller. |
| ^shipping_list_price | string |  | Original shipping price |
| ^shipping_sale_price | string |  | Promotional shipping price Calculation: shipping_list_price - shipping_fee_deduction -shipping_fee_deduction_platform |
| ^sku_gift_net_price | string |  | Original sku list price of the gift product from the seller including tax. |
| ^sku_gift_original_price | string |  | Original sku list price of the gift product from the seller. |
| ^sku_list_price | string |  | Total MSRP price of the products. |
| ^sku_sale_price | string |  | Total promotional sale price of the products. Calculation: `sku_list_price` - `subtotal_deduction_seller` - `subtotal_deduction_platform` |
| ^subtotal | string |  | Total promotional sale price of the products including tax. Calculation: `sku_sale_price` + `subtotal_tax_amount` |
| ^subtotal_deduction_platform | string |  | Platform provided price discount on the product |
| ^subtotal_deduction_seller | string |  | Seller provided price discount on the product |
| ^subtotal_tax_amount | string |  | Total tax amount on the product |
| ^tax_amount | string |  | Total tax amount. Calculation: subtotal_tax_amount + shipping_fee_tax（in TaxDetail） + cod_fee_tax（TaxDetail） |
| ^tax_rate | string |  | Tax rate |
| ^total | string |  | Total number of the original price of the order. Calculation: `sku_list_price` + `shipping_list_price` |
| ^voucher_deduction_platform | string |  | Type of the platform-providing discount on the product. Possible values: `1010000`: PLATFORM_NEW_USER, `1020000`: SELLER_SKU_PRICE`, `1030000`: PLATFORM_FREE_SHIPPING |
| ^voucher_deduction_seller | string |  | Type of the seller-providing discount on the product. Possible values: `1010000`: PLATFORM_NEW_USER, `1020000`: SELLER_SKU_PRICE, `1030000`: PLATFORM_FREE_SHIPPING` |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetOrderDetail

Get the detailed order information of an order, including important attributes such as order status, shipping addresses, payment details, price and tax info, and package information.

**Path:** `/order/202507/orders`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/get-order-detail-202507

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| ids | array<string> | Y | A list of TikTok Shop order ID values. Max count: 50 |
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
| ^orders | array<object> |  | Order information. |
| ^^auto_combine_group_id | string |  | An identifier assigned to orders from the same customer during a LIVE session to facilitate combined order shipping when "auto-combination" is activated in Seller Center. |
| ^^buyer_avatar | string |  | The avatar of the TikTok buyer, which is defined by the TikTok user. The buyer_avatar can be used in conjunction with the buyer_nickname when displaying the unboxing results within the TikTok Live Session. |
| ^^buyer_email | string |  | The anonymized email address of the buyer. It is not recommended to send messages directly to this email address. If you need to contact the buyer, please go to Seller Center - Buyer Messages page. |
| ^^buyer_message | string |  | The note from buyer. |
| ^^buyer_nickname | string |  | The nickname of the TikTok buyer, which is defined by the TikTok user. The buyer_nickname can be used to identify the buyer when displaying the unboxing results within the TikTok Live Session. |
| ^^cancel_order_sla_time | integer |  | The automatic cancellation time for orders specified by the platform. Unix timestamp. |
| ^^cancel_reason | string |  | The order level cancellation reason. **Note**: A multi-line order may have different `cancel_reason` across the multiple items. If this occurs, the order-level `cancel_reason` will surface the `cancel_reason` from the first line item. [See here](https://partner.tiktokshop.com/docv2/page/cancel-reasons) for more details on cancellation reasons. |
| ^^cancel_time | integer |  | The timestamp of the order's status update to `CANCELLED`. |
| ^^cancellation_initiator | string |  | The initiator of a cancellation request. Possible values: - `SELLER` - `BUYER` - `SYSTEM` |
| ^^channel_entity_national_registry_id | string |  | The national channel entity registration ID  of payment institution/creditor. In Brazil, it is the CNPJ of payment instituion. |
| ^^collection_due_time | integer |  | If the order hasn't updated its status to `IN_TRANSIT` before this time, the order will be automatically canceled by TikTok Shop |
| ^^collection_time | integer |  | The timestamp of the order's status update to `IN_TRANSIT`. |
| ^^commerce_platform | string |  | The platform where the order was placed. Possible values: - TIKTOK_SHOP - TOKOPEDIA **Note**: Available only in the Indonesia market. |
| ^^consultation_id | string |  | An ID to identify the corresponding ePharmacy consultation. Applicable only if an ePharmacy consultation was initiated. Not applicable if the prescription was provided by the customer through an image upload. |
| ^^cpf | string |  | CPF (invoice number), used to issue an invoice. Exclusive for the Brazil market. |
| ^^cpf_name | string |  | Name belonging to the CPF number for the Brazil market. |
| ^^create_time | integer |  | The date and time that the order was created. Unix timestamp. |
| ^^delivery_due_time | integer |  | If the order hasn't updated its status to `DELIVERED` before this time, the order will be automatically canceled by TikTok Shop. |
| ^^delivery_option_id | string |  | Order delivery option ID. |
| ^^delivery_option_name | string |  | Delivery option name. For display purposes only. |
| ^^delivery_option_required_delivery_time | integer |  | Order should be delivered before this time. |
| ^^delivery_sla_time | integer |  | Order should arrive by this date to be considered on-time and to avoid late delivery penalties. |
| ^^delivery_time | integer |  | The timestamp of the order's status update to `DELIVERED`. |
| ^^delivery_type | string |  | Indicates whether it is a PickUp DropOff (PUDO) location. The PUDO location is selected by the buyer when placing orders. - `HOME_DELIVERY`: not a PUDO location - `COLLECTION_POINT`: a PUDO location |
| ^^exchange_source_order_id | string |  | If the order is an exchange order, this field returns the original order's order ID, from which the exchange order was generated. Returned only if is_exchange_order = true. Note: Only available in US and UK. |
| ^^fast_delivery_program | string |  | A badge presented on the merchandise to tell the buyer that the seller participates in the fast delivery program, such that the order should arrive in a promised time period. Possible values: - `3_DAY_DELIVERY` Not returned if order did not meet fast delivery program requirements. Note: Applicable only for the US market. |
| ^^fast_dispatch_sla_time | integer |  | The latest collection time to gain incentives of NDD (Next Day Delivery) project. Unix timestamp Only available in Thailand and Philippines. |
| ^^fulfillment_type | string |  | Fulfillment type. Only orders with fulfillment type can be shipped by sellers. Possible values: - `FULFILLMENT_BY_SELLER`: a method where sellers fulfill orders directly from their own inventory, without using TikTok's fulfillment centers. In this model, the seller is responsible for storing, packaging, and shipping the product to customers. - `FULFILLMENT_BY_TIKTOK`: a service offered by TikTok that enables sellers to send their products to TikTok's fulfillment centers. TikTok then takes care of storing, picking, packing, and shipping the products to customers. - `FULFILLMENT_BY_DILAYANI_TOKOPEDIA`: a method where Tokopedia GoTo Logistics provides warehousing and logistics services to sellers and charges a fee for the service. |
| ^^handling_duration | object |  | The duration for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the `order_type` is `MADE_TO_ORDER` or `BACK_ORDER`. |
| ^^^days | string |  | The number of days. |
| ^^^type | string |  | Indicates if the duration is calculated in calendar days or business days. Possible values: - `CALENDAR_DAY`: Represents consecutive days, including weekends and holidays. - `BUSINESS_DAY`: Represents business days, excluding weekends and public holidays. Default: `BUSINESS_DAY` |
| ^^has_updated_recipient_address | boolean |  | Whether the recipient address has been updated. - `false`: no update - `true`: updated |
| ^^id | string |  | A unique identifier for a TikTok Shop order. |
| ^^is_buyer_request_cancel | boolean |  | True when the buyer has a pending cancellation request |
| ^^is_cod | boolean |  | This option is for sellers that accept cash payment on delivery which is rare. Buyers will pay in cash upon receipt of package. Default value is `FALSE`. Only applicable to countries where Cash on Delivery (COD) is supported. |
| ^^is_exchange_order | boolean |  | When TRUE, this is an exchange order. Note: Only available in US and UK. |
| ^^is_on_hold_order | boolean |  | Indicates whether the order experienced or will be experienced `ON_HOLD` status. |
| ^^is_replacement_order | boolean |  | When true, this is a replacement order. |
| ^^is_sample_order | boolean |  | Use this field to determine whether the order is a sample order. |
| ^^line_items | array<object> |  | Line item info list. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. Only available in Indonesia market. |
| ^^^cancel_reason | string |  | Item cancellation reason. |
| ^^^cancel_user | string |  | The initiator of a cancellation request: - `BUYER` - `SELLER` - `OPERATOR` - `SYSTEM` |
| ^^^combined_listing_skus | array<object> |  | For a virtual bundle SKU, returns an array of related product SKUs that compose the virtual bundle SKU. |
| ^^^^product_id | string |  | The original `product_id` related to the virtual bundle SKU. |
| ^^^^seller_sku | string |  | The original `seller_sku` (which is defined by sellers) related to the virtual bundle SKU. |
| ^^^^sku_count | integer |  | The quantity of original SKU that compose the virtual bundle SKU. |
| ^^^^sku_id | string |  | The original `sku_id` related to the virtual bundle SKU. |
| ^^^currency | string |  | Currency for payment. |
| ^^^display_status | string |  | - `UNPAID`: The order is placed, but payment is not yet completed. - `AWAITING_SHIPMENT`: The order is ready for shipment, but no items are shipped yet. - `AWAITING_COLLECTION`:  The shipment is arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package is collected by the carrier and delivery is in progress. - `DELIVERED`: The package is delivered to buyer. - `COMPLETED`: The order is completed, and no further returns or refunds are allowed. - `CANCELLED`: The order is canceled. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^gift_retail_price | string |  | Retail price of the free item in orders Live giveaway, free sample and gift with purchase. For other orders, this field always returns 0. This amount can be used for free samples and live giveaway order invoice in Brazil |
| ^^^handling_duration_days | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `handling_duration` instead.] The number of business days required for the seller to process the order and hand it over to a shipping carrier after the order is placed. Applicable only if the value for `sku_type` is `MADE_TO_ORDER`. |
| ^^^id | string |  | Line item ID. |
| ^^^is_dangerous_good | boolean |  | Whether the SKU is a hazmat item. When creating the label for a hazmat item, you must follow the platform rules to put certain items into one package. Please refer to the relationship between `sku_id` and `package_id` to determine how to follow platform rules. |
| ^^^is_gift | boolean |  | Indicates whether the current order line is a gift. |
| ^^^is_unboxing_item | boolean |  | If `true`, indicates the sku is a blind box item that will need be unboxed to reveal the actual product to the buyer. The actual product sku name and picture can also be updated to TikTok after the unboxing is completed. Note: This is currently only available in the US market. |
| ^^^item_tax | array<object> |  | Item tax detail. |
| ^^^^tax_amount | string |  | Tax amount. |
| ^^^^tax_rate | string |  | Tax rate. |
| ^^^^tax_type | string |  | Tax type. - `SALES_TAX` (US market sales tax) Currently only sales tax is available. |
| ^^^needs_prescription | boolean |  | A flag to indicate whether the included product requires a prescription. |
| ^^^original_price | string |  | Item original price, please refer to the currency of `payment_info`. |
| ^^^package_id | string |  | An order can contain one or more packages based on how the seller chooses to ship. Each package has a unique `package_id` (and also a `tracking_id`, which is used to track the progress of the package as it is shipped). For local sellers in the US and UK markets, the `package_id` and `package_status` property will not be returned before the package is shipped |
| ^^^package_status | string |  | The package status of the item: - `TO_FULFILL`: package waiting seller to arrange shipment. - `PROCESSING`: package shipment has been arranged by seller. Waiting carrier to collect the parcel. - `FULFILLING`: package has been collected by carrier and in transit. - `COMPLETED`: package has been delivered. - `CANCELLED`: package has been canceled. Normally, the package is canceled due to the package being lost or damaged. |
| ^^^pfand_fee | string |  | Deposit fee that is applied to certain products, typically beverage containers such as bottles or cans. **Note** Only available in Germany market |
| ^^^platform_discount | string |  | Platform discount amount, please refer to the currency of `payment_info`. |
| ^^^product_id | string |  | Product ID. |
| ^^^product_name | string |  | Product name. |
| ^^^retail_delivery_fee | string |  | RDF (retail delivery fee). Available only in the US market. |
| ^^^rts_time | integer |  | The time seller shipped line order (call Ship Order endpoint successfully). Unix timestamp. |
| ^^^sale_price | string |  | Item sale price, please refer to the currency of `payment_info`. |
| ^^^seller_discount | string |  | Seller discount amount. Please refer to the currency of `payment_info`. |
| ^^^seller_sku | string |  | The seller stock keeping unit (SKU) of the item. |
| ^^^shipping_provider_id | string |  | The shipping provider ID of the item. |
| ^^^shipping_provider_name | string |  | The shipping provider name of the item. |
| ^^^sku_id | string |  | SKU ID. |
| ^^^sku_image | string |  | SKU image. |
| ^^^sku_name | string |  | The name of the SKU, combined by product SKU attribute like size or color. For example, "Black, 26." |
| ^^^sku_type | string |  | [**Deprecated**: This field is deprecated and will be removed in a future API version. Use `order_type` instead.] The order line type: Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY:` An item purchased during a lottery event in TikTok LIVE. - `SHOP_PARTNER`: An item purchased from a TikTok Shop partner store. **US** - `PRE_ORDER`: An item that is not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An item that is produced only after the order is received. Fulfillment starts after the product is produced. |
| ^^^small_order_fee | string |  | Small order fee for TH. |
| ^^^tracking_number | string |  | Tracking number. Available after package has been shipped. |
| ^^^unboxing_sku_code | string |  | A seller's third party sku code for the actual unboxed item, which warehouse fulfillment operations can reference to identify the accurate product they are shipping. Note: This is currently only available in the US market. |
| ^^need_upload_invoice | string |  | Whether an invoice needs to be uploaded (only for Brazil market). - `UNKNOWN` - `NEED_INVOICE` - `NO_NEED` - `INVOICE_UPLOADED` |
| ^^order_rights | array<integer> |  | Order tag identifier if has certain rights within the order based on the program subscribed by sellers. 1 = Shipping Fee Reimbursement Program 2 = Horizon+ Program Applicable for SEA market only |
| ^^order_type | string |  | The order type. Possible values based on region: **All regions** - `NORMAL`: An item that is in stock and available for immediate purchase and fulfillment. - `ZERO_LOTTERY`: An order placed during a lottery event in TikTok LIVE. **US** - `PRE_ORDER`: An advance order for items that are not yet available or released. Fulfillment starts on a specific date in the future. - `MADE_TO_ORDER`: An order for items that are produced only after the order is received. Fulfillment starts after the product is produced. - `BACK_ORDER`: An order for items that are out of stock but expected to be restocked. Fulfillment starts after the product is restocked. Returns an empty value for standard orders or other types that don't fall into the above categories. |
| ^^packages | array<object> |  | List of packages included in this order |
| ^^^id | string |  | Package ID |
| ^^paid_time | integer |  | The date and time that the order was paid. Unix timestamp. |
| ^^payment | object |  | Payment info about a TikTok Shop order. |
| ^^^buyer_service_fee | string |  | A service fee is charged on every transaction made. The charge is applied from the fifth order onwards and collected directly from customers during checkout. Only available in Indonesia market. |
| ^^^currency | string |  | Currency for payment. |
| ^^^distance_fee | string |  | Total distance fee for Horizon+ Program. Only applicable for ID market |
| ^^^distance_shipping_fee | string |  | Distance shipping fee is fee that charged charged by our logistics partner and covers the separate distance-based cost for deliveries outside Java island as a part of Horizon+ Program. Only applicable in ID Market. |
| ^^^handling_fee | string |  | A fee charged to buyers to cover the additional processing, handling, and/or installment costs associated with the chosen payment method. |
| ^^^item_insurance_fee | string |  | The cost incurred by the buyers for coverage against defects or damage to the product after purchase. **Note**: Only available in the US and Indonesia markets. |
| ^^^item_insurance_tax | string |  | The tax paid on the insurance purchased by buyers. Note: Only applicable in US market. |
| ^^^original_shipping_fee | string |  | Shipping fee before discount |
| ^^^original_total_product_price | string |  | Total original price of products (VAT included for crossborder shop). For the US market, this is pre-tax total amount. |
| ^^^payment_discount_service_fee | string |  | Service fee as paid by the buyer to apply payment platform discount |
| ^^^payment_platform_discount | string |  | Discount applied to the order funded by a payment platform |
| ^^^platform_discount | string |  | Product discount by platform. |
| ^^^product_tax | string |  | The tax on the total item price. |
| ^^^retail_delivery_fee | string |  | RDF (retail delivery fee). Available only in the US market. |
| ^^^seller_discount | string |  | Product discount by seller. |
| ^^^shipping_fee | string |  | Buyer paid shipping fee. `shipping_fee` = `original_shipping_fee` - `shipping_fee_seller_discount` - `shipping_fee_platform_discount` For the US market, this is pre-tax total amount. |
| ^^^shipping_fee_cofunded_discount | string |  | Shipping fee discount provided by seller, eligible for co-funded reimbursement upon order delivery, based on Co-Funded Free Shipping program terms. **Note**: This will be 0 for orders that did not meet minimum order value for co-funded reimbursement. In this case, refer to `shipping_fee_seller_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_platform_discount | string |  | Shipping fee discount by platform. |
| ^^^shipping_fee_seller_discount | string |  | Shipping fee discount provided by seller for an order that will not qualify for co-funded reimbursement. **Note**: If an order meets the minimum order value for co-funded reimbursement, this will be 0. In this case, refer to `shipping_fee_cofunded_discount` for the shipping discount the buyer received. |
| ^^^shipping_fee_tax | string |  | The tax on the shipping price. |
| ^^^shipping_insurance_fee | string |  | The cost incurred by the buyers for coverage against loss or damage to goods during transit. **Note**: Available only in the Indonesia market. |
| ^^^small_order_fee | string |  | Small order fee for TH. Small order fee is for Thailand only. small order fee means that the platform will set a minimum order spending amount, when the order amount is lower than the minimum order spending amount, the user needs to pay small order fee to meet the platform minimum spending amount. e.g. Minimum order spending amount is 100, order amount is 80. So the small order fee will be 20. |
| ^^^sub_total | string |  | Buyer paid subtotal of all the SKUs in the order. For the US market, this is pre-tax total amount. `sub_total` = `original_total_product_price` - `seller_discount` - `platform_discount` |
| ^^^tax | string |  | Buyer paid total taxes of the order. Applicable to crossborder shops and the US market. |
| ^^^total_amount | string |  | Buyer paid total amount. `total_amount` = `sub_total` + `shipping_fee` + `taxes` + `retail_delivery_fee` |
| ^^payment_auth_code | string |  | Authorization code of current transaction (only for the Brazilian market). For card transactions (credit/debit card), this field will be transaction authorization code. For PIX transactions, this field will be E2E ID. |
| ^^payment_card_type | string |  | Code to distinguish different payment method. Only assigned when the payment method is using bank card. Possible values are: Debit, Credit, Prepaid |
| ^^payment_method_code | string |  | Payment method code identifying current transaction. It will contains payment method and card brand if it is card transaction. |
| ^^payment_method_name | string |  | Payment method name, only for display |
| ^^pick_up_cut_off_time | integer |  | To avoid LDR, you must ensure the package is picked up by this time. Only applicable in Southeast Asia regions. |
| ^^recipient_address | object |  | `recipient_address` is not available under `UNPAID` and `ON_HOLD` status. |
| ^^^address_detail | string |  | Full buyer detail address. |
| ^^^address_line1 | string |  | The first line of the street address. |
| ^^^address_line2 | string |  | The second line of the street address |
| ^^^address_line3 | string |  | The third line of the street address. Applicable only for the BR market. |
| ^^^address_line4 | string |  | The fourth line of the street address. Applicable only for the BR market. |
| ^^^delivery_preferences | object |  | Contains all of the delivery instructions provided by the buyer for the shipping address. Currently, only available in the US market. |
| ^^^^drop_off_location | string |  | Drop-off location selected by the buyer. |
| ^^^district_info | array<object> |  | District information list. |
| ^^^^address_level | string |  | Administrative district level code. Value can be L0/L1/L2/L3/L4. eg. US is L0 |
| ^^^^address_level_name | string |  | The name of administrative division that can be used by seller for ship. e.g. state/county/city/district/town etc. |
| ^^^^address_name | string |  | Administrative area name. eg: London |
| ^^^^iso_code | string |  | ISO code of the administrative district level |
| ^^^first_name | string |  | The first name of the recipient. If the buyer does not provide their first and last name separately, this parameter will have the same value as the "name" parameter. |
| ^^^first_name_local_script | string |  | Recipient first name in katakana. **Note**: Applicable only for the JP market. |
| ^^^full_address | string |  | The complete recipient addresses information. |
| ^^^last_name | string |  | The last name of the recipient. If the buyer does not provide their first and last name separately, this parameter will be empty. |
| ^^^last_name_local_script | string |  | Recipient last name in katakana. **Note**: Applicable only for the JP market. |
| ^^^name | string |  | The name of the recipient. Please note, if this order uses platform logistics, recipient name will be desensitized |
| ^^^phone_number | string |  | The telephone number of the buyer. Please notice, if this order uses platform logistics, phone number will be desensitized. |
| ^^^post_town | string |  | Post town of the address Note: Available only in UK market |
| ^^^postal_code | string |  | The postal code that can be used by seller for shipping (in the U.S, this is the ZIP code). |
| ^^^region_code | string |  | Region code. |
| ^^release_date | integer |  | The date on which order handling starts and the status of the order changes to [`AWAITING_SHIPMENT`](https://partner.tiktokshop.com/docv2/page/650b1b4bbace3e02b76d1011). Applicable only if the `order_type` is `PRE_ORDER`. |
| ^^replaced_order_id | string |  | The order ID for the order that is being replaced. Returned only if `is_replacement_order` = `true` |
| ^^request_cancel_time | integer |  | Buyer request cancel time. |
| ^^rts_sla_time | integer |  | The latest shipping time specified by the platform. Unix timestamp. |
| ^^rts_time | integer |  | The time seller shipped the order (call Ship Order endpoint successfully). Unix timestamp. |
| ^^seller_note | string |  | This field return the note, which seller notes in TikTok Seller Center. |
| ^^shipping_due_time | integer |  | If the order hasn't updated its status to `AWAITING_COLLECTION` before this time, the order will be automatically canceled by TikTok Shop. |
| ^^shipping_provider | string |  | The name of the current shipping provider. |
| ^^shipping_provider_id | string |  | The ID of the current shipping provider. |
| ^^shipping_type | string |  | The method of delivery. - `TIKTOK`: shipping service provided by TikTok. The seller should obtain shipping label from TikTok. - `SELLER`: seller provides shipping, including through 3rd party fulfillment providers on behalf of the seller. |
| ^^split_or_combine_tag | string |  | Indicate whether the order is combined or split. - `COMBINED` - `SPLIT` This field will be used in future fulfillment apis. |
| ^^status | string |  | The order status. Possible values: - `UNPAID`: The order is placed, but payment is not yet completed. - `ON_HOLD`: The order is accepted and is waiting for fulfillment so the buyer may still cancel without the seller’s approval. If `order_type=PRE_ORDER`, it also means the product is still awaiting release so payment will only be authorized 1 day before the release, but the seller should start preparing for the release. - `AWAITING_SHIPMENT`: The order is ready for shipment, but no items are shipped yet. - `PARTIALLY_SHIPPING`: Some items in the order are shipped, but not all. - `AWAITING_COLLECTION`: The shipment is arranged, but the package is waiting to be collected by the carrier. - `IN_TRANSIT`: The package is collected by the carrier and delivery is in progress. - `DELIVERED`: The package is delivered to buyer. - `COMPLETED`: The order is completed, and no further returns or refunds are allowed. - `CANCELLED`: The order is cancelled. |
| ^^tracking_number | string |  | Tracking number. Available after ship package. |
| ^^tts_sla_time | integer |  | The latest collection time specified by the platform. Unix timestamp. |
| ^^update_time | integer |  | Time of order status changes. Unix timestamp. |
| ^^user_id | string |  | The buyer's user ID. |
| ^^warehouse_id | string |  | seller warehouse ID. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdateTheBlindBoxOpeningResults

After the merchant completes the blind box opening in the live room, then the blind box results are transmitted back to the platform, after which the user can view the unboxing results in the order details

**Path:** `/order/202511/orders/blind_box_result/callback`
**Method:** `POST`
**Version:** 202511
**Docs:** https://partner.tiktokshop.com/docv2/page/update-the-blind-box-opening-results-202511

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
| blind_box_results | array<object> |  | Unboxing results for line items under orders. |
| ^blind_open_time | integer |  | Unboxing timestamp. Only UNIX format is accepted. |
| ^blind_result_product_id | string |  | Unboxing results corresponding to TikTok Shop product id. |
| ^blind_result_sku_id | string |  | Unboxing results corresponding to TikTok Shop sku id. |
| ^order_line_id | string |  | Line item id in TikTok Shop. |
| main_order_id | string |  | The unique identifier for a TikTok Shop order. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
