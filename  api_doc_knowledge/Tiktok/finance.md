# TikTok Shop API — finance

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 9 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202309, 202501, 202504, 202507

---

## GetTransactionsbyOrder

**This API is currently exclusive to the following markets: US, UK.**
Retrieves the transactions associated with an order, including both order-level transactions and SKU-level detailed transactions. This covers all transactions related to sales, fees, commissions, shipping, taxes, adjustments, and refunds.

**Path:** `/finance/202309/orders/{order_id}/statement_transactions`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-transactionsby-order-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The order ID in TikTok Shop. |

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
| ^order_create_time | integer |  | The creation time of the order. Unix timestamp. |
| ^order_id | string |  | The order ID in TikTok Shop. |
| ^statement_transactions | array<object> |  | The list of statement transactions associated with the order. |
| ^^actual_return_shipping_fee_amount | string |  | The return shipping fee charged if the seller is responsible for the return. |
| ^^actual_shipping_fee_amount | string |  | The actual shipping fee, calculated based on the weight/dimensions measured by the carrier. |
| ^^adjustment_amount | string |  | The final adjustment amount |
| ^^affiliate_ads_commission_amount | string |  | The commission for eligible orders from ads. Formula: (product price - TikTok Shop discounts - seller discounts) * ads commission rate |
| ^^affiliate_commission_amount | string |  | The commission amount charged to the seller for payment to the creator. Formula: (product price - TikTok Shop coupons - seller coupons) * affiliate commission rate |
| ^^affiliate_commission_before_pit | string |  | The affiliate commission paid to a creator before any personal income tax withholding. |
| ^^affiliate_partner_commission_amount | string |  | The commission amount for purchases through affiliate partner links. Formula: (product price - TikTok Shop discounts - seller discounts) * affiliate partner commission rate |
| ^^after_seller_discounts_subtotal_amount | string |  | The total price of all order items after the seller's discount has been deducted. |
| ^^currency | string |  | The currency code in ISO 4217 format. |
| ^^customer_order_refund_amount | string |  | The customer refund amount deducted from the final settlement. |
| ^^customer_paid_shipping_fee_amount | string |  | The actual shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. |
| ^^customer_paid_shipping_fee_refund_amount | string |  | The amount of customer-paid shipping fees that are returned to the customer. |
| ^^customer_payment_amount | string |  | The final amount paid by the customer. Formula: after_seller_discounts_subtotal_amount + customer_shipping_fee_amount - platform_discount_amount + sales_tax_payment_amount |
| ^^customer_refund_amount | string |  | The exact amount refunded to the customer. |
| ^^customer_shipping_fee_amount | string |  | The expected shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. |
| ^^customer_shipping_fee_offset_amount | string |  | The fee to offset TikTok Shop Shipping Incentive or customer-paid shipping fee, resulting in a net charge of $0 to the seller. Applicable only for the US. |
| ^^fbm_shipping_cost_amount | string |  | The shipping fee incurred by the seller for using TikTok Shipping. |
| ^^fbt_fulfillment_fee_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). Applicable only for the US. |
| ^^fbt_fulfillment_fee_reimbursement_amount | string |  | A reimbursement from TikTok Shop for Fulfilled by TikTok (FBT) orders that don't qualify for free shipping. Applicable only for the US. |
| ^^fbt_shipping_cost_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). Applicable for all regions except the US. |
| ^^fee_amount | string |  | The fees charged by TikTok Shop at the time of order settlement. An order is deemed settled a certain number of days after delivery (varies by region) if no returns or refunds are pending. **Note**: For UK and US, shipping-related costs are excluded. |
| ^^gross_sales_amount | string |  | The total sales revenue before any seller or TikTok Shop discounts are applied. |
| ^^gross_sales_refund_amount | string |  | The sales amount refunded to customers. |
| ^^id | string |  | The transaction ID. |
| ^^isr_income_tax_amount | string |  | ISR refers to Mexican income tax that TikTok Shop is required to withhold from your earnings and remit to the tax authority. |
| ^^iva_vat_amount | string |  | IVA refers to Mexican VAT that TikTok Shop is required to withhold on your taxable products and remit to the tax authority. |
| ^^net_sales_amount | string |  | The revenue amount after seller discounts are deducted. Applicable only for local sellers in UK and US. Formula: gross_sales_amount + gross_sales_refund_amount + seller_discount_amount + seller_discount_refund_amount |
| ^^pit_amount | string |  | The creator's personal income tax withholding amount. Sellers are responsible for filing and remitting withheld taxes based on regional tax laws. |
| ^^platform_commission_amount | string |  | The commission amount charged by TikTok Shop. Applicable only for the UK. Formula: commission rate * (customer_payment_amount - customer_order_refund_amount + platform_discount_amount - platform_discount_refund_amount) |
| ^^platform_discount_amount | string |  | The discounts funded by TikTok Shop, such as coupons and campaign discounts. |
| ^^platform_discount_refund_amount | string |  | The TikTok Shop discount to be reversed (and deducted from the final settlement) if the order was refunded as a result of the seller's responsibility. |
| ^^platform_refund_subsidy_amount | string |  | The TikTok Shop subsidy to be reversed (and deducted from the final settlement) if the order was refunded as a result of the seller's responsibility. |
| ^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided for orders using TikTok Shipping. |
| ^^promo_shipping_incentive_amount | string |  | The additional shipping incentive that the seller will receive if the seller signed up for the Co-Funded Free Shipping Program from 2024/08/26 to 2024/12/31. A negative amount indicates a reversal of incentives due to order refunds attributed to the seller's responsibility. |
| ^^referral_fee_amount | string |  | The referral fee charged for processing successful orders. Applicable only for the US. |
| ^^refund_administration_fee_amount | string |  | The 20% refund administration fee deducted from the total refunded referral fee amount. |
| ^^refund_shipping_cost_discount_amount | string |  | The TikTok Shop shipping incentive to be reversed (and deducted) if the order was refunded as a result of the seller's responsibility. |
| ^^retail_delivery_fee_amount | string |  | The final retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). Formula: retail_delivery_fee_payment_amount + retail_delivery_fee_refund_amount. |
| ^^retail_delivery_fee_payment_amount | string |  | The retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). |
| ^^retail_delivery_fee_refund_amount | string |  | The retail delivery fee subsidy by TikTok Shop for losses due to returns, refunds, or other issues. |
| ^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns. |
| ^^revenue_amount | string |  | The final revenue amount at the time of order settlement. Applicable for all regions except UK and US. Formula: customer_payment_amount + platform_discount_amount + platform_discount_refund_amount + customer_order_refund_amount + shipping_fee_subsidy_amount |
| ^^sales_tax_amount | string |  | The final sales tax to be paid by the customer for the product and delivery. Applicable only for the US. Formula: sales_tax_payment_amount - sales_tax_refund_amount |
| ^^sales_tax_payment_amount | string |  | The expected sales tax to be paid by the customer. Applicable only for the US. |
| ^^sales_tax_refund_amount | string |  | The sales tax amount returned to the customer in the event of a refund. Applicable only for the US . |
| ^^seller_discount_amount | string |  | The total amount of discounts funded by the seller, including: - Seller promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) - Seller's portion of a co-funded voucher discount in co-funding campaigns - Seller discounts during a campaign |
| ^^seller_discount_refund_amount | string |  | Discounts returned to the sellers due to returns or refunds. |
| ^^settlement_amount | string |  | The final settlement amount. **For UK and US local sellers** Formula: net_sales_amount + shipping_cost_amount + fee_amount + adjustment_amount **For other regions** Formula: revenue_amount + fee_amount + adjustment_amount. |
| ^^shipping_cost_amount | string |  | The final shipping fees. Applicable only for local sellers in UK and US. Formula: fbm_shipping_cost_amount + fbt_shipping_cost_amount + signature_confirmation_fee_amount + customer_paid_shipping_fee_amount + customer_paid_shipping_fee_refund_amount + shipping_cost_discount_amount + refund_shipping_cost_discount_amount + shipping_fee_subsidy_amount + return_shipping_fee_amount + shipping_insurance_amount + customer_shipping_fee_offset_amount + fbt_fulfillment_fee_amount + promo_shipping_incentive_amount. |
| ^^shipping_cost_discount_amount | string |  | The TikTok Shop shipping incentive. |
| ^^shipping_fee_amount | string |  | The final shipping fee. Applicable for all regions except UK and US. Formula: actual_shipping_fee_amount - platform_shipping_fee_discount_amount + actual_return_shipping_fee_amount + signature_confirmation_fee_amount |
| ^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy funded by TikTok Shop for seller shipping. - Positive amount represents a subsidy received by the seller. - Negative amount represents a subsidy that the seller must return to TikTok Shop. |
| ^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance. |
| ^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmations. |
| ^^sku_statement_transactions | array<object> |  | A list of SKU transactions included in the statement. Each item in this list corresponds to a single SKU. |
| ^^^actual_return_shipping_fee_amount | string |  | The return shipping fee charged if the seller is responsible for the return. |
| ^^^actual_shipping_fee_amount | string |  | The actual shipping fee, calculated based on the weight/dimensions measured by the carrier. |
| ^^^adjustment_amount | string |  | The adjustment amount. |
| ^^^affiliate_ads_commission_amount | string |  | The commission for eligible orders from ads. Formula: (product price - TikTok Shop discounts - seller discounts) * ads commission rate |
| ^^^affiliate_commission_amount | string |  | The commission amount charged to the seller for payment to the creator. Formula: (product price - TikTok Shop coupons - seller coupons) * affiliate commission rate |
| ^^^affiliate_commission_before_pit | string |  | The affiliate commission paid to a creator before any personal income tax withholding. |
| ^^^affiliate_partner_commission_amount | string |  | The commission amount for purchases through affiliate partner links. Formula: (product price - TikTok Shop discounts - seller discounts) * affiliate partner commission rate |
| ^^^after_seller_discounts_subtotal_amount | string |  | The total price of all order items after the seller's discount has been deducted. |
| ^^^currency | string |  | The currency code in ISO 4217 format. |
| ^^^customer_order_refund_amount | string |  | The customer refund amount deducted from the final settlement. |
| ^^^customer_paid_shipping_fee_amount | string |  | The actual shipping fee borne by the customer. |
| ^^^customer_paid_shipping_fee_refund_amount | string |  | The amount of customer-paid shipping fees that are returned to the customer. |
| ^^^customer_payment_amount | string |  | The final amount paid by the customer. Formula: after_seller_discounts_subtotal_amount + customer_shipping_fee_amount - platform_discount_amount + sales_tax_payment_amount |
| ^^^customer_refund_amount | string |  | The exact amount refunded to the customer. |
| ^^^customer_shipping_fee_amount | string |  | The expected shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. |
| ^^^customer_shipping_fee_offset_amount | string |  | The fee to offset TikTok Shop Shipping Incentive or customer-paid shipping fee, resulting in a net charge of $0 to the seller. Applicable only for the US. |
| ^^^fbm_shipping_cost_amount | string |  | The shipping fee incurred by the seller for using TikTok Shipping. |
| ^^^fbt_fulfillment_fee_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). Applicable only for the US. |
| ^^^fbt_shipping_cost_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). Applicable for all regions except the US. |
| ^^^fee_amount | string |  | The fees charged by TikTok Shop at the time of order settlement. An order is deemed settled a certain number of days after delivery (varies by region) if no returns or refunds are pending. **Note**: For UK and US, shipping-related costs are excluded. |
| ^^^gross_sales_amount | string |  | The total sales revenue before any seller or TikTok Shop discounts are applied. |
| ^^^gross_sales_refund_amount | string |  | The sales amount refunded to customers. |
| ^^^isr_income_tax_amount | string |  | ISR refers to Mexican income tax that TikTok Shop is required to withhold from your earnings and remit to the tax authority. |
| ^^^iva_vat_amount | string |  | IVA refers to Mexican VAT that TikTok Shop is required to withhold on your taxable products and remit to the tax authority. |
| ^^^net_sales_amount | string |  | The revenue amount after seller discounts are deducted. Applicable only for local sellers in UK and US. Formula: gross_sales_amount + gross_sales_refund_amount + seller_discount_amount + seller_discount_refund_amount |
| ^^^pit_amount | string |  | The creator's personal income tax withholding amount. Sellers are responsible for filing and remitting withheld taxes based on regional tax laws. |
| ^^^platform_commission_amount | string |  | The commission amount charged by TikTok Shop. Applicable only for the UK. Formula: commission rate * (customer_payment_amount - customer_order_refund_amount + platform_discount_amount - platform_discount_refund_amount) |
| ^^^platform_discount_amount | string |  | The discounts funded by TikTok Shop, such as coupons and campaign discounts. |
| ^^^platform_discount_refund_amount | string |  | The platform discount to be reversed (and deducted from the final settlement) if the order was refunded as a result of the seller's responsibility. |
| ^^^platform_refund_subsidy_amount | string |  | The TikTok Shop subsidy to be reversed (and deducted from the final settlement) if the order was refunded as a result of the seller's responsibility. |
| ^^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided for orders using TikTok Shipping. |
| ^^^product_name | string |  | The product name. |
| ^^^promo_shipping_incentive_amount | string |  | The additional shipping incentive that the seller will receive if the seller signed up for the Co-Funded Free Shipping Program from 2024/08/26 to 2024/12/31. A negative amount indicates a reversal of incentives due to order refunds attributed to the seller's responsibility. |
| ^^^quantity | integer |  | The SKU quantity. |
| ^^^referral_fee_amount | string |  | The referral fee charged for processing successful orders. Applicable only for the US. |
| ^^^refund_administration_fee_amount | string |  | The 20% refund administration fee deducted from the total refunded referral fee amount. |
| ^^^refund_shipping_cost_discount_amount | string |  | The TikTok Shop shipping incentive to be reversed (and deducted) if the order was refunded as a result of the seller's responsibility. |
| ^^^retail_delivery_fee_amount | string |  | The final retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). Formula: retail_delivery_fee_payment_amount + retail_delivery_fee_refund_amount. |
| ^^^retail_delivery_fee_payment_amount | string |  | The retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). |
| ^^^retail_delivery_fee_refund_amount | string |  | The retail delivery fee subsidy by TikTok Shop for losses due to returns, refunds, or other issues. |
| ^^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns. |
| ^^^revenue_amount | string |  | The revenue amount for the transaction. Applicable for all regions except UK and US. Formula: customer_payment_amount + platform_discount_amount + platform_discount_refund_amount + customer_order_refund_amount + shipping_fee_subsidy_amount |
| ^^^sales_tax_amount | string |  | The final sales tax collected from the customer for the product and delivery. Applicable only for the US. Formula: sales_tax_payment_amount - sales_tax_refund_amount |
| ^^^sales_tax_payment_amount | string |  | The expected sales tax to be paid by the customer. Applicable only for the US. |
| ^^^sales_tax_refund_amount | string |  | The sales tax amount returned to the customer in the event of a refund. Applicable only for the US. |
| ^^^seller_discount_amount | string |  | The total amount of discounts funded by the seller, including: - Seller promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) - Seller's portion of a co-funded voucher discount in co-funding campaigns - Seller discounts during a campaign |
| ^^^seller_discount_refund_amount | string |  | The discounts returned to the sellers due to returns or refunds. |
| ^^^settlement_amount | string |  | The final settlement amount for the transaction. **For UK and US local sellers** Formula: net_sales_amount + shipping_cost_amount + fee_amount + adjustment_amount **For other regions** Formula: revenue_amount + fee_amount + adjustment_amount. |
| ^^^shipping_cost_amount | string |  | The final shipping fees. Applicable only for local sellers in UK and US. Formula: fbm_shipping_cost_amount + fbt_shipping_cost_amount + signature_confirmation_fee_amount + customer_paid_shipping_fee_amount + customer_paid_shipping_fee_refund_amount + shipping_cost_discount_amount + refund_shipping_cost_discount_amount + shipping_fee_subsidy_amount + return_shipping_fee_amount + shipping_insurance_amount + customer_shipping_fee_offset_amount + fbt_fulfillment_fee_amount + promo_shipping_incentive_amount. |
| ^^^shipping_cost_discount_amount | string |  | The TikTok Shop shipping incentive. |
| ^^^shipping_fee_amount | string |  | The final shipping fee. Applicable for all regions except UK and US. Formula: actual_shipping_fee_amount - platform_shipping_fee_discount_amount + actual_return_shipping_fee_amount + signature_confirmation_fee_amount |
| ^^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy funded by TikTok Shop for seller shipping. - Positive amount represents a subsidy received by the seller. - Negative amount represents a subsidy that the seller must return to TikTok Shop. |
| ^^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance. |
| ^^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmations. |
| ^^^sku_id | string |  | The SKU ID associated with the transaction. |
| ^^^sku_name | string |  | The SKU name. |
| ^^^transaction_fee_amount | string |  | The transaction fee charged for processing successful orders. Non-refundable. Applicable only for the US. |
| ^^statement_id | string |  | The statement ID. |
| ^^statement_time | integer |  | The creation time of the statement. Unix timestamp. |
| ^^status | string |  | The status of the transaction. Only supports `SETTLED`. |
| ^^transaction_fee_amount | string |  | The transaction fee charged for processing successful orders. Non-refundable. Applicable only for the US. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPayments

