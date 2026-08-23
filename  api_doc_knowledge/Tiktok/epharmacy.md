# TikTok Shop API — epharmacy

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 5 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202504, 202507

---

## UpdatePrescriptionStatus

Update the status of the prescription image a buyer uploaded for an order to approved or rejected, and the reasons.

**Path:** `/epharmacy/202504/orders/{order_id}/update_prescription_status`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/update-prescription-status-202504

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| order_id | string | Y | Unique identifier of the order |

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
| prescription_status | string |  | The status of the uploaded prescription after review. Possible values: - `APPROVED`: The prescription has been reviewed and is authorized for fulfillment. - `REJECTED`: The prescription is denied and cannot be fulfilled. The buyer must upload a new prescription. If the prescription is rejected twice, the order will be automatically rejected. - `PENDING_RESUBMISSION`: The prescription needs corrections or additional information. The buyer must revise and resubmit. |
| rejection_reason | string |  | The reason when you choose to set status `REJECTED`. Max length: 5000 characters Examples of rejection reaon: - Resep tidak sesuai dengan obat - Resep tidak ada - Resep tidak terbaca |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetPharmacies

Get the list of pharmacies associated with your shop and their corresponding operational details.

**Path:** `/epharmacy/202504/pharmacies`
**Method:** `GET`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/get-pharmacies-202504

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | An opaque token used to retrieve the next page of a paginated result set. Retrieve this value from the result of the `next_page_token` from a previous response. It is not needed for the first page. |
| page_size | integer |  | The number of results to be returned per page. Default: 50 Valid range: [1, 100] |
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
| ^pharmacies | array<object> |  | The list of pharmacies that belong to a TikTok Shop. |
| ^^license_expire_time | integer |  | The license expiration time expressed in Unix timestamp (seconds). |
| ^^license_number | string |  | The pharmacy license number, known as Surat Izin Apotek (SIA). |
| ^^operation_hours | array<object> |  | A list of operational time ranges for the pharmacy. |
| ^^^close_time | string |  | The closing time in HH:mm UTC format (24-hour clock). |
| ^^^days | array<string> |  | Days of the week when the ePharmacy operates within a specified time range. Possible values: `MON`, `TUE`, `WED`, `THU`, `FRI`, `SAT`, `SUN` **Note**: Omitted days will be treated as closed days. |
| ^^^open_time | string |  | The opening time in HH:mm UTC format (24-hour clock). |
| ^^pharmacist | object |  | The pharmacist assigned to the pharmacy. |
| ^^^name | string |  | The name of the pharmacist, known as Apoteker Penanggung Jawab (APJ). |
| ^^^practice_license_expire_time | integer |  | The license expiration time expressed in Unix timestamp (seconds). |
| ^^^practice_license_number | string |  | The pharmacist practice license number, known as Surat Izin Praktik Apoteker (SIPA). |
| ^^warehouse_id | string |  | The ID of the warehouse used for the pharmacy. This is also used as the pharmacy identifier. |
| ^total_count | integer |  | The number of pharmacies returned. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdatePharmacies

Update the pharmacies associated with your shop and their corresponding operational details.

**Path:** `/epharmacy/202504/pharmacies/update`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/update-pharmacies-202504

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
| pharmacies | array<object> |  | The list of pharmacies that belong to a shop. Max count: 20 |
| ^license_expire_time | integer |  | The license expiration time expressed in Unix timestamp (seconds). |
| ^license_number | string |  | The pharmacy license number, known as Surat Izin Apotek (SIA). |
| ^operation_hours | array<object> |  | A list of operational time ranges for the pharmacy. |
| ^^close_time | string |  | The closing time in HH:mm UTC format (24-hour clock). |
| ^^days | array<string> |  | Days of the week when the ePharmacy operates within a specified time range. Possible values: `MON`, `TUE`, ``WED`, `THU`, `FRI`, `SAT`, `SUN`. **Note**: Omitted days will be treated as closed days. |
| ^^open_time | string |  | The opening time in HH:mm UTC format (24-hour clock). |
| ^pharmacist | object |  | The pharmacist assigned to the pharmacy. |
| ^^name | string |  | The name of the pharmacist, known as Apoteker Penanggung Jawab (APJ). |
| ^^practice_license_expire_time | integer |  | The license expiration time expressed in Unix timestamp (seconds). |
| ^^practice_license_number | string |  | The pharmacist practice license number, known as Surat Izin Praktik Apoteker (SIPA). |
| ^warehouse_id | string |  | The ID of the warehouse used for the pharmacy. This is also used as the pharmacy identifier. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^errors | array<object> |  | The list of errors that occurred. |
| ^^code | string |  | The error code. |
| ^^detail | object |  | The details of the error. |
| ^^^warehouse_id | string |  | The warehouse ID where the error occurred. |
| ^^message | string |  | The error message. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## UpdatePrescriptionRequirement

Update the prescription requirement of a product.
Applicable only for Tokopedia products.

**Path:** `/epharmacy/202504/products/{product_id}/prescription_requirements/update`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/update-prescription-requirement-202504

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| product_id | string | Y | The product ID associated with the prescription requirement. |

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
| prescription_requirement | object |  | The prescription requirement. |
| ^needs_prescription | boolean |  | A flag to indicate whether a prescription is required to purchase this product. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetConsultationProvider

Retrieves the provider identifier for the specified consultation.

**Path:** `/epharmacy/202507/consultations/{consultation_id}/providers`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/get-consultation-provider-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| consultation_id | string | Y | TTS consultation identifier |

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
| ^consultation_provider | object |  | The consultation provider. |
| ^^id | string |  | A unique identifier of the service provider associated with the consultation. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