**This API is currently unavailable to SEA markets.**
Retrieves records of automated payments for a shop based on a specified date range.
Use the returned list to verify and reconcile payments with the transactions in the seller's bank account.

**Path:** `/finance/202309/payments`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-payments-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_lt | integer |  | Filter payments to show only those that occurred before the specified date and time. Unix timestamp. Refer to notes in `create_time_ge` for more usage information. |
| page_size | integer |  | The number of results to be returned per page. Default: 20 Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| sort_field | string | Y | The returned results will be sorted by the specified field. Only supports `create_time`. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| create_time_ge | integer |  | Filter payments to show only those that occurred on or after the specified date and time. Unix timestamp. **Note:** `create_time_ge` and `create_time_lt` together constitute the creation time filter condition. - If `create_time_ge` is filled but `create_time_lt` is empty, `create_time_lt` will default to the current time. - If `create_time_lt` is filled but `create_time_ge` is empty, `create_time_ge` will default to the earliest shop time. |
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
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^payments | array<object> |  | The list of payments that meet the query conditions. |
| ^^amount | object |  | The final payment amount after currency exchange. |
| ^^^currency | string |  | The exchange currency code in ISO 4217 format. |
| ^^^value | string |  | The final payment amount. |
| ^^bank_account | string |  | The seller's bank account number masked, revealing only the last 4 digits for privacy. |
| ^^create_time | integer |  | The time when the payment was initiated in TikTok Shop. Unix timestamp. |
| ^^exchange_rate | string |  | The exchange rate, displayed with six decimal places. |
| ^^id | string |  | The payment ID. |
| ^^paid_time | integer |  | The time when the payment was successfully processed. Unix timestamp. |
| ^^payment_amount_before_exchange | object |  | The original payment amount before currency exchange. |
| ^^^currency | string |  | The original currency code in ISO 4217 format. |
| ^^^value | string |  | The original payment amount. |
| ^^reserve_amount | object |  | The reserved amount before currency exchange. |
| ^^^currency | string |  | The original currency code in ISO 4217 format. |
| ^^^value | string |  | The reserved amount. |
| ^^settlement_amount | object |  | The settlement amount before currency exchange. |
| ^^^currency | string |  | The original currency code in ISO 4217 format. |
| ^^^value | string |  | The settlement amount. |
| ^^status | string |  | The payment status, indicating whether payment has been transferred to the seller's bank account. Possible values: - PAID: Payment has been transferred to the seller. - FAILED: Payment transfer failed. - PROCESSING: Payment is currently being processed. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetStatements

Retrieves the statements generated for a shop and the key statement information based on a specified date range or their payment status. Use this API to get an overview of your daily statements over a range of time, or to find out which statements have been paid or not. For the detailed transactions, refer to [Get Statement Transactions](650a6749defece02be67da87) or [Get Order Statement Transactions](650a6734defece02be67d724).
Applicable for all regions' sellers. Only data after 2023-07-01 is available.

**Path:** `/finance/202309/statements`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-statements-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| statement_time_lt | integer |  | Filter statements to show only those that are generated before the specified date and time. Unix timestamp. Refer to notes in `statement_time_ge` for more usage information. |
| payment_status | string |  | Filter statements based on the payment status. Possible values: - PAID: Payment has been transferred to the seller. - FAILED: Payment transfer failed. - PROCESSING: Payment is currently being processed. Default: All statuses are returned. |
| page_size | integer |  | The number of results to be returned per page. Default: 20 Valid range: [1-100] |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| sort_field | string | Y | The returned results will be sorted by the specified field. Only supports `statement_time`. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| statement_time_ge | integer |  | Filter statements to show only those that are generated on or after the specified date and time. Unix timestamp. **Note:** `statement_time_ge` and `statement_time_le` together constitute the creation time filter condition. - If `statement_time_ge` is filled but `statement_time_lt` is empty, `statement_time_lt` will default to the current time. - If `statement_time_lt` is filled but `statement_time_ge` is empty, `statement_time_ge` will default to the earliest shop time. **Example:** As statements are generated daily at 00:00 UTC, to retrieve statements for the period from Oct 5 to Oct 10, configure the parameters as follows: - Set `statement_time_ge` to 00:00 on Oct 6  or any time on Oct 5 (excluding 00:00). - Set `statement_time_lt` to any time on Oct 11 (excluding 00:00). |
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
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^statements | array<object> |  | The list of statements that meet the query conditions. |
| ^^adjustment_amount | string |  | The adjustment amount. For more details about the reason for adjustment, refer to the [Get Statement Transactions API](https://partner.tiktokshop.com/docv2/page/650a6749defece02be67da87). |
| ^^currency | string |  | The currency code in ISO 4217 format. |
| ^^fee_amount | string |  | The fees charged by TikTok Shop at the time of order settlement. An order is deemed settled a certain number of days after delivery (varies by region) if no returns or refunds are pending. **Note**: Shipping-related costs are excluded, except for local sellers in the SEA region, where they are included. |
| ^^id | string |  | The statement ID. |
| ^^net_sales_amount | string |  | The final revenue amount after seller discounts are deducted. Applicable only for local sellers outside the SEA region. |
| ^^payment_id | string |  | The payment ID. |
| ^^payment_status | string |  | The payment status, indicating whether payment has been transferred to the seller's bank account. Possible values: - PAID: Payment has been transferred to the seller. - FAILED: Payment transfer failed. - PROCESSING: Payment is currently being processed. |
| ^^payment_time | integer |  | The Unix payment timestamp |
| ^^revenue_amount | string |  | The final revenue amount at the time of order settlement. Applicable for all regions except UK and US. |
| ^^settlement_amount | string |  | The settlement amount. |
| ^^shipping_cost_amount | string |  | The shipping fees. Applicable only for local sellers outside the SEA region. |
| ^^statement_time | integer |  | The time when the statement was generated. Unix timestamp. Statements are generated daily at 00:00 UTC, and it includes all transactions from the past day. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTransactionsbyStatement

Only for UK and US local sellers. Get a list of transactions based on statement_id. We will return a list of orders. If you require the SKU level transaction details, pass in the order_id to Get Order Statement Transactions.

**Path:** `/finance/202309/statements/{statement_id}/statement_transactions`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-transactionsby-statement-202309

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| statement_id | string | Y | The unique id of statement |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | The default is empty string |
| sort_field | string | Y | Only support: order_create_time |
| sort_order | string |  | The default is ASC, the developer can choose ASC or DESC |
| page_size | integer |  | The default is 20. It must be a positive integer,the range is 1-100 |
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
| ^adjustment_amount | string |  | The total amount calculated by the platform when the order fees need to be changed, the specific adjustment type will be shown in fields type |
| ^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^fee_amount | string |  | The fees calculated by the platform when the order meets the settlement rules (the order is settled 3 to 15 days after it is delivered with no return/refund ongoing). For UK and US Local Sellers, this amount already excludes shipping related costs. |
| ^net_sales_amount | string |  | Used for US, UK L2L sellers only. The total revenue with any applicable seller discounts deducted. net_sales_amount = gross_sales_amount + gross_sales_refund_amount + seller_discount_amount + seller_discount_refund_amount |
| ^next_page_token | string |  | Cursor used for searching for more information |
| ^revenue_amount | string |  | The total earnings calculated by the platform at the time the order was paid |
| ^settlement_amount | string |  | The total settlement amount of the statement settlement_amount = revenue_amount + fee_amount + adjustment_amount For UK and US Local Sellers: settlement_amount=net_sales_amount+shipping_cost_amount+fee_amount + adjustment_amount |
| ^shipping_cost_amount | string |  | Only for UK and US Local Sellers, represents the total fees related to shipping. Equates to fbm_shipping_cost_amount + fbt_shipping_cost_amount + signature_confirmation_fee_amount + customer_paid_shipping_fee_amount + customer_paid_shipping_fee_refund_amount + shipping_cost_discount_amount + refund_shipping_cost_discount_amount + shipping_fee_subsidy_amount + return_shipping_fee_amount + shipping_insurance_amount + customer_shipping_fee_offset_amount + fbt_fulfillment_fee_amount + promo_shipping_incentive_amount |
| ^statement_id | string |  | The unique ID of statement |
| ^statement_time | integer |  | Time of statement in UTC time zone |
| ^statement_transactions | array<object> |  | Statement list |
| ^^actual_return_shipping_fee_amount | string |  | If the seller is responsible for the return, the return shipping fee will be charged. |
| ^^actual_shipping_fee_amount | string |  | The actual shipping fee calculated based on the weight/dimensions measured by the carrier |
| ^^adjustment_amount | string |  | The adjustment amount calculated by the platform when the order fees need to be changed, the specific adjustment type will be shown in fields type |
| ^^adjustment_id | string |  | The unique ID of the adjustment transaction，One of Order ID and Adjustment ID must not be 0 |
| ^^adjustment_order_id | string |  | Orders related to adjustments, if any. |
| ^^affiliate_ads_commission_amount | string |  | The price the customer actually paid for the product (for eligible orders that come from ads) multiplied by the commission percentage. |
| ^^affiliate_commission_amount | string |  | The price the customer actually paid for the product (product sale price minus any platform coupons and merchant coupons) multiplied by the commission percentage. |
| ^^affiliate_commission_before_pit | string |  | The commission paid to a creator before any personal income tax withholding. |
| ^^affiliate_partner_commission_amount | string |  | The amount the customer paid for the product (product price minus platform and seller discounts) via affiliate partner's links multiplied by the affiliate partner commission rate. |
| ^^after_seller_discounts_subtotal_amount | string |  | The price of all order items after the seller's discount is deducted |
| ^^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^^customer_order_refund_amount | string |  | The refunded amount deducted from the final settlement |
| ^^customer_paid_shipping_fee_amount | string |  | The shipping fee incurred by the customer is determined by the product weight uploaded. |
| ^^customer_paid_shipping_fee_refund_amount | string |  | The refunded amount of customer-paid shipping fees deducted from the seller's account. |
| ^^customer_payment_amount | string |  | The total amount paid by the customer, customer_payment = after_seller_discounts_subtotal_amount+customer_shipping_fee_amount-platform_discount_amount+sales_tax_payment_amount |
| ^^customer_refund_amount | string |  | The exact amount refunded to the customer |
| ^^customer_shipping_fee_amount | string |  | The expected shipping fee borne by the buyer calculated based on the weight of the product uploaded by the seller |
| ^^customer_shipping_fee_offset_amount | string |  | This billing item is currently applicable to US sellers only. Although included on FBT invoices, it will not lead to any net charges for sellers. Any shipping fees paid by the customer or the platform will be debited and forwarded to TikTok Shop. |
| ^^fbm_shipping_cost_amount | string |  | Full name is TikTok Shop shipping fee.The shipping fee incurred by the seller for using TikTok shipping. |
| ^^fbt_fulfillment_fee_amount | string |  | The shipping fee incurred by sellers for orders fulfilled by TikTok. |
| ^^fbt_fulfillment_fee_reimbursement_amount | string |  | A reimbursement from TikTok Shop for Fulfilled by TikTok (FBT) orders that don't qualify for free shipping. Applicable only for the US. |
| ^^fbt_shipping_cost_amount | string |  | Full name is Fulfilled by TikTok Shop (FBT) shipping fee.The shipping fee incurred by the seller for orders fulfilled by TikTok. |
| ^^fee_amount | string |  | The fees calculated by platform when the order meet the settlement rules (the order is deemed to settle X days after it is delivered with no return/refund ongoing) |
| ^^gross_sales_amount | string |  | The total revenue before any discounts from the seller or TikTok Shop have been taken into account. |
| ^^gross_sales_refund_amount | string |  | The amount of gross sales refunded to customers. |
| ^^id | string |  | The transaction Unique key，you can use this field to determine whether it is repeated. |
| ^^isr_income_tax_amount | string |  | ISR refers to Mexican income tax that TikTok Shop is required to withhold from your earnings and remit to the tax authority. |
| ^^iva_vat_amount | string |  | IVA refers to Mexican VAT that TikTok Shop is required to withhold on your taxable products and remit to the tax authority. |
| ^^net_sales_amount | string |  | Used for US, UK L2L sellers only. The total revenue with any applicable seller discounts deducted. net_sales_amount = gross_sales_amount + gross_sales_refund_amount + seller_discount_amount + seller_discount_refund_amount |
| ^^order_create_time | integer |  | The create time of the order |
| ^^order_id | string |  | The unique ID of the order，One of Order ID and Adjustment ID must not be 0 |
| ^^pit_amount | string |  | The creator's personal income tax withholding amount. Sellers are required to handle the filing and remittance of withheld taxes based on their region's tax regulations. |
| ^^platform_commission_amount | string |  | Only for UK. Rate * (customer_payment_amount - customer_order_refund_amount + platform_discount_amount - platform_discount_refund_amount) |
| ^^platform_discount_amount | string |  | This category represents promotions paid for by platform, such as coupons and other campaign discounts organised by platform |
| ^^platform_discount_refund_amount | string |  | If a refund happens, the platform discount that was applied will be regarded as invalid and deducted from the final settlement |
| ^^platform_refund_subsidy_amount | string |  | The refunded amount subsidized by the platform |
| ^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided in accordance with a campaign policy |
| ^^promo_shipping_incentive_amount | string |  | From Aug 26, 2024 to Dec 31, 2024, TikTok shop will provide additional logistics incentives for sellers that have registered for the co-funded free shipping program. Negative amounts mean a clawback of the incentives given. |
| ^^referral_fee_amount | string |  | Only for US. The referral fee is an amount charged for processing successful orders in TikTok Shop. (For orders placed before April 3, 2023, 0:00 AM UTC-04:00, New York Time)$0.3 + rate %* (Customer payment amount + Platform discount amount - (Customer order refund amount + Platform discount refund amount)) |
| ^^refund_administration_fee_amount | string |  | Refunds or returns will incur a 20% refund administration fee deduction from the total refunded referral fee amount |
| ^^refund_shipping_cost_discount_amount | string |  | Also named TikTok Shop shipping incentive refund.The shipping fee incentive amount deducted from the seller's account for refunded orders due to a seller fault. |
| ^^retail_delivery_fee_amount | string |  | retail_delivery_fee_amount = retail_delivery_fee_payment_amount+retail_delivery_fee_refund_amount |
| ^^retail_delivery_fee_payment_amount | string |  | The retail delivery fee is collected and remitted by the TikTok Shop. It applies to all deliveries by motor vehicle to a location in Colorado with at least one item of tangible personal property that is subject to state sales or use tax. |
| ^^retail_delivery_fee_refund_amount | string |  | Subsidy paid by TikTok Shop for losses due to return or refund request rules or other issues |
| ^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns。 |
| ^^revenue_amount | string |  | Total revenue amount, revenue_amont = customer_payment_amount+platform_discount_amount+platform_discount_refund_amount+customer_order_refund_amount+shipping_fee_subsidy_amount |
| ^^sales_tax_amount | string |  | Only for US. The final sales tax collected from the buyer for the product and delivery. sales_tax_amount = sales_tax_refund_amount-sales_tax_payment_amount |
| ^^sales_tax_payment_amount | string |  | Only for US. The sales tax collected from the buyer for the product and delivery. |
| ^^sales_tax_refund_amount | string |  | Only for US. If the purchase is refunded, the sales tax that was applied will be returned to the buyer. |
| ^^seller_discount_amount | string |  | Seller discounts are the total amount of discounts funded by the seller. These include: i) Discounts funded by the seller through the seller's promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) ii) Seller's portion of a co-funded voucher discount during the seller's participation in co-funding campaigns iii) Discounts funded by the seller during a campaign |
| ^^seller_discount_refund_amount | string |  | Discounts refunded to the seller. |
| ^^settlement_amount | string |  | The total settlement amount of the order |
| ^^shipping_cost_amount | string |  | Only for UK and US Local Sellers, represent the total fees related to shipping. Equates to fbm_shipping_cost_amount + fbt_shipping_cost_amount + signature_confirmation_fee_amount + customer_paid_shipping_fee_amount + customer_paid_shipping_fee_refund_amount + shipping_cost_discount_amount + refund_shipping_cost_discount_amount + shipping_fee_subsidy_amount + return_shipping_fee_amount + shipping_insurance_amount + customer_shipping_fee_offset_amount + fbt_fulfillment_fee_amount + promo_shipping_incentive_amount |
| ^^shipping_cost_discount_amount | string |  | Also named TikTok Shop shipping incentive.The shipping fee incentive provided by TikTok Shop. |
| ^^shipping_fee_amount | string |  | shipping_fee_amount = actual_shipping_fee_amount - platform_shipping_fee_discount_amount + acutal_return_shipping_fee_amount + signature_confirmation_fee_amount |
| ^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy provided by TikTok Shop for orders fulfilled by the seller themselves。 |
| ^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance services. |
| ^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmation services. |
| ^^transaction_fee_amount | string |  | Only for US. Transaction Fee is a service fee charged for processing successful orders in TikTok Shop. Transaction Fee is a non-refundable fee, and is charged at 0.3 USD plus a percentage of the customer paid price per transaction. (For orders placed before April 3, 2023, 0:00 AM UTC-04:00, New York Time)$0.3 + rate %* Customer payment amount |
| ^^type | string |  | If the transaction is a regular order, we will return ORDER. If the transaction is an adjustment, we will return the adjustment type. Adjustment type possible values: - SHIPPING_FEE_ADJUSTMENT：Adjustment when there are differences or mistakes with the shipping fee paid by the seller. - SHIPPING_FEE_COMPENSATION：Compensation given to sellers due to differences between the actual shipping fee and the pre-paid shipping fee. - CHARGE_BACK：The charge returned to a payment card after a customer has successfully disputed an item on their account statement or transactions report. - CUSTOMER_SERVICE_COMPENSATION：This is extra compensation or compensation paid to a customer after the after-sales period by customer service. - PROMOTION_ADJUSTMENT：Adjustment when a seller takes part in a platform promotion and there are differences between the promotion price and the actual amount paid by the seller. - PLATFORM_COMPENSATION：Compensation paid to the seller as a result of the seller successfully appealing customer dispute. - PLATFORM_PENALTY：After identifying a violation of platform policies, we have deducted the corresponding penalty amount from the seller's account in accordance with our policies. Please see the email notification that was sent to you. - SAMPLE_SHIPPING_FEE：Fees are charged for sending samples using the platform logistics provider. - LOGISTICS_REIMBURSEMENT: Reimbursement paid by TikTok Shop for losses due to logistics-related issues - PLATFORM_REIMBURSEMENT - Platform refund without return: Order has been processed using the TikTok refund without return policy. Since the reason for this refund is not the responsibility of seller, TikTok has borne the refund amount to the customer. - DEDUCTIONS_INCURRED_BY_SELLER -When a customer is unhappy with their experience due to an issue that is the seller's responsibility, or Order was found to meet the definition of fraud, and to either have one of the following issues, or other similar issues: empty package sent to customer, items sent not matching those on the product display page, items sent of lower value than advertised. The seller is responsible for costs related to this issue. - SHIPPING_FEE_REBATE：The shipping fee rebate given to the seller as part of their participation in a platform campaign. - PLATFORM_COMMISSION_ADJUSTMENT：Adjustment when there are differences in the platform commission paid by the seller. - PLATFORM_COMMISSION_COMPENSATION：Compensation paid to the seller when there are differences in the platform commission paid by the seller. - OTHER_ADJUSTMENT：Adjustments for other reasons. - FBT_WAREHOUSE_SERVICE_FEE: The amount charged by TikTok Fulfillment Portal (Pipak) for warehousing-related bills incurred by the seller under the Fulfilled by TikTok (FBT) service. - GMV_PAYMENT_FOR_ADS: The amount used to pay for your advertisement if you open 'pay ads with shop GMV' or pay for TikTok Promote ads orders. - REBATE:  A discount on referral fees offered by TikTok Shop to eligible sellers. |
| ^total_count | integer |  | The number of transaction records |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetWithdrawals

Get the list of the withdrawal records (when Seller's withdraw money from TikTokShop) based on the specified date range.

**Path:** `/finance/202309/withdrawals`
**Method:** `GET`
**Version:** 202309
**Docs:** https://partner.tiktokshop.com/docv2/page/get-withdrawals-202309

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| create_time_lt | integer |  | Unix timestamp representing the end of transactions time range one wants to request |
| types | array<string> | Y | The type of transaction. Possible values: - WITHDRAW：The action of the seller to receive the settlement amount to the bank card through the action of withdrawal - SETTLE：The platform settles the amount to the seller - TRANSFER：Platform subsidies or deductions due to platform policies - REVERSE：Withdrawal failure due to incorrect bank card |
| page_size | integer |  | The default is 20, it must be positive integer,the range is 1-100 |
| page_token | string |  | The next page token |
| create_time_ge | integer |  | Unix timestamp representing the start of transactions time range one wants to request |
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
| ^next_page_token | string |  | Cursor used for searching for more information |
| ^total_count | integer |  | The total num of the withdraws |
| ^withdrawals | array<object> |  | Withdraw list |
| ^^amount | string |  | Withdraw amount |
| ^^create_time | integer |  | Withdraw create time |
| ^^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^^id | string |  | A unique transaction id generated by TTS for the withdrawal. |
| ^^status | string |  | The processing status of the withdrawal indicates whether the withdrawal is transferred. Possible values: - PROCESSING：the withdrawal is currently processing. If the withdrawal is successful, the status will transition to PAID. If not, it will be FAILED. - SUCCESS：the withdrawal has been transferred to the Seller - FAILED：the withdrawal failed |
| ^^type | string |  | WITHDRAW：The action of the seller to receive the settlement amount to the bank card through the action of withdrawal SETTLE：The platform settles the amount to the seller TRANSFER：Platform subsidies or deductions due to platform policies REVERSE：Withdrawal failure due to incorrect bank card |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTransactionsbyOrder

Retrieves the SKU-level details of an order transaction. This covers transactions related to sales, fees, commissions, shipping, taxes, and refunds.
Applicable for all regions' sellers. Only data after 2023-07-01 is available (Please note that for US cross-border sellers, data before 2025-04-30 is unavailable).

**Path:** `/finance/202501/orders/{order_id}/statement_transactions`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-transactionsby-order-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | The order ID in TikTok Shop. |

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
| ^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^fee_and_tax_amount | string |  | The fees and taxes charged by the platform for the order at the time of order settlement. Shipping-related costs are excluded. |
| ^order_create_time | integer |  | The creation time of the order. Unix timestamp. |
| ^order_id | string |  | The order ID in TikTok Shop. |
| ^revenue_amount | string |  | The revenue amount for the order at the time of order settlement. This is equivalent to the net sales amount. |
| ^settlement_amount | string |  | The settlement amount for the order. Formula: revenue_amount - shipping_cost_amount - fee_tax_amount |
| ^shipping_cost_amount | string |  | The shipping costs for the order at the time of order settlement. |
| ^sku_transactions | array<object> |  | The list of SKU transaction records for the order. |
| ^^fee_tax_amount | string |  | The total fees and taxes charged by TikTok Shop at the time of order settlement. Shipping-related costs are excluded. This is equivalent to the sum of all contributory amounts in `fee_tax_breakdown`. |
| ^^fee_tax_breakdown | object |  | The list of amounts that directly contribute to `fee_tax_amount`. |
| ^^^fee | object |  | The list of fees. |
| ^^^^affiliate_ads_commission_amount | string |  | The commission for eligible orders from ads. |
| ^^^^affiliate_commission_amount | string |  | The commission amount charged to the seller for payment to the creator. |
| ^^^^affiliate_commission_amount_before_pit | string |  | The affiliate ads commission paid to a creator before any personal income tax withholding. Applicable only for SEA markets. |
| ^^^^affiliate_commission_deposit | string |  | The amount reserved for creator commissions after an order is paid. Applies only to commissions tied to order volume and is based on the highest earning rate. |
| ^^^^affiliate_commission_release | string |  | The commission deposit refunded to you after order settlement. Applies only to commissions tied to order volume. |
| ^^^^affiliate_partner_commission_amount | string |  | The commission amount for purchases through affiliate partner links. |
| ^^^^bonus_cashback_service_fee_amount | string |  | The service fee charged for participation in the bonus cashback program. |
| ^^^^campaign_resource_fee | string |  | Amount of campaign resource fee from program seller joining in |
| ^^^^cofunded_creator_bonus_amount | string |  | The portion of the creator bonus that you co-fund as part of the commission boost campaign. |
| ^^^^cofunded_promotion_service_fee_amount | string |  | The service fee charged for co-funded promotions. |
| ^^^^credit_card_handling_fee_amount | string |  | The handling fee charged when the buyer pays with a credit card. |
| ^^^^dt_handling_fee_amount | string |  | The handling fee charged for orders that are fulfilled by Dilayani Tokopedia. |
| ^^^^dynamic_commission_amount | string |  | The dynamic commission fee is the amount that the platform charges to all sellers for every successfully delivered order. Applicable only for Indonesia. |
| ^^^^epr_pob_service_fee_amount | string |  | The eco-contributions TikTok Shop pays on your behalf to the qualified producer responsibility organization (PRO). |
| ^^^^external_affiliate_marketing_fee_amount | string |  | The service fee for participating in the External Affiliate Marketing Solution Program, as stated during registration. |
| ^^^^fee_per_item_sold_amount | string |  | The fee charged to sellers by the platform for each item sold. Applicable only for the Brazil market. |
| ^^^^flash_sales_service_fee_amount | string |  | The service fee charged for participation in flash sales. |
| ^^^^installation_service_fee | string |  | The fee TikTok Shop charges you for using platform installation service |
| ^^^^live_specials_fee_amount | string |  | The service fee charged for participation in the [LIVE Specials Programme]. |
| ^^^^mall_service_fee_amount | string |  | The service fee charged for using TikTok Shop Mall. |
| ^^^^platform_commission_amount | string |  | The commission amount charged by TikTok Shop. |
| ^^^^pre_order_service_fee_amount | string |  | The service fee charged when seller joins Pre-order program. |
| ^^^^referral_fee_amount | string |  | The referral fee charged for processing successful orders. Applicable only for the US. |
| ^^^^refund_administration_fee_amount | string |  | The 20% refund administration fee deducted from the total refunded referral fee amount. |
| ^^^^seller_paylater_handling_fee_amount | string |  | The handling fee charged to the seller for participation in the PayLater program. |
| ^^^^sfp_service_fee_amount | string |  | The service fee charged for participation in the [Seller Free Shipping Programme]. |
| ^^^^shipping_fee_guarantee_service_fee | string |  | A flat service fee charged for each order under the Shipping Fee Guarantee Program |
| ^^^^tap_shop_ads_commission | string |  | The advertising commission cost a merchant pays to TikTok Shop Affiliate Partner (TAP). |
| ^^^^transaction_fee_amount | string |  | The transaction fee charged for processing successful orders. |
| ^^^^tsp_commission_amount | string |  | The commission amount charged by TikTok Shop Partners (TSP). |
| ^^^^vn_fix_infrastructure_fee | string |  | Infrastructure fees are a fixed service fee that TikTok Shop charges for providing, maintaining, and developing infrastructure for delivery services. It applies to delivered orders on the main order level. |
| ^^^^voucher_xtra_service_fee_amount | string |  | The service fee charged for participation in the Voucher Xtra program. |
| ^^^tax | object |  | The list of tax amounts. |
| ^^^^anti_dumping_duty_amount | string |  | The anti-dumping duties collected by governments for import goods. |
| ^^^^customs_clearance_amount | string |  | The fees charged by logistic suppliers for customs clearance services. Applicable only for cross-border shop orders. |
| ^^^^customs_duty_amount | string |  | The customs duties, a type of tax on cross-border goods collected by governments. Applicable only for cross-border shop orders. |
| ^^^^gst_amount | string |  | The goods and services tax (GST) collected and remitted to the tax authority by the platform for low-value goods imported into Singapore, effective January 1, 2023. |
| ^^^^import_vat_amount | string |  | The import VAT, a tax paid on goods bought in one country and imported into another. Applicable only for cross-border shop orders. In Japan, it refers to the Japan Consumption Tax (JCT). |
| ^^^^isr_amount | string |  | The Mexican federal income tax that TikTok Shop is required to withhold. |
| ^^^^iva_amount | string |  | The Mexican VAT that TikTok Shop is required to withhold on your taxable products and remit to the tax authority. |
| ^^^^local_vat_amount | string |  | The VAT paid by the platform on the seller's behalf. Applicable only for local shop orders. |
| ^^^^pit_amount | string |  | The personal income tax (PIT) paid by the platform on the seller's behalf. |
| ^^^^sst_amount | string |  | The sales and service tax (SST) collected and remitted to the tax authority by the platform for low-value goods imported into Malaysia, effective January 1, 2024. |
| ^^^^vat_amount | string |  | The VAT paid by the platform on the seller's behalf. Applicable only for cross-border shop orders. |
| ^^product_name | string |  | The product title. |
| ^^quantity | string |  | The SKU quantity included in the order settlement. |
| ^^revenue_amount | string |  | The revenue amount at the time of order settlement. This is equivalent to the sum of all amounts in `revenue_breakdown`. |
| ^^revenue_breakdown | object |  | The list of amounts that directly contribute to `revenue_amount`. |
| ^^^cod_service_fee_amount | string |  | The cash on delivery service fees charged to buyers. Applicable only for Saudi Arabia. |
| ^^^refund_cod_service_fee_amount | string |  | The refund for cash on delivery service fees. Applicable only for Saudi Arabia. |
| ^^^refund_subtotal_before_discount_amount | string |  | The total price of all refunded items before any seller discounts. This is equivalent to the shop's gross sales refund. |
| ^^^seller_discount_amount | string |  | The total amount of discounts funded by the seller, including: - Seller promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) - Seller's portion of a co-funded voucher discount in co-funding campaigns - Seller discounts during a campaign |
| ^^^seller_discount_refund_amount | string |  | Discounts returned to the sellers due to returns or refunds. |
| ^^^subtotal_before_discount_amount | string |  | The total price of all order items before any seller discounts and platform discounts are deducted. This is equivalent to the shop's gross sales. |
| ^^settlement_amount | string |  | The settlement amount for the SKU. |
| ^^shipping_cost_amount | string |  | The shipping costs at the time of order settlement. This is equivalent to the sum of all contributory amounts in `shipping_cost_breakdown`. |
| ^^shipping_cost_breakdown | object |  | The list of amounts that directly contribute to `shipping_cost_amount`. |
| ^^^actual_shipping_fee_amount | string |  | The actual shipping fee calculated based on the weight/dimensions measured by the carrier. For details, check `shipping_cost_breakdown.supplementary_component`. |
| ^^^customer_paid_shipping_fee_amount | string |  | The actual shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. Negative numbers refer to the refunded amount of customer-paid shipping fees |
| ^^^exchange_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods exchange. Applicable only for Indonesia. |
| ^^^failed_delivery_subsidy_amount | string |  | For shipping fee from failed deliveries, you pay up to a standard rate, and TikTok Shop covers the remaining amount. |
| ^^^fbt_free_shipping_fee_amount | string |  | This is the fee that you cover when offering customers free shipping through FBT. |
| ^^^fbt_fulfillment_fee_reimbursement_amount | string |  | A reimbursement from TikTok Shop for Fulfilled by TikTok (FBT) orders that don't qualify for free shipping. Applicable only for the US. |
| ^^^free_return_subsidy_amount | string |  | Reimbursement for the platform-funded portion of return shipping fees, as part of the free returns offered to customers. |
| ^^^replacement_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods replacement. Applicable only for Indonesia. |
| ^^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns. |
| ^^^return_shipping_fee_paid_buyer_amount | string |  | Reimbursement for the shipping fees paid by customers to return packages |
| ^^^return_shipping_label_fee_amount | string |  | The fee borne by the customer to cover the cost of return labels. This fee is collected on the seller's behalf and settled according to the agreed payment terms. |
| ^^^seller_self_shipping_service_fee_amount | string |  | A service fee charged for orders shipped through your own logistics provider. Applies to packages that don't meet the exemption criteria. |
| ^^^shipping_fee_discount_amount | string |  | The shipping fee subsidies and incentives provided by the platform. This includes all subsidies regardless of fulfillment channels or policies. For details, check `shipping_cost_breakdown.supplementary_component`. |
| ^^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance services. |
| ^^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmation services |
| ^^^supplementary_component | object |  | Supplementary costs for your reference. These amounts do not directly contribute to `shipping_cost_amount`. |
| ^^^^customer_shipping_fee_offset_amount | string |  | The fee to offset TikTok Shop Shipping Incentive or customer-paid shipping fee, resulting in a net charge of $0 to the seller. Applicable only for the US. |
| ^^^^fbm_shipping_cost_amount | string |  | The shipping fee incurred by the seller for using TikTok Shipping. This is part of `actual_shipping_fee_amount`. |
| ^^^^fbt_fulfillment_fee_amount | string |  | The shipping and warehouse fulfillment fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable only for the US. |
| ^^^^fbt_fulfillment_fee_reimbursement_amount | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `shipping_cost_breakdown.fbt_fulfillment_fee_reimbursement_amount` instead for the relevant details.) |
| ^^^^fbt_shipping_cost_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable only for EU and UK. |
| ^^^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided in accordance with a campaign policy. This is part of `shipping_fee_discount_amount`. |
| ^^^^promo_shipping_incentive_amount | string |  | The additional shipping incentive that the seller will receive if the seller signed up for the Co-Funded Free Shipping Program. A negative amount indicates a reversal of incentives due to order refunds attributed to the seller's responsibility. This is part of `shipping_fee_discount_amount`. |
| ^^^^refunded_customer_shipping_fee_amount | string |  | Shipping fee returned to customers due returns and refunds.Does not include subsidies.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^return_refund_subsidy_amount | string |  | For shipping fee from returns and refunds, you pay up to a standard rate, and TikTok Shop covers the remaining amount.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^seller_shipping_fee_discount_amount | string |  | The shipping fee discount provided by sellers. |
| ^^^^shipping_fee_guarantee_reimbursement | string |  | Reimbursement from the Shipping Fee Guarantee Program for failed deliveries or returns |
| ^^^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy funded by the platform for seller shipping. This is part of `shipping_fee_discount_amount`. - Positive amount represents a subsidy received by the seller. - Negative amount represents a subsidy that the seller must return to TikTok Shop. |
| ^^sku_id | string |  | The SKU ID in TikTok Shop. |
| ^^sku_name | string |  | The SKU name. |
| ^^statement_id | string |  | The statement ID. |
| ^total_count | integer |  | The number of transaction records |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTransactionsbyStatement

Retrieves the details of a statement, including the transactions, which can be a standard order transaction, an adjustment transaction, or a reserve-related transaction. For the SKU-level details of an order transaction, refer to [Get Transactions by Order](650a6734defece02be67d724).
Applicable for all regions' sellers. Only data after 2023-07-01 is available (Please note that for US cross-border sellers, data before 2025-04-30 is unavailable).

**Path:** `/finance/202501/statements/{statement_id}/statement_transactions`
**Method:** `GET`
**Version:** 202501
**Docs:** https://partner.tiktokshop.com/docv2/page/get-transactionsby-statement-202501

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| statement_id | string | Y | The unique id of statement |

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| sort_field | string | Y | The returned results will be sorted by the specified field. Only supports `order_create_time`. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| page_size | integer |  | The number of results to be returned per page. Default: 20 Valid range: [1-100] |
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
| ^create_time | integer |  | The time when the statement was generated. Unix timestamp. Statements are generated daily at 00:00 UTC. |
| ^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^id | string |  | The statement ID. |
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^payable_amount | string |  | The final amount paid out after accounting for reserve funds. Formula: total_settlement_amount + total_reserve_amount |
| ^status | string |  | The statement status. Only supports `SETTLED`. |
| ^total_count | integer |  | The number of transaction records in the statement. |
| ^total_reserve_amount | string |  | The total amount withheld from settlement based on TikTok Shop Reserve Policy. Refer to TikTok Shop Academy for more information. - A positive amount indicates the funds that have been released. - A negative amount indicates the funds being withheld from the settlement. Applicable only for UK and US local sellers. |
| ^total_settlement_amount | string |  | The total settlement amount. Formula: total_revenue_amount - total_shipping_cost_amount - total_fee_tax_amount - total_adjustment_amount |
| ^total_settlement_breakdown | object |  | The list of amounts that directly contribute to `total_settlement_amount`. |
| ^^total_adjustment_amount | string |  | The total adjustment amount based on TikTok Shop policy. Refer to `transactions.type` for the list of adjustment-related policies. |
| ^^total_fee_tax_amount | string |  | The total fees and taxes charged by the platform at the time of order settlement. Shipping-related costs are excluded. |
| ^^total_revenue_amount | string |  | The total revenue amount at the time of order settlement. This is equivalent to the net sales amount. |
| ^^total_shipping_cost_amount | string |  | The total shipping costs at the time of order settlement. |
| ^transactions | array<object> |  | The list of transaction records in the statement. Each transaction corresponds to an order, an adjustment, or a reserve-related transaction. |
| ^^adjustment_amount | string |  | The adjustment amount based on TikTok Shop policy. Refer to `transactions.type` for the list of adjustment-related policies. |
| ^^adjustment_id | string |  | The adjustment ID if the transaction is an adjustment. Each transaction can only be associated with an order ID or an adjustment ID. |
| ^^adjustment_order_id | string |  | The order ID associated with the adjustment, if any. |
| ^^associated_order_id | string |  | The order ID associated with the reserve transaction. |
| ^^estimated_release_time | string |  | The estimated date when the reserve funds will be released and paid out to the seller. Unix timestamp. Returns an empty value if the reserve funds have already been released. |
| ^^fee_tax_amount | string |  | The total fees and taxes charged by TikTok Shop at the time of order settlement. Shipping-related costs are excluded. This is equivalent to the sum of all contributory amounts in `fee_tax_breakdown`. |
| ^^fee_tax_breakdown | object |  | The list of amounts that directly contribute to `fee_tax_amount`. |
| ^^^fee | object |  | The list of fees. |
| ^^^^affiliate_ads_commission_amount | string |  | The commission for eligible orders from ads. |
| ^^^^affiliate_commission_amount | string |  | The commission amount charged to the seller for payment to the creator. |
| ^^^^affiliate_commission_amount_before_pit | string |  | The affiliate ads commission paid to a creator before any personal income tax withholding. Applicable only for SEA markets. |
| ^^^^affiliate_commission_deposit | string |  | The amount reserved for creator commissions after an order is paid. Applies only to commissions tied to order volume and is based on the highest earning rate. |
| ^^^^affiliate_commission_release | string |  | The commission deposit refunded to you after order settlement. Applies only to commissions tied to order volume. |
| ^^^^affiliate_partner_commission_amount | string |  | The commission amount for purchases through affiliate partner links. |
| ^^^^bonus_cashback_service_fee_amount | string |  | The service fee charged for participation in the bonus cashback program. |
| ^^^^campaign_resource_fee | string |  | Amount of campaign resource fee from program seller joining in |
| ^^^^cofunded_creator_bonus_amount | string |  | The portion of the creator bonus that you co-fund as part of the commission boost campaign. |
| ^^^^cofunded_promotion_service_fee_amount | string |  | The service fee charged for co-funded promotions. |
| ^^^^credit_card_handling_fee_amount | string |  | The handling fee charged when the buyer pays with a credit card. |
| ^^^^dt_handling_fee_amount | string |  | The handling fee charged for orders that are fulfilled by Dilayani Tokopedia. |
| ^^^^dynamic_commission_amount | string |  | The dynamic commission fee is the amount that the platform charges to all sellers for every successfully delivered order. Applicable only for Indonesia. |
| ^^^^epr_pob_service_fee_amount | string |  | The eco-contributions TikTok Shop pays on your behalf to the qualified producer responsibility organization (PRO). |
| ^^^^external_affiliate_marketing_fee_amount | string |  | The service fee for participating in the External Affiliate Marketing Solution Program, as stated during registration. |
| ^^^^fee_per_item_sold_amount | string |  | The fee charged to sellers by the platform for each item sold. This is equivalent to the sum of all per-item fees for all SKUs in the order. Applicable only for the Brazil market. |
| ^^^^flash_sales_service_fee_amount | string |  | The service fee charged for participation in flash sales. |
| ^^^^installation_service_fee | string |  | The fee TikTok Shop charges you for using platform installation service |
| ^^^^live_specials_fee_amount | string |  | The service fee charged for participation in the [LIVE Specials Programme]. |
| ^^^^mall_service_fee_amount | string |  | The service fee charged for using TikTok Shop Mall. |
| ^^^^platform_commission_amount | string |  | The commission amount charged by the platform. |
| ^^^^pre_order_service_fee_amount | string |  | The service fee charged for participation in the pre-order program. |
| ^^^^referral_fee_amount | string |  | The referral fee charged for processing successful orders. Applicable only for the US. |
| ^^^^refund_administration_fee_amount | string |  | The 20% refund administration fee deducted from the total refunded referral fee amount. |
| ^^^^seller_paylater_handling_fee_amount | string |  | The handling fee charged to the seller for participation in the PayLater program. |
| ^^^^sfp_service_fee_amount | string |  | The service fee charged for participation in the [Seller Free Shipping Programme]. |
| ^^^^shipping_fee_guarantee_service_fee | string |  | A flat service fee charged for each order under the Shipping Fee Guarantee Program |
| ^^^^tap_shop_ads_commission | string |  | The advertising commission cost a merchant pays to TikTok Shop Affiliate Partner (TAP). |
| ^^^^transaction_fee_amount | string |  | The transaction fee charged for processing successful orders. |
| ^^^^tsp_commission_amount | string |  | The commission amount charged by TikTok Shop Partners (TSP). |
| ^^^^vn_fix_infrastructure_fee | string |  | Infrastructure fees are a fixed service fee that TikTok Shop charges for providing, maintaining, and developing infrastructure for delivery services. It applies to delivered orders on the main order level. |
| ^^^^voucher_xtra_service_fee_amount | string |  | The service fee charged for participation in the Voucher Xtra program. |
| ^^^tax | object |  | The list of tax amounts. |
| ^^^^anti_dumping_duty_amount | string |  | The anti-dumping duties collected by governments for import goods. |
| ^^^^customs_clearance_amount | string |  | The fees charged by logistic suppliers for customs clearance services. Applicable only for cross-border shop orders. |
| ^^^^customs_duty_amount | string |  | The customs duties, a type of tax on cross-border goods collected by governments. Applicable only for cross-border shop orders. |
| ^^^^gst_amount | string |  | The goods and services tax (GST) collected and remitted to the tax authority by the platform for low-value goods imported into Singapore, effective January 1, 2023. |
| ^^^^import_vat_amount | string |  | The import VAT, a tax paid on goods bought in one country and imported into another. Applicable only for cross-border shop orders. In Japan, it refers to the Japan Consumption Tax (JCT). |
| ^^^^isr_amount | string |  | The Mexican federal income tax that TikTok Shop is required to withhold. |
| ^^^^iva_amount | string |  | The Mexican VAT that TikTok Shop is required to withhold on your taxable products and remit to the tax authority. |
| ^^^^local_vat_amount | string |  | The VAT paid by the platform on the seller's behalf. Applicable only for local shop orders. |
| ^^^^pit_amount | string |  | The personal income tax (PIT) paid by the platform on the seller's behalf. |
| ^^^^sst_amount | string |  | The sales and service tax (SST) collected and remitted to the tax authority by the platform for low-value goods imported into Malaysia, effective January 1, 2024. |
| ^^^^vat_amount | string |  | The VAT paid by the platform on the seller's behalf. Applicable only for cross-border shop orders. |
| ^^id | string |  | The transaction ID. |
| ^^order_create_time | integer |  | The creation time of the order. Unix timestamp. |
| ^^order_id | string |  | The order ID. Each transaction can only be associated with an order ID or an adjustment ID. |
| ^^reserve_amount | string |  | The amount withheld from settlement based on TikTok Shop Reserve Policy. Refer to TikTok Shop Academy for more information. - A positive amount indicates funds that have been released. - A negative amount indicates funds being withheld from the settlement. |
| ^^reserve_id | string |  | The ID of a reserve transaction. |
| ^^reserve_status | string |  | The status of the reserve funds. Possible values: - COLLECTED: A portion of the order's settlement amount has been withheld as reserve funds. - RELEASED: The previously reserved funds have been released and paid out to the seller. |
| ^^revenue_amount | string |  | The revenue amount at the time of order settlement. This is equivalent to the sum of all amounts in `revenue_breakdown`. |
| ^^revenue_breakdown | object |  | The list of amounts that directly contribute to `revenue_amount`. |
| ^^^cod_service_fee_amount | string |  | The cash on delivery service fees charged to buyers. Applicable only for Saudi Arabia. |
| ^^^refund_cod_service_fee_amount | string |  | The refund for cash on delivery service fees. Applicable only for Saudi Arabia. |
| ^^^refund_subtotal_before_discount_amount | string |  | The total price of all refunded items before any seller discounts. This is equivalent to the shop's gross sales refund. |
| ^^^seller_discount_amount | string |  | The total amount of discounts funded by the seller, including: - Seller promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) - Seller's portion of a co-funded voucher discount in co-funding campaigns - Seller discounts during a campaign |
| ^^^seller_discount_refund_amount | string |  | Discounts returned to the sellers due to returns or refunds. |
| ^^^subtotal_before_discount_amount | string |  | The total price of all order items before any seller discounts and platform discounts are deducted. This is equivalent to the shop's gross sales. |
| ^^settlement_amount | string |  | The settlement amount for the order. Formula: revenue_amount - shipping_cost_amount - fee_tax_amount - adjustment_amount |
| ^^shipping_cost_amount | string |  | The shipping costs at the time of order settlement. This is equivalent to the sum of all contributory amounts in `shipping_cost_breakdown`. |
| ^^shipping_cost_breakdown | object |  | The list of amounts that directly contribute to `shipping_cost_amount`. |
| ^^^actual_shipping_fee_amount | string |  | The actual shipping fee calculated based on the weight/dimensions measured by the carrier. For details, check `shipping_cost_breakdown.supplementary_component`. |
| ^^^customer_paid_shipping_fee_amount | string |  | The actual shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. Negative numbers refer to the refunded amount of customer-paid shipping fees |
| ^^^exchange_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods exchange. Applicable only for Indonesia. |
| ^^^failed_delivery_subsidy_amount | string |  | For shipping fee from failed deliveries, you pay up to a standard rate, and TikTok Shop covers the remaining amount. |
| ^^^fbt_free_shipping_fee_amount | string |  | This is the fee that you cover when offering customers free shipping through FBT. |
| ^^^fbt_fulfillment_fee_reimbursement_amount | string |  | A reimbursement from TikTok Shop for Fulfilled by TikTok (FBT) orders that don't qualify for free shipping. Applicable only for the US. |
| ^^^free_return_subsidy_amount | string |  | Reimbursement for the platform-funded portion of return shipping fees, as part of the free returns offered to customers. |
| ^^^replacement_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods replacement. Applicable only for Indonesia. |
| ^^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns. |
| ^^^return_shipping_fee_paid_buyer_amount | string |  | Reimbursement for the shipping fees paid by customers to return packages |
| ^^^return_shipping_label_fee_amount | string |  | The fee borne by the customer to cover the cost of return labels. This fee is collected on the seller's behalf and settled according to the agreed payment terms. |
| ^^^seller_self_shipping_service_fee_amount | string |  | A service fee charged for orders shipped through your own logistics provider. Applies to packages that don't meet the exemption criteria. |
| ^^^shipping_fee_discount_amount | string |  | The shipping fee subsidies and incentives provided by the platform. This includes all subsidies regardless of fulfillment channels or policies. For details, check `shipping_cost_breakdown.supplementary_component`. |
| ^^^shipping_fee_guarantee_reimbursement | string |  | Reimbursement from the Shipping Fee Guarantee Program for failed deliveries or returns |
| ^^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance services. |
| ^^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmation services. |
| ^^^supplementary_component | object |  | Supplementary costs for your reference. These amounts do not directly contribute to `shipping_cost_amount`. |
| ^^^^customer_shipping_fee | string |  | The shipping fee borne by the customer.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^customer_shipping_fee_offset_amount | string |  | The fee to offset TikTok Shop Shipping Incentive or customer-paid shipping fee, resulting in a net charge of $0 to the seller. Applicable only for the US. |
| ^^^^fbm_shipping_cost_amount | string |  | The shipping fee incurred by the seller for using TikTok Shipping. This is part of `actual_shipping_fee_amount`. |
| ^^^^fbt_fulfillment_fee_amount | string |  | The shipping and warehouse fulfillment fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable only for the US. |
| ^^^^fbt_fulfillment_fee_reimbursement_amount | string |  | (**Deprecated**: This field is deprecated and will return an empty string. Please refer to `shipping_cost_breakdown.fbt_fulfillment_fee_reimbursement_amount` instead for the relevant details.) |
| ^^^^fbt_shipping_cost_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable only for EU and UK. |
| ^^^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided in accordance with a campaign policy. This is part of `shipping_fee_discount_amount`. |
| ^^^^promo_shipping_incentive_amount | string |  | The additional shipping incentive that the seller will receive if the seller signed up for the Co-Funded Free Shipping Program. A negative amount indicates a reversal of incentives due to order refunds attributed to the seller's responsibility. This is part of `shipping_fee_discount_amount`. |
| ^^^^refund_customer_shipping_fee | string |  | Refund the shipping fee borne by the customer. Include subsidies.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^refunded_customer_shipping_fee_amount | string |  | Shipping fee returned to customers due returns and refunds.Does not include subsidies.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^return_refund_subsidy_amount | string |  | For shipping fee from returns and refunds, you pay up to a standard rate, and TikTok Shop covers the remaining amount.This is part of `customer_paid_shipping_fee_amount`. |
| ^^^^seller_shipping_fee_discount_amount | string |  | The shipping fee discount provided by sellers. |
| ^^^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy funded by the platform for seller shipping. This is part of `shipping_fee_discount_amount`. - Positive amount represents a subsidy received by the seller. - Negative amount represents a subsidy that the seller must return to TikTok Shop. |
| ^^supplementary_component | object |  | Supplementary costs for your reference. These amounts do not directly contribute to the settlement amount. |
| ^^^customer_payment_amount | string |  | The total amount paid by the customer. |
| ^^^customer_refund_amount | string |  | The exact amount refunded to the customer. |
| ^^^platform_cofunded_discount_amount | string |  | The platform's portion of a co-funded voucher discount in co-funding campaigns. |
| ^^^platform_cofunded_discount_refund_amount | string |  | The platform's portion of a co-funded voucher discount in co-funding campaigns that was refunded to the platform. |
| ^^^platform_discount_amount | string |  | The discounts funded by the platform, such as coupons and campaign discounts. |
| ^^^platform_discount_refund_amount | string |  | The platform discounts to be reversed (and deducted from the final settlement) if the order was refunded as a result of the seller's responsibility. |
| ^^^retail_delivery_fee_amount | string |  | The final retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). Formula: retail_delivery_fee_payment + retail_delivery_fee_refund |
| ^^^retail_delivery_fee_payment_amount | string |  | The retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). |
| ^^^retail_delivery_fee_refund_amount | string |  | The retail delivery fee subsidy by the platform for losses due to returns, refunds, or other issues in Colorado, US. |
| ^^^sales_tax_amount | string |  | The final sales tax to be paid by the customer for the product and delivery. Formula: sales_tax_payment_amount - sales_tax_refund_amount |
| ^^^sales_tax_payment_amount | string |  | The expected sales tax to be paid by the customer for the product and delivery. |
| ^^^sales_tax_refund_amount | string |  | The sales tax amount returned to the customer in the event of a refund. |
| ^^^seller_cofunded_discount_amount | string |  | The seller's portion of a co-funded voucher discount in co-funding campaigns. |
| ^^^seller_cofunded_discount_refund_amount | string |  | The seller's portion of a co-funded voucher discount in co-funding campaigns that was refunded to the seller. |
| ^^type | string |  | The transaction type. **Standard transactions** - `ORDER`: A transaction related to an order settlement. - `RESERVE`: A transaction involving collection or release of reserve funds. - If the transaction is an adjustment, it returns one of the following values: **Platform-related adjustments** - `CHARGE_BACK`: Charges returned to a payment card after a customer has successfully disputed an item on their account statement or transactions report. - `CUSTOMER_SERVICE_COMPENSATION`: Extra compensation or compensation paid to a customer after the after-sales period by customer service. - `DEDUCTIONS_INCURRED_BY_SELLER`: Deduction arising from customer dissatisfaction as a result of the seller's responsibility. This includes issues such as fraud, empty packages, items that do not match the product display page, or items of lower value than advertised. - `GMV_PAYMENT_FOR_ADS`: Amount used to pay for your advertisement if you are enabled "auto pay ads with shop GMV", or to pay for Tiktok Promote ads orders. - `PLATFORM_COMMISSION_ADJUSTMENT`: Adjustment when there are differences in the platform commission paid by the seller. - `PLATFORM_COMMISSION_COMPENSATION`: Compensation paid to the seller when there are differences in the platform commission paid by the seller. - `PLATFORM_PENALTY`: Penalty imposed for a violation of TikTok Shop policies (the corresponding amount has been deducted from the seller's account). For details, please refer to the email notification sent to the seller. - `PROMOTION_ADJUSTMENT`: Adjustment when a seller takes part in a platform promotion and there are differences between the promotion price and the actual amount paid by the seller. - `REBATE`: A discount on referral fees offered by TikTok Shop to eligible sellers. - `PLATFORM_COMPENSATION`: Compensation paid to the seller after the seller successfully appealed for a customer dispute. - `PLATFORM_REIMBURSEMENT`: Reimbursement paid by TikTok Shop for an order refunded under TikTok's refund without return policy (the seller is not responsible). - `COFUNDED_CREATOR_REWARDS`: Fees charged for joining the co-funded creator rewards program to reward creator activities. - `STAMP_DUTY`: To comply with Thailand's tax regulations, TikTok Shop withholds and remits the stamp duty levied on the withholding tax agent appointment letter. This document falls under Instrument No. 21 (Agency) and is subject to a THB 30 stamp duty. **Logistics-related adjustments** - `FBT_WAREHOUSE_SERVICE_FEE`: Amount charged by TikTok Fulfillment Portal (Pipak) for warehousing-related bills incurred by the seller under the Fulfilled by TikTok (FBT) service. - `LOGISTICS_REIMBURSEMENT`: Reimbursement paid by TikTok Shop for an order refunded due to logistics-related issues (e.g. lost or damaged order). - `SHIPPING_FEE_ADJUSTMENT`: Adjustment when there are differences or mistakes with the shipping fee paid by the seller. - `SHIPPING_FEE_COMPENSATION`: Compensation given to sellers due to differences between the actual shipping fee and the pre-paid shipping fee. - `SHIPPING_FEE_REBATE`: Shipping fee rebate provided to the seller as part of their participation in a platform campaign. - `SAMPLE_SHIPPING_FEE`: Fees charged for sending samples using the TikTok logistics provider. - `SELLER_MISSION_REWARD`: Platform provided cash reward for seller mission completion. - `Violation fee （settlement fee）`: The deduction to cover the cost of buyer's losses for the unpleasant experience of the buyer due to an issue that is the seller's responsibility. - `Violation fee （credit card）`: The amount owed to TikTok Shop from previous transactions, charged to your primary credit card. - `Bill payment （negative balance）`: The amount you owe TikTok Shop, charged to your primary credit card. -  `Sales proceed（negative balance） `:Sales proceed that is ready to pay for negeative balance. -  `Bill deduction for negative balance `:Deduction for the amount you owe TikTok Shop after all platform fees are deducted from your net earnings. **Miscellaneous adjustments** `OTHER_ADJUSTMENT`: Adjustment for other reasons. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetTaxInformation

Retrieve the tax information registered for a shop. This API can be used in all countries except the EU.

**Path:** `/finance/202504/tax_information`
**Method:** `GET`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/get-tax-information-202504

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
| ^tax_information | object |  | Tax-related information associated with the shop. |
| ^^business_entity | object |  | The official business entity details registered with tax authorities. This is also the entity whose address appears on invoices. |
| ^^^address | string |  | The registered address, including the building number, street name, district, city, province, country, and any relevant details. |
| ^^^branch_number | string |  | The branch number. Applicable only if `organization_level=BRANCH`. |
| ^^^business_name | string |  | The registered legal business name. Applicable only for the PH market. |
| ^^^fiscal_regime | string |  | The fiscal regime code applicable to the business in Mexico. Applicable only for the MX market. Possible values: - General Law Legal Persons - Legal Persons with Non-Profit Purposes - Salaries and Salaries and Income Assimilated to Salaries - Leasing - Regime of Alienation or Acquisition of Assets - Other income - Residents Abroad without Permanent Establishment in Mexico - Dividend Income (partners and shareholders) - Individuals with Business and Professional Activities - Interest income - Regime of income from obtaining prizes - No tax obligations - Cooperative Production Societies that choose to defer their income - Tax Incorporation - Agricultural, Livestock, Forestry and Fishing Activities - Optional for Groups of Companies - Coordinated - Regime of Business Activities with income through Technological Platforms - Simplified Trust Regime |
| ^^^organization_level | string |  | The organizational level of this business entity. - UNKNOWN - HEADQUARTER - BRANCH Applicable only for the TH market. |
| ^^^postal_code | string |  | The postal code. |
| ^^overall_status | object |  | The overall status of tax information submission and completeness for the shop. |
| ^^^is_tax_infomation_complete | boolean |  | A flag indicating whether all mandatory tax information has been completed. |
| ^^^is_tax_number_submitted | boolean |  | A flag indicating whether a tax number has been submitted. This will determine if products can be listed. |
| ^^tax_numbers | array<object> |  | The list of tax numbers associated with the shop. |
| ^^^recent_audit | object |  | The details of the most recent tax number audit. |
| ^^^^rejection_reasons | array<string> |  | The list of rejection reason labels. - INVALID_RFC: The tax number is invalid. - ZIPCODE_NOT_MATCH_RFC: The postal code doesn't match the official records from the tax authority. - NAME_NOT_MATCH_RFC: The business name doesn't match the official records from the tax authority. |
| ^^^^status | string |  | The audit status: - PENDING_AUDIT - UNDER_AUDIT - APPROVED - REJECTED |
| ^^^^tax_number | string |  | The tax number of the most recent audit. |
| ^^^registration_status | string |  | A status indicating whether the seller has declared the registered tax number: - UNKNOWN: Seller has not made any declaration. - NOT_REGISTERED: Seller declared that they have not registered a tax number. - REGISTERED: Seller declared that they have registered a tax number. |
| ^^^tax_form_audit_status | string |  | The audit status of the submitted tax form (e.g., US W9 form): - PENDING_AUDIT - UNDER_AUDIT - APPROVED - REJECTED Applicable only for the US market. |
| ^^^tax_number | string |  | The tax number that was approved by TikTok Shop auditing team. Note: If this is empty, it indicates that no tax number has been approved yet. |
| ^^^type | string |  | The type of tax number: - REGISTRATION_NUMBER: Company or personal registration number - VAT: Value added tax - TIN: Tax identification number |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetUnsettledTransactions

This API allows the partner to retrieve a list of unsettled transactions (incl. Orders & Adjustments) generated by a seller, returning the detailed fee breakdown for a list of order ID and adjustment ID. 
For now, this API only returns transactions which were created after 2025.01.01. Once one transaction is settled, which won't be returned by this API anymore, please get from Get Statement Transaction API. 
**Pay attention to that all data returned through this API is an estimated amount which subject to change before settlement and can only used for seller's reference, final settlement amount per each transaction can only provided through statement related API.

**Path:** `/finance/202507/orders/unsettled`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/get-unsettled-transactions-202507

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| page_size | integer |  | The number of results to be returned per page. Default: 20 Valid range: [1-100] |
| sort_field | string | Y | The returned results will be sorted by the specified field. Only supports `order_create_time`. |
| sort_order | string |  | The sort order for the `sort_field` parameter. Default: ASC Possible values: - ASC: Ascending order - DESC: Descending order |
| search_time_ge | integer |  | Filter statements to show only those that are generated on or after the specified date and time. Unix timestamp. Note:statement_time_ge and statement_time_lt together constitute the creation time filter condition. - If statement_time_ge is filled but statement_time_lt is empty, statement_time_lt will default to the current time. - If statement_time_lt is filled but statement_time_ge is empty, statement_time_ge will default to 20250101. |
| search_time_lt | integer |  | the search range's end time |
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
| ^next_page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Provide this value in the `page_token` parameter of your request if the current response does not return all the results. |
| ^sum_est_adjustment_amount | string |  | The sum of the estimated adjustment amount. |
| ^sum_est_fee_amount | string |  | The sum of the estimated fee amount. |
| ^sum_est_revenue_amount | string |  | The sum of the estimated revenue amount. |
| ^sum_est_settlement_amount | string |  | The sum of the estimated settlement amount. |
| ^total_count | integer |  | The number of transaction records in the statement. |
| ^transactions | array<object> |  | The list of transaction records in the statement. Each transaction corresponds to an order, an adjustment, or a reserve-related transaction. |
| ^^adjustment_id | string |  | The adjustment ID if the transaction is an adjustment. Each transaction can only be associated with an order ID or an adjustment ID. |
| ^^adjustment_order_id | string |  | The order ID associated with the adjustment, if any. |
| ^^currency | string |  | The three-digit currency code in ISO 4217 format. |
| ^^est_adjustment_amount | string |  | The estimated adjustment amount based on TikTok Shop policy. Refer to `transactions.type` for the list of adjustment-related policies. |
| ^^est_fee_tax_amount | string |  | The estimated total fees and taxes charged by TikTok Shop. Shipping-related costs are excluded. This is equivalent to the sum of all contributory amounts in `fee_tax_breakdown`. |
| ^^est_revenue_amount | string |  | The estimated revenue amount. This is equivalent to the sum of all amounts in `revenue_breakdown`. |
| ^^est_settlement_amount | string |  | The estimated settlement amount for the order. Formula: revenue_amount - shipping_cost_amount - fee_tax_amount - adjustment_amount |
| ^^est_shipping_cost_amount | string |  | The estimated shipping costs, please note that when order hasn't been delivered, no complete shipping cost can be provided. This is equivalent to the sum of all contributory amounts in `shipping_cost_breakdown`. |
| ^^estimated_settlement | string |  | Estimated settlement time for this transaction. Possible return value: - x days after delivery: when order hasn't been delivered and only rough settlement policy been provided - Unix timestamp: when order has been delivered and detailed settlement time been calculated out |
| ^^fee_tax_breakdown | object |  | The list of amounts that directly contribute to `fee_tax_amount`. |
| ^^^fee | object |  | The list of fees. |
| ^^^^affiliate_ads_commission_amount | string |  | The commission for eligible orders from ads. |
| ^^^^affiliate_commission_amount | string |  | The commission amount charged to the seller for payment to the creator. |
| ^^^^affiliate_commission_before_pit_amount | string |  | The affiliate ads commission paid to a creator before any personal income tax withholding. Applicable only for SEA markets. |
| ^^^^affiliate_partner_commission_amount | string |  | The commission amount for purchases through affiliate partner links. |
| ^^^^bonus_cashback_service_fee_amount | string |  | The service fee charged for participation in the bonus cashback program. |
| ^^^^credit_card_handling_fee_amount | string |  | The handling fee charged when the buyer pays with a credit card. |
| ^^^^live_specials_fee_amount | string |  | The service fee charged for participation in the [LIVE Specials Programme]. |
| ^^^^mall_service_fee_amount | string |  | The service fee charged for using TikTok Shop Mall. |
| ^^^^pit_withheld_from_ads_commission_amount | string |  | The creator's personal income tax withholding amount, deducted from the affiliate ads commission. Sellers are responsible for declaration and remittance to the tax authority, as well as providing finalized personal income tax documentation to creators. Applicable only for SEA markets. |
| ^^^^platform_commission_amount | string |  | The commission amount charged by the platform. |
| ^^^^referral_fee_amount | string |  | The referral fee charged for processing successful orders. Applicable only for the US. |
| ^^^^refund_administration_fee_amount | string |  | The 20% refund administration fee deducted from the total refunded referral fee amount. |
| ^^^^retail_delivery_fee_amount | string |  | The final retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). Formula: retail_delivery_fee_payment + retail_delivery_fee_refund |
| ^^^^retail_delivery_fee_payment_amount | string |  | The retail delivery fee for deliveries in Colorado, US. For more information, see [Colorado Retail Delivery Fee FAQ](https://seller-us.tiktok.com/university/essay?knowledge_id=2459780628350762&default_language=en&identity=1). |
| ^^^^retail_delivery_fee_refund_amount | string |  | The retail delivery fee subsidy by the platform for losses due to returns, refunds, or other issues in Colorado, US. |
| ^^^^sfp_service_fee_amount | string |  | The service fee charged for participation in the [Seller Free Shipping Programme]. |
| ^^^^transaction_fee_amount | string |  | The transaction fee charged for processing successful orders. |
| ^^^tax | object |  | The list of tax amounts. |
| ^^^^customs_clearance_amount | string |  | The fees charged by logistic suppliers for customs clearance services. Applicable only for cross-border shop orders. |
| ^^^^customs_duty_amount | string |  | The customs duties, a type of tax on cross-border goods collected by governments. Applicable only for cross-border shop orders. |
| ^^^^gst_amount | string |  | The goods and services tax (GST) collected and remitted to the tax authority by the platform for low-value goods imported into Singapore, effective January 1, 2023. |
| ^^^^import_vat_amount | string |  | The import VAT, a tax paid on goods bought in one country and imported into another. Applicable only for cross-border shop orders. |
| ^^^^sales_tax_amount | string |  | The final sales tax to be paid by the customer for the product and delivery. Formula: sales_tax_payment_amount - sales_tax_refund_amount |
| ^^^^sales_tax_payment_amount | string |  | The expected sales tax to be paid by the customer for the product and delivery. |
| ^^^^sales_tax_refund_amount | string |  | The sales tax amount returned to the customer in the event of a refund. |
| ^^^^sst_amount | string |  | The sales and service tax (SST) collected and remitted to the tax authority by the platform for low-value goods imported into Malaysia, effective January 1, 2024. |
| ^^^^vat_amount | string |  | The VAT paid by the platform on the seller's behalf. Applicable only for cross-border shop orders. |
| ^^id | string |  | The transaction ID. |
| ^^order_create_time | integer |  | The creation time of the order. Unix timestamp. |
| ^^order_delivery_time | integer |  | The delivery time of the order. Unix timestamp. if order hasn't been delivered, no data will be return |
| ^^order_id | string |  | The order ID. Each transaction can only be associated with an order ID or an adjustment ID. |
| ^^revenue_breakdown | object |  | The list of amounts that directly contribute to `revenue_amount`. |
| ^^^cod_service_fee_amount | string |  | The cash on delivery service fees charged to buyers. Applicable only for Saudi Arabia. |
| ^^^refund_cod_service_fee_amount | string |  | The refund for cash on delivery service fees. Applicable only for Saudi Arabia. |
| ^^^refund_subtotal_before_discount_amount | string |  | The total price of all refunded items before any seller discounts. This is equivalent to the shop's gross sales refund. |
| ^^^seller_discount_amount | string |  | The total amount of discounts funded by the seller, including: - Seller promotions (Product Discount, Flash Deal, Buy More Save More, Voucher and Bundle Deal) - Seller's portion of a co-funded voucher discount in co-funding campaigns - Seller discounts during a campaign |
| ^^^seller_discount_refund_amount | string |  | Discounts returned to the sellers due to returns or refunds. |
| ^^^subtotal_before_discount_amount | string |  | The total price of all order items before any seller discounts and platform discounts are deducted. This is equivalent to the shop's gross sales. |
| ^^shipping_cost_breakdown | object |  | The list of amounts that directly contribute to `shipping_cost_amount`. |
| ^^^actual_shipping_fee_amount | string |  | The actual shipping fee calculated based on the weight/dimensions measured by the carrier. For details, check ` shipping_cost_breakdown.supplementary_component`. |
| ^^^customer_paid_shipping_fee_amount | string |  | The actual shipping fee borne by the customer, calculated based on the product weight uploaded by the seller. |
| ^^^exchange_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods exchange. Applicable only for Indonesia. |
| ^^^replacement_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of goods replacement. Applicable only for Indonesia. |
| ^^^return_shipping_fee_amount | string |  | The shipping fee paid by the seller for the delivery of returns. |
| ^^^shipping_fee_discount_amount | string |  | The shipping fee subsidies and incentives provided by the platform. This includes all subsidies regardless of fulfillment channels or policies. For details, check ` shipping_cost_breakdown.supplementary_component`. |
| ^^^shipping_insurance_fee_amount | string |  | The shipping insurance fee incurred by the seller for purchasing additional TikTok shipping insurance services. |
| ^^^signature_confirmation_fee_amount | string |  | The fee incurred for packages requiring signature confirmation services |
| ^^^supplementary_component | object |  | Supplementary costs for your reference. These amounts do not directly contribute to `shipping_cost_amount`. |
| ^^^^customer_shipping_fee_offset_amount | string |  | The fee to offset TikTok Shop Shipping Incentive or customer-paid shipping fee, resulting in a net charge of $0 to the seller. Applicable only for the US. |
| ^^^^fbm_shipping_cost_amount | string |  | The shipping fee incurred by the seller for using TikTok Shipping. This is part of `actual_shipping_fee_amount`. |
| ^^^^fbt_fulfillment_fee_amount | string |  | The shipping and warehouse fulfillment fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable only for the US. |
| ^^^^fbt_shipping_cost_amount | string |  | The shipping fee incurred by the seller for orders fulfilled by TikTok (FBT). This is part of `actual_shipping_fee_amount`. Applicable for all regions except the US. |
| ^^^^platform_shipping_fee_discount_amount | string |  | The shipping fee discount provided in accordance with a campaign policy.. This is part of `shipping_fee_discount_amount`. |
| ^^^^promo_shipping_incentive_amount | string |  | The additional shipping incentive that the seller will receive if the seller signed up for the Co-Funded Free Shipping Program from 2024/08/26 to 2024/12/31. A negative amount indicates a reversal of incentives due to order refunds attributed to the seller's responsibility. This is part of `shipping_fee_discount_amount`. |
| ^^^^seller_shipping_fee_discount_amount | string |  | The shipping fee discount provided by sellers. |
| ^^^^shipping_fee_subsidy_amount | string |  | The shipping fee subsidy funded by the platform for seller shipping. This is part of `shipping_fee_discount_amount`. - Positive amount represents a subsidy received by the seller. - Negative amount represents a subsidy that the seller must return to TikTok Shop. |
| ^^status | string |  | The transaction status. Only supports `UNSETTLED`. |
| ^^type | string |  | The transaction type. Standard transactions - `ORDER`: A transaction related to an order settlement. - If the transaction is an adjustment, it returns one of the following values: Platform-related adjustments - `CHARGE_BACK`: Charges returned to a payment card after a customer has successfully disputed an item on their account statement or transactions report. - `CUSTOMER_SERVICE_COMPENSATION`: Extra compensation or compensation paid to a customer after the after-sales period by customer service. - `DEDUCTIONS_INCURRED_BY_SELLER`: Deduction arising from customer dissatisfaction as a result of the seller's responsibility. This includes issues such as fraud, empty packages, items that do not match the product display page, or items of lower value than advertised. - `GMV_PAYMENT_FOR_ADS`: Amount used to pay for your advertisement if you are enabled "auto pay ads with shop GMV", or to pay for Tiktok Promote ads orders. - `PLATFORM_COMMISSION_ADJUSTMENT`: Adjustment when there are differences in the platform commission paid by the seller. - `PLATFORM_COMMISSION_COMPENSATION`: Compensation paid to the seller when there are differences in the platform commission paid by the seller. - `PLATFORM_PENALTY`: Penalty imposed for a violation of TikTok Shop policies (the corresponding amount has been deducted from the seller's account). For details, please refer to the email notification sent to the seller. - `PROMOTION_ADJUSTMENT`: Adjustment when a seller takes part in a platform promotion and there are differences between the promotion price and the actual amount paid by the seller. - `REBATE`: A discount on referral fees offered by TikTok Shop to eligible sellers. - `PLATFORM_COMPENSATION`: Compensation paid to the seller after the seller successfully appealed for a customer dispute. - `PLATFORM_REIMBURSEMENT`: Reimbursement paid by TikTok Shop for an order refunded under TikTok's refund without return policy (the seller is not responsible). Logistics-related adjustments - `FBT_WAREHOUSE_SERVICE_FEE`: Amount charged by TikTok Fulfillment Portal (Pipak) for warehousing-related bills incurred by the seller under the Fulfilled by TikTok (FBT) service. - `LOGISTICS_REIMBURSEMENT`: Reimbursement paid by TikTok Shop for an order refunded due to logistics-related issues (e.g. lost or damaged order). - `SHIPPING_FEE_ADJUSTMENT`: Adjustment when there are differences or mistakes with the shipping fee paid by the seller. - `SHIPPING_FEE_COMPENSATION`: Compensation given to sellers due to differences between the actual shipping fee and the pre-paid shipping fee. - `SHIPPING_FEE_REBATE`: Shipping fee rebate provided to the seller as part of their participation in a platform campaign. - `SAMPLE_SHIPPING_FEE`: Fees charged for sending samples using the TikTok logistics provider. Miscellaneous adjustments `OTHER_ADJUSTMENT`: Adjustment for other reasons. |
| ^^unsettled_reason | string |  | reason for why transaction is pending for settlement |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
