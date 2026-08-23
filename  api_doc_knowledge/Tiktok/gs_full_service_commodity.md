# TikTok Shop API — gs_full_service_commodity

_สร้างจาก OAS ของ @tts-open-toolkit/cli เมื่อ 2026-08-24 — 36 operations_
_อัปเดต: `tts_open_toolkit update --yes` → `tts_open_toolkit skill add --agent cc --update` → `node scripts/gen-tiktok-api-docs.mjs`_

เวอร์ชันที่มีในหมวดนี้: 202404, 202405, 202406, 202407, 202408, 202410, 202503, 202504, 202507, 202508, 202509

---

## GSFullServicePreviewGetBrands

Use this API to retrieve all product brands n the system.

**Path:** `/gs_full_service_commodity/202404/preview/brands`
**Method:** `GET`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-preview-get-brands-202404

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string |  | Supplier ID |

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
| ^brands | array<object> |  | The structure of the brand. |
| ^^approval_status | string |  | The audit status of the brand. This includes: WAITING: This means the brand is waiting for approval and it can‘t be used to publish the product. PASSED: This means the brand is approved and it can be used to publish the product. REJECTED: This means the brand is rejected and it can‘t be used to publish the product. |
| ^^id | string |  | The ID of the brand. |
| ^^name | string |  | The name of the brand. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetGlobalSellingFullServiceCategories

Use this API to get category list. Note: Product categories change frequently. It is recommended not to cache data locally. Please call the API in real time to obtain the latest category data. When using the outdated category data to create products, the API will return an error. In order to create products for invite-only categories, sellers need to contact account managers and apply for these categories

**Path:** `/gs_full_service_commodity/202404/preview/categories/search`
**Method:** `POST`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/get-global-selling-full-service-categories-202404

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_offset | integer |  | Page number of page query. Start with 1 |
| page_size | integer |  | Number of categories per request, [1,50] The categories of page_size and page_size must not exceed 10,000 |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^categories | array<object> |  | result list |
| ^^id | string |  | The id of category |
| ^^is_leaf | boolean |  | Whether the category is leaf category |
| ^^name_cn | string |  | Chinese name of category |
| ^^name_en | string |  | Engilish name of category |
| ^^parent_id | string |  | The parent id of category |
| ^^status | string |  | The enabled status of category. 2:enabled 3:disabled |
| ^page_offset | integer |  | Page number of page query. Start with 1 |
| ^page_size | integer |  | Number of categories per request, [1,50] The categories of page_size and page_size must not exceed 10,000 |
| ^total_count | integer |  | Total count of the result |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServicePreviewGetcategoryinformation

Get category information

**Path:** `/gs_full_service_commodity/202404/preview/categories/{category_id}`
**Method:** `GET`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-preview-getcategoryinformation-202404

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | ID of the category |

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
| ^first_key_attribute_id | string |  | The first key attribute is used for publishing a product. |
| ^id | string |  | ID of the category |
| ^is_allowed_jit | boolean |  | Whether the category is allowed to publish the product in JIT mode |
| ^is_custom_key_attribute | boolean |  | This category doesn't have key attributes if is_custom is true and users can select any attributes as key attributes when publishing a product. This category has two key attributes if is_custom is false and users must use these two key attributes when publishing a product. |
| ^is_enabled | boolean |  | Whether this category is enabled. If the status is enabled, this category can be used to publish the product. If the status is not enabled, this category can't be used to publish the product. |
| ^is_garment | boolean |  | Whether the category is garment |
| ^is_leaf | boolean |  | Whether it is a leaf category node |
| ^level | integer |  | Category level |
| ^name_en | string |  | Category name in English |
| ^name_zh | string |  | Category name in Chinese |
| ^parent_id | string |  | Parent category id |
| ^second_key_attribute_id | string |  | The second key attribute is used for publishing a product. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServicePreviewGetattributes

Get attributes

**Path:** `/gs_full_service_commodity/202404/preview/categories/{category_id}/attributes`
**Method:** `GET`
**Version:** 202404
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-preview-getattributes-202404

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | ID of the category |

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
| ^attributes | array<object> |  | Attribute relations of category |
| ^^id | string |  | Attribute ID |
| ^^is_mutiple_selection | boolean |  | Indicate whether the attribute value supports multiple selections when creating or editing a product. Notice： is_multiple_selection only applies to product attributes. If is_multiple_selection = true, it means that when listing the product, multiple attribute values can be filled in for that product attribute. |
| ^^is_required | boolean |  | Indicate whether the attribute is required when creating or editing a product. Notice: is_required is only applicable to product attributes. If is_required = true, it means that the product attribute is mandatory when listing the product. |
| ^^name_en | string |  | Attribute names in English |
| ^^name_zh | string |  | Attribute names in Chinese |
| ^^value_type | string |  | Input type of attribute values. The type includes: ENUM: Enumeration type means you can only use the attribute values listed. TEXT: Text type means you can input anything in this attribute input box. ENUM_TEXT: Enumeration and text means you can both use the attribute values listed and input anything in this attribute input box. |
| ^^values | array<object> |  | Attribute values |
| ^^^id | string |  | Attribute value ID |
| ^^^name_en | string |  | Attribute value names in English |
| ^^^name_zh | string |  | Attribute value names in Chinese |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetBrands

Use this API to retrieve all product brands in the system.

**Path:** `/gs_full_service_commodity/202405/beta/brands`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-get-brands-202405

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
| ^brands | array<object> |  |  |
| ^^approval_status | string |  |  |
| ^^id | string |  |  |
| ^^name | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceSearchCategories

Use this API to get category list. Note: Product categories change frequently. It is recommended not to cache data locally. Please call the API in real time to obtain the latest category data. When using the outdated category data to create products, the API will return an error. In order to create products for invite-only categories, sellers need to contact account managers and apply for these categories

**Path:** `/gs_full_service_commodity/202405/beta/categories/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-search-categories-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_offset | integer |  | The offset of page. |
| page_size | integer |  | The number of results to be returned per page.  Range: 1-100. |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^categories | array<object> |  | List |
| ^^id | string |  | ID of category |
| ^^is_leaf | boolean |  | Whether the category node is leaf node |
| ^^name_cn | string |  | Chinese name of the category node |
| ^^name_en | string |  | English name of the category node |
| ^^parent_id | string |  | Parent id of a category |
| ^^status | string |  | The status of a category node. 2:enabled;3:disabled |
| ^^version | string |  | The version ID of the category tree. Possible values: - `v1`: A 3-level category tree. - `v2`: A 7-level category tree. For details about the category expansion, see [Category Expansion L7 Migration Guide](https://partner.tiktokshop.com/docv2/page/6660c33275ead002e4f877f5). |
| ^page_offset | integer |  | The offset of page. |
| ^page_size | integer |  | The number of results to be returned per page.  Range: 1-100. |
| ^total_count | integer |  | The number of categories returned. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetCategoryinformation

Get category information

**Path:** `/gs_full_service_commodity/202405/beta/categories/{category_id}`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-get-categoryinformation-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y |  |

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
| ^first_key_attribute_id | string |  |  |
| ^id | string |  |  |
| ^is_allowed_jit | boolean |  |  |
| ^is_custom_key_attribute | boolean |  |  |
| ^is_enabled | boolean |  |  |
| ^is_garment | boolean |  |  |
| ^is_leaf | boolean |  |  |
| ^level | integer |  |  |
| ^name_en | string |  |  |
| ^name_zh | string |  |  |
| ^parent_id | string |  |  |
| ^second_key_attribute_id | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetattributes

GS Full Service Get attributes

**Path:** `/gs_full_service_commodity/202405/beta/categories/{category_id}/attributes`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-getattributes-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | ID of the category |

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
| ^attributes | array<object> |  | Attribute relations of category |
| ^^id | string |  | Attribute ID |
| ^^is_mutiple_selection | boolean |  | Indicate whether the attribute value supports multiple selections when creating or editing a product. Notice： is_multiple_selection only applies to product attributes. If is_multiple_selection = true, it means that when listing the product, multiple attribute values can be filled in for that product attribute. |
| ^^is_required | boolean |  | Indicate whether the attribute is required when creating or editing a product. Notice: is_required is only applicable to product attributes. If is_required = true, it means that the product attribute is mandatory when listing the product. |
| ^^name_en | string |  | Attribute names in English |
| ^^name_zh | string |  | Attribute names in Chinese |
| ^^type | string |  | Type of attribute. The type includes: BASE: Enumeration type means the basic attributes of the product, such as quantity, weight, volume. SALE: Enumeration type means you can use the attributes as key attributes in "GS Create Product v2". OTHER: Enumeration type means the attributes which are used to describe the product, such as recommend_ages. |
| ^^value_type | string |  | Input type of attribute values. The type includes: ENUM: Enumeration type means you can only use the attribute values listed. SINGLETEXT: Text type means you can input anything in this attribute input box. ENUM_TEXT: Enumeration and text means you can both use the attribute values listed and input anything in this attribute input box. |
| ^^values | array<object> |  | Attribute values |
| ^^^id | string |  | Attribute value ID |
| ^^^name_en | string |  | Attribute value names in English |
| ^^^name_zh | string |  | Attribute value names in Chinese |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSProductimageuploadrequirementsquery

Description of [POST]/gs_full_service_commodity/:version/GS:_Product_image_upload_requirements_query

**Path:** `/gs_full_service_commodity/202405/beta/categories/{category_id}/image_upload_requirements`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsproductimageuploadrequirementsquery-202405

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y |  |

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
| ^image_upload_requirements | array<object> |  |  |
| ^^config_details | array<object> |  |  |
| ^^^is_required | boolean |  |  |
| ^^^length_max | integer |  |  |
| ^^^length_min | integer |  |  |
| ^^^length_rate | integer |  |  |
| ^^^material_show_type | string |  |  |
| ^^^material_use_type | array<object> |  |  |
| ^^^^code | string |  |  |
| ^^^^is_required | boolean |  |  |
| ^^^^quantity_ceiling | integer |  |  |
| ^^^^quantity_floor | integer |  |  |
| ^^^max_size | integer |  |  |
| ^^^quantity_ceiling | integer |  |  |
| ^^^quantity_floor | integer |  |  |
| ^^^width_max | integer |  |  |
| ^^^width_min | integer |  |  |
| ^^^width_rate | integer |  |  |
| ^^pic_set_type | array<string> |  |  |
| ^pic_upload_way_configs | array<string> |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSQualificationfileupload

Description of [POST]/gs_full_service_commodity/:version/GS：Qualification_file_upload

**Path:** `/gs_full_service_commodity/202405/beta/certification_files/upload`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsqualificationfileupload-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^uri | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCreateProductv2

Description of /gs_full_service_commodity/:version/products

**Path:** `/gs_full_service_commodity/202405/beta/products`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-productv2-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotent_key | string |  |  |
| spu | object |  |  |
| ^attributes | array<object> |  |  |
| ^^id | string |  |  |
| ^^values | array<object> |  |  |
| ^^^id | string |  |  |
| ^^^name | string |  |  |
| ^brand_id | string |  |  |
| ^category_id | string |  |  |
| ^certifications | array<object> |  |  |
| ^^items | array<object> |  |  |
| ^^^files | array<object> |  |  |
| ^^^^uri | string |  |  |
| ^^^type | string |  |  |
| ^^type | string |  |  |
| ^first_key_attribute_id | string |  |  |
| ^grading_template_id | string |  |  |
| ^ingredient | object |  |  |
| ^^multi_material_composition | array<object> |  |  |
| ^^^component | object |  |  |
| ^^^^property_value_id | string |  |  |
| ^^^ingredients | array<object> |  |  |
| ^^^^percentage | string |  |  |
| ^^^^property_value_id | string |  |  |
| ^^single_material_composition | array<object> |  |  |
| ^^^percentage | string |  |  |
| ^^^property_value_id | string |  |  |
| ^^type | string |  |  |
| ^media | object |  |  |
| ^^pic_set_type | string |  |  |
| ^^pic_type | string |  |  |
| ^^pictures | array<object> |  |  |
| ^^^material_show_type | string |  |  |
| ^^^material_use_type_code | string |  |  |
| ^^^sequence | integer |  |  |
| ^^^uri | string |  |  |
| ^^videos | array<object> |  |  |
| ^^^uri | string |  |  |
| ^product_name_en | string |  |  |
| ^product_name_zh | string |  |  |
| ^second_key_attribute_id | string |  |  |
| ^size_group_id | string |  |  |
| ^skcs | array<object> |  |  |
| ^^external_skc_code | string |  |  |
| ^^first_key_attribute_value_id | string |  |  |
| ^^first_key_attribute_value_name | string |  |  |
| ^^pictures | array<object> |  |  |
| ^^^material_show_type | string |  |  |
| ^^^material_use_type_code | string |  |  |
| ^^^sequence | integer |  |  |
| ^^^uri | string |  |  |
| ^^skus | array<object> |  |  |
| ^^^dimensions | object |  |  |
| ^^^^height | string |  |  |
| ^^^^length | string |  |  |
| ^^^^unit | string |  |  |
| ^^^^width | string |  |  |
| ^^^external_sku_code | string |  |  |
| ^^^inventory | integer |  |  |
| ^^^pictures | array<object> |  |  |
| ^^^^material_show_type | string |  |  |
| ^^^^material_use_type_code | string |  |  |
| ^^^^sequence | integer |  |  |
| ^^^^uri | string |  |  |
| ^^^price | object |  |  |
| ^^^^amount | string |  |  |
| ^^^^currency | string |  |  |
| ^^^second_key_attribute_value_id | string |  |  |
| ^^^second_key_attribute_value_name | string |  |  |
| ^^^stockup_mode | string |  |  |
| ^^^weight | object |  |  |
| ^^^^unit | string |  |  |
| ^^^^value | string |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^spu_code | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSVideoUpload

Description of [POST]/gs_full_service_commodity/:version/GS:_Video_Upload

**Path:** `/gs_full_service_commodity/202405/beta/videos/upload`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gsvideo-upload-202405

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^uri | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## Getgradingtemplatesconfig

Obtain size groups and size chart information for different categories of products, and synchronize size group information when creating a new promotion

**Path:** `/gs_full_service_commodity/202405/preview/grading_templates`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/getgradingtemplatesconfig-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | identity ID of supplier |

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
| ^grading_templates | array<object> |  | Struct List of grading templates , including id and name information |
| ^^id | string |  | Size Chart Template Id |
| ^^name | string |  | Size Chart Template Name |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## imageupload

Upload local images to the GS fully managed platform and use them for product images, SKU images, etc. to publish products.

**Path:** `/gs_full_service_commodity/202405/preview/images/upload`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/imageupload-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | identity ID of supplier |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  | The image file data to be uploaded to GS fully managed. The image file is a string generated by binary. Format requirements: JPG, JPEG, PNG Image pixels should be at least 100 * 100 and up to 20,000 * 20,000. Maximum size of original image: 5MB |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^height | integer |  | Height dimension of the image which is determined on upload. This is the height post processing. |
| ^uri | string |  | The URI returned from uploading the image, which can be used for product main image, SKU image, size chart image, qualification image, etc. when listing a product. |
| ^url | string |  | The URL returned from uploading the image can be directly opened in a browser. It can be used in product description when creating a product. |
| ^width | integer |  | Width dimension of the image which is determined on upload. This is the width of post processing. |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCreateProduct

Create a new product and push the seller's product information to the GS full service platform

**Path:** `/gs_full_service_commodity/202405/preview/products`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-product-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | ID of seller |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| spu | object |  | SPU Details |
| ^attributes | array<object> |  | Product attributes |
| ^^id | string |  | Attribute id |
| ^^values | array<object> |  | Property value list |
| ^^^id | string |  | Attribute value id |
| ^^^name | string |  | Attribute value name If the attribute value type is enumeration + text inputtable, fill in this field when you need to customize the input text. |
| ^brand_id | string |  | Brand ID |
| ^category_id | string |  | Product category, leaf category id |
| ^certifications | array<object> |  | certifications information |
| ^^items | array<object> |  | Qualification records |
| ^^^files | array<object> |  | Qualification document information |
| ^^^^name | string |  | Oec file name |
| ^^^^uri | string |  | File uri |
| ^^^type | string |  | Qualification type eg: CEDOC |
| ^^type | string |  | Type,  fill in according to category requirements |
| ^first_key_attribute_id | string |  | Key Attribute 1 ID |
| ^grading_template_id | string |  | Size Chart Template ID |
| ^ingredient | object |  | Ingredient information |
| ^^multi_material_composition | array<object> |  | Multi-component composition |
| ^^^component | object |  | component |
| ^^^^property_value_id | string |  | Location attribute value id |
| ^^^ingredients | array<object> |  | ingredients |
| ^^^^percentage | string |  | Percentage |
| ^^^^property_value_id | string |  | Component attribute value id |
| ^^single_material_composition | array<object> |  | Single material composition |
| ^^^percentage | string |  | Percentage |
| ^^^property_value_id | string |  | Component attribute value id |
| ^^type | string |  | Ingredient type -SINGLE -MULTI_COMPONENT |
| ^media | object |  | Product SPU Picture Information |
| ^^pic_set_type | string |  | Picture set type, fill in according to category requirements -Skc -SpuWithSkc -SpuWithSku |
| ^^pic_type | string |  | Image type , it is recommended to upload photographic pictures, and upload pictures as required -Selection -Photography |
| ^^pictures | array<object> |  | SPU Picture |
| ^^^material_show_type | string |  | material show type，fill in according to category requirements -Carousel -Preview -Color |
| ^^^material_use_type_code | string |  | Carousel image subtype, fill in according to category requirements, for example: first image, back image, detail image |
| ^^^sequence | integer |  | Image sorting (small number in front) |
| ^^^uri | string |  | File uri |
| ^^videos | array<object> |  | Product video information |
| ^^^uri | string |  | File uri |
| ^product_name_en | string |  | Product name (English) |
| ^product_name_zh | string |  | Product name (Chinese) |
| ^second_key_attribute_id | string |  | Key Attribute 2 ID |
| ^size_group_id | string |  | Size group id, fill in according to category requirements |
| ^skcs | array<object> |  | SKC/SKU Information |
| ^^external_skc_code | string |  | SKC item code |
| ^^first_key_attribute_value_id | string |  | Key attribute 1 attribute value ID, fill in according to the enumeration value contained under the key attribute |
| ^^first_key_attribute_value_name | string |  | Key attribute 1, attribute value name. If the key attribute supports customization, fill in the key attribute name if customization is required. |
| ^^pictures | array<object> |  | SKC images |
| ^^^material_show_type | string |  | material show type，fill in according to category requirements -Carousel -Preview -Color |
| ^^^material_use_type_code | string |  | Carousel image subtype, fill in according to category requirements, for example: first image, back image, detail image |
| ^^^sequence | integer |  | Image sorting (small size in front) |
| ^^^uri | string |  | File uri |
| ^^skus | array<object> |  | SKU information |
| ^^^dimensions | object |  | dimensions |
| ^^^^height | string |  | height |
| ^^^^length | string |  | length |
| ^^^^unit | string |  | unit，Currently only supports millimeters -MILLIMETER |
| ^^^^width | string |  | width |
| ^^^external_sku_code | string |  | SKU item code |
| ^^^inventory | integer |  | Stock quantity |
| ^^^pictures | array<object> |  | Picture |
| ^^^^material_show_type | string |  | material show type，fill in according to category requirements -Carousel -Preview -Color |
| ^^^^material_use_type_code | string |  | Carousel image subtype, fill in according to category requirements, for example: first image, back image, detail image |
| ^^^^sequence | integer |  | Image sorting (small size in front) |
| ^^^^uri | string |  | File uri |
| ^^^price | object |  | SKU price |
| ^^^^amount | string |  | Price (excluding tax), unit yuan |
| ^^^^currency | string |  | Currently only supports Renminbi -CNY |
| ^^^second_key_attribute_value_id | string |  | Key attribute 1 attribute value ID, fill in according to the enumeration value contained under the key attribute |
| ^^^second_key_attribute_value_name | string |  | Key attribute 1, attribute value name. If the key attribute supports customization, fill in the key attribute name if customization is required. |
| ^^^stockup_mode | string |  | Stockup mode, fill in according to category requirements and whether the merchant supports JIT -NORMAL -JIT |
| ^^^weight | object |  | weight |
| ^^^^unit | string |  | unit，Currently only supports milligrams -MILLIGRAM |
| ^^^^value | string |  | weight value |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^spu_code | string |  | Spu code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## QuerySKUsandtheapprovalstatusofSKUs

Query SKUs and the approval status of SKUs

**Path:** `/gs_full_service_commodity/202405/preview/products/search`
**Method:** `POST`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/query-skusandtheapprovalstatusof-skus-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| supplier_id | string | Y | identity ID of supplier |

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| external_sku_codes | array<string> |  | The SkU code of the external , upper limit 10 Only one platform SPU code, platform SKU code, and external sku code  can be filled in at a time for a query |
| page_size | integer |  | page size of each query request |
| page_token | string |  | page token |
| platform_sku_codes | array<string> |  | The Sku code of the platform , upper limit 10 Only one platform SPU code, platform SKU code, and external sku code  can be filled in at a time for a query |
| platform_spu_codes | array<string> |  | The SPU code of the platform, through SPU search, will return all SKUs under the SPU , upper limit 10 Only one platform SPU code, platform SKU code, and external sku code  can be filled in at a time for a query |
| push_time_ge | integer |  | Payment start timestamp (in seconds) |
| push_time_lt | integer |  | Payment end timestamp (in seconds) |
| sku_status | string |  | SKU status -BUYER_SELECTING -GNE_SELECTING -ELIMINATED -WAIT_DELIVERY_SAMPLE -PATTERNING -MODIFY_DATA -PRICING -WAIT_PRICE_CONFIRM -WAIT_ORDER -CAN_NOT_ORDER -ORDERED -ON_SHELF -OFF_SHELF -CANCELED |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  | page token of next page , use in next request |
| ^spus | array<object> |  | list of spus information |
| ^^skus | array<object> |  | list of skus information |
| ^^^code | string |  | sku code |
| ^^^external_sku_code | string |  | Product SKU number (merchant SKU unique identification) |
| ^^^reject_reason | string |  | Reason for rejection |
| ^^^status | string |  | SKU status -BUYER_SELECTING -GNE_SELECTING -ELIMINATED -WAIT_DELIVERY_SAMPLE -PATTERNING -MODIFY_DATA -PRICING -WAIT_PRICE_CONFIRM -WAIT_ORDER -CAN_NOT_ORDER -ORDERED -ON_SHELF -OFF_SHELF -CANCELED |
| ^^^update_time | integer |  | Status update timestamp |
| ^^spu_code | string |  | spu code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## Getsizegroupsconfig

Obtain size group and size chart information for different categories of products. When creating a new promotion, you need to synchronize the size group information.

**Path:** `/gs_full_service_commodity/202405/preview/size_groups`
**Method:** `GET`
**Version:** 202405
**Docs:** https://partner.tiktokshop.com/docv2/page/getsizegroupsconfig-202405

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | leaf category id |

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
| ^size_grading_required | boolean |  | Is it necessary to maintain a size chart for the category? If it is (true), please maintain a grading template in the promotion interface |
| ^size_groups | array<object> |  | 1. If the category includes size groups, please fill in the size group ID when promoting products 2. When filling in key_attributes for product promotion, it is necessary to fill in the corresponding size attribute values under the size group |
| ^^id | string |  | Size groups id |
| ^^name | string |  | Size groups name |
| ^^size_segments | array<object> |  | Size segments list |
| ^^^size_codes | array<string> |  | Size segments codes |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetCertifications

Get Global Selling certifications by categories

**Path:** `/gs_full_service_commodity/202406/beta/categories/{category_id}/certifications`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-get-certifications-202406

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | Category id of Global Sellling. |

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
| ^certifications | array<object> |  | The list of certifications |
| ^^description | string |  | The certification description |
| ^^is_required | boolean |  | Whether the certification is required for this category |
| ^^qualifications | array<object> |  | The list of qualifications |
| ^^^description | string |  | The qualification description |
| ^^^example_url | string |  | Example urls of qualifications |
| ^^^file_types | array<string> |  | The supported file types of the certifications |
| ^^^max_file_count | integer |  | The max count of files |
| ^^^type | string |  | The qualification type |
| ^^region_code | string |  | The region code |
| ^^type | string |  | The certification type |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetgradingtemplatesconfigV2

Obtain size groups and size chart information for different categories of products, and synchronize size group information when creating a new promotion

**Path:** `/gs_full_service_commodity/202406/beta/grading_templates`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/gsgetgradingtemplatesconfig-v2-202406

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
| ^grading_templates | array<object> |  |  |
| ^^id | string |  |  |
| ^^name | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSImageUploadV2

Upload local images to the GS fully managed platform and use them for product images, SKU images, etc. to publish products.

**Path:** `/gs_full_service_commodity/202406/beta/images/upload`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/gsimage-upload-v2-202406

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: multipart/form-data |

### Request Body (`multipart/form-data`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| data | file |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^length | integer |  |  |
| ^uri | string |  |  |
| ^url | string |  |  |
| ^width | integer |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSQuerySKUsandtheapprovalstatusofSKUsV2

Query SKUs and the approval status of SKUs

**Path:** `/gs_full_service_commodity/202406/beta/products/search`
**Method:** `POST`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/gsquery-skusandtheapprovalstatusof-skus-v2-202406

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| external_sku_codes | array<string> |  |  |
| page_size | integer |  |  |
| page_token | string |  |  |
| platform_sku_codes | array<string> |  |  |
| platform_spu_codes | array<string> |  |  |
| push_time_ge | integer |  |  |
| push_time_lt | integer |  |  |
| sku_status | string |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  |  |
| ^spus | array<object> |  |  |
| ^^skus | array<object> |  |  |
| ^^^code | string |  |  |
| ^^^external_sku_code | string |  |  |
| ^^^reject_reason | string |  |  |
| ^^^status | string |  |  |
| ^^^update_time | integer |  |  |
| ^^spu_code | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetsizegroupsconfigV2

Obtain size group and size chart information for different categories of products. When creating a new promotion, you need to synchronize the size group information.

**Path:** `/gs_full_service_commodity/202406/beta/size_groups`
**Method:** `GET`
**Version:** 202406
**Docs:** https://partner.tiktokshop.com/docv2/page/gsgetsizegroupsconfig-v2-202406

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y |  |

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
| ^size_grading_required | boolean |  |  |
| ^size_groups | array<object> |  |  |
| ^^id | string |  |  |
| ^^name | string |  |  |
| ^^size_segments | array<object> |  |  |
| ^^^size_codes | array<string> |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GlobalSellingGetSupplierAddresses

This API is used to query supplier addresses

**Path:** `/gs_full_service_commodity/202407/supplier_addresses`
**Method:** `GET`
**Version:** 202407
**Docs:** https://partner.tiktokshop.com/docv2/page/global-selling-get-supplier-addresses-202407

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | Page offset |
| page_size | integer |  | Page size,  default 10,  less or equal to 50 |

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
| ^addresses | array<object> |  | Address Information |
| ^^contact_name | string |  | Contact name |
| ^^detail | object |  | The address by level |
| ^^^building | string |  | The detailed address under town |
| ^^^city_name | string |  | City |
| ^^^country_name | string |  | Country |
| ^^^district_name | string |  | District |
| ^^^province_name | string |  | Province |
| ^^^town_name | string |  | Town |
| ^^full_address | string |  | The detailed address |
| ^^id | string |  | The ID of address |
| ^^phone_number | string |  | The phone number of the contact |
| ^next_page_token | string |  | The next page encode |
| ^total_count | integer |  | The count of addresses |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GetSizeGroups

Obtain size group and size chart information for different categories of products. When creating a new promotion, you need to synchronize the size group information

**Path:** `/gs_full_service_commodity/202408/size_groups`
**Method:** `GET`
**Version:** 202408
**Docs:** https://partner.tiktokshop.com/docv2/page/get-size-groups-202408

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | leaf category id |

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
| ^size_grading_data | object |  | category size grading info |
| ^^size_grading_required | boolean |  | is it necessary to maintain a size chart for the category? If it is (true), please maintain a grading template in the promotion interface |
| ^^size_groups | array<object> |  | 1. If the category includes size groups, please fill in the size group ID when promoting products 2. When filling in key_attributes for product promotion, it is necessary to fill in the corresponding size attribute values under the size group |
| ^^^id | string |  | Size groups id |
| ^^^name | string |  | Size groups name |
| ^^^size_segements | array<object> |  | Size segments list |
| ^^^^size_code | string |  | Size segments codes |
| ^^^^size_id | string |  | Size segments ids |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCreateProductv2

Description of /gs_full_service_commodity/:version/products

**Path:** `/gs_full_service_commodity/202410/beta/products`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-productv2-202410

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotent_key | string |  |  |
| spu | object |  |  |
| ^attributes | array<object> |  |  |
| ^^id | string |  |  |
| ^^values | array<object> |  |  |
| ^^^id | string |  |  |
| ^^^name | string |  |  |
| ^brand_id | string |  |  |
| ^category_id | string |  |  |
| ^certifications | array<object> |  |  |
| ^^items | array<object> |  |  |
| ^^^files | array<object> |  |  |
| ^^^^uri | string |  |  |
| ^^^type | string |  |  |
| ^^type | string |  |  |
| ^description | object |  |  |
| ^^items | array<object> |  |  |
| ^^^sequence | integer |  |  |
| ^^^type | string |  |  |
| ^^^uri | string |  |  |
| ^first_key_attribute_id | string |  |  |
| ^grading_template_id | string |  |  |
| ^ingredient | object |  |  |
| ^^multi_material_composition | array<object> |  |  |
| ^^^component | object |  |  |
| ^^^^property_value_id | string |  |  |
| ^^^ingredients | array<object> |  |  |
| ^^^^percentage | string |  |  |
| ^^^^property_value_id | string |  |  |
| ^^single_material_composition | array<object> |  |  |
| ^^^percentage | string |  |  |
| ^^^property_value_id | string |  |  |
| ^^type | string |  |  |
| ^media | object |  |  |
| ^^pic_set_type | string |  |  |
| ^^pic_type | string |  |  |
| ^^pictures | array<object> |  |  |
| ^^^material_show_type | string |  |  |
| ^^^material_use_type_code | string |  |  |
| ^^^sequence | integer |  |  |
| ^^^uri | string |  |  |
| ^^videos | array<object> |  |  |
| ^^^uri | string |  |  |
| ^product_name_en | string |  |  |
| ^product_name_zh | string |  |  |
| ^second_key_attribute_id | string |  |  |
| ^size_group_id | string |  |  |
| ^skcs | array<object> |  |  |
| ^^external_skc_code | string |  |  |
| ^^first_key_attribute_value_id | string |  |  |
| ^^first_key_attribute_value_name | string |  |  |
| ^^pictures | array<object> |  |  |
| ^^^material_show_type | string |  |  |
| ^^^material_use_type_code | string |  |  |
| ^^^sequence | integer |  |  |
| ^^^uri | string |  |  |
| ^^skus | array<object> |  |  |
| ^^^dimensions | object |  |  |
| ^^^^height | string |  |  |
| ^^^^length | string |  |  |
| ^^^^unit | string |  |  |
| ^^^^width | string |  |  |
| ^^^external_sku_code | string |  |  |
| ^^^inventory | integer |  |  |
| ^^^pictures | array<object> |  |  |
| ^^^^material_show_type | string |  |  |
| ^^^^material_use_type_code | string |  |  |
| ^^^^sequence | integer |  |  |
| ^^^^uri | string |  |  |
| ^^^price | object |  |  |
| ^^^^amount | string |  |  |
| ^^^^currency | string |  |  |
| ^^^reference_sale_price | object |  |  |
| ^^^^amount | string |  |  |
| ^^^^currency | string |  |  |
| ^^^sale_price_certificates | array<object> |  |  |
| ^^^^uri | string |  |  |
| ^^^second_key_attribute_value_id | string |  |  |
| ^^^second_key_attribute_value_name | string |  |  |
| ^^^stockup_mode | string |  |  |
| ^^^weight | object |  |  |
| ^^^^unit | string |  |  |
| ^^^^value | string |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^spu_code | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSQuerySKUsandtheapprovalstatusofSKUsV2

Query SKUs and the approval status of SKUs

**Path:** `/gs_full_service_commodity/202410/beta/products/search`
**Method:** `POST`
**Version:** 202410
**Docs:** https://partner.tiktokshop.com/docv2/page/gsquery-skusandtheapprovalstatusof-skus-v2-202410

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| external_sku_codes | array<string> |  |  |
| page_size | integer |  |  |
| page_token | string |  |  |
| platform_sku_codes | array<string> |  |  |
| platform_spu_codes | array<string> |  |  |
| push_time_ge | integer |  |  |
| push_time_lt | integer |  |  |
| sku_status | string |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  |  |
| ^spus | array<object> |  |  |
| ^^skus | array<object> |  |  |
| ^^^code | string |  |  |
| ^^^external_sku_code | string |  |  |
| ^^^reject_reason | string |  |  |
| ^^^status | string |  |  |
| ^^^update_time | integer |  |  |
| ^^spu_code | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetattributes

GS Full Service Get attributes

**Path:** `/gs_full_service_commodity/202503/beta/categories/{category_id}/attributes`
**Method:** `GET`
**Version:** 202503
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-getattributes-202503

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | ID of the category |

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
| ^attributes | array<object> |  | Attribute relations of category |
| ^^id | string |  | Attribute ID |
| ^^is_mutiple_selection | boolean |  | Indicate whether the attribute value supports multiple selections when creating or editing a product. Notice： is_multiple_selection only applies to product attributes. If is_multiple_selection = true, it means that when listing the product, multiple attribute values can be filled in for that product attribute. |
| ^^is_required | boolean |  | Indicate whether the attribute is required when creating or editing a product. Notice: is_required is only applicable to product attributes. If is_required = true, it means that the product attribute is mandatory when listing the product. |
| ^^name_en | string |  | Attribute names in English |
| ^^name_zh | string |  | Attribute names in Chinese |
| ^^required_regions | array<string> |  | Description of whether the attributes in different regions are required or not. For example, the required_regions contains GB which means the attribute is required in GB |
| ^^type | string |  | Type of attribute. The type includes: BASE: Enumeration type means the basic attributes of the product, such as quantity, weight, volume. SALE: Enumeration type means you can use the attributes as key attributes in "GS Create Product v2". OTHER: Enumeration type means the attributes which are used to describe the product, such as recommend_ages. |
| ^^value_type | string |  | Input type of attribute values. The type includes: ENUM: Enumeration type means you can only use the attribute values listed. SINGLETEXT: Text type means you can input anything in this attribute input box. ENUM_TEXT: Enumeration and text means you can both use the attribute values listed and input anything in this attribute input box. |
| ^^values | array<object> |  | Attribute values |
| ^^^id | string |  | Attribute value ID |
| ^^^name_en | string |  | Attribute value names in English |
| ^^^name_zh | string |  | Attribute value names in Chinese |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSQuerySKUsandtheapprovalstatusofSKUsV2

Query SKUs and the approval status of SKUs

**Path:** `/gs_full_service_commodity/202504/beta/products/search`
**Method:** `POST`
**Version:** 202504
**Docs:** https://partner.tiktokshop.com/docv2/page/gsquery-skusandtheapprovalstatusof-skus-v2-202504

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| external_sku_codes | array<string> |  |  |
| page_size | integer |  |  |
| page_token | string |  |  |
| platform_sku_codes | array<string> |  |  |
| platform_spu_codes | array<string> |  |  |
| push_time_ge | integer |  |  |
| push_time_lt | integer |  |  |
| sku_status | string |  |  |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^next_page_token | string |  |  |
| ^spus | array<object> |  |  |
| ^^skus | array<object> |  |  |
| ^^^code | string |  |  |
| ^^^external_sku_code | string |  |  |
| ^^^reject_reason | string |  |  |
| ^^^status | string |  |  |
| ^^^update_time | integer |  |  |
| ^^spu_code | string |  |  |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetattributes

GS Full Service Get attributes

**Path:** `/gs_full_service_commodity/202507/beta/categories/{category_id}/attributes`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-getattributes-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | ID of the category |

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
| ^attributes | array<object> |  | Attribute relations of category |
| ^^id | string |  | Attribute ID |
| ^^is_mutiple_selection | boolean |  | Indicate whether the attribute value supports multiple selections when creating or editing a product. Notice： is_multiple_selection only applies to product attributes. If is_multiple_selection = true, it means that when listing the product, multiple attribute values can be filled in for that product attribute. |
| ^^is_required | boolean |  | Indicate whether the attribute is required when creating or editing a product. Notice: is_required is only applicable to product attributes. If is_required = true, it means that the product attribute is mandatory when listing the product. |
| ^^name_en | string |  | Attribute names in English |
| ^^name_zh | string |  | Attribute names in Chinese |
| ^^required_regions | array<string> |  | Description of whether the attributes in different regions are required or not. For example, the required_regions contains GB which means the attribute is required in GB |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the product attribute is required based on the seller's inputs for other attributes. If any of the conditions is met, the attribute is required; otherwise, it is optional. For example, there's a condition that states that the "Battery type" attribute is required if the seller selects the value "Batteries" for the attribute "Contains Batteries or Cells?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide - CAT-PRE-HAZMAT](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `type=PRODUCT_PROPERTY`, `is_required=false, and `required_regions` is empty. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_ids | array<string> |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^type | string |  | Type of attribute. The type includes: BASE: Enumeration type means the basic attributes of the product, such as quantity, weight, volume. SALE: Enumeration type means you can use the attributes as key attributes in "GS Create Product v2". OTHER: Enumeration type means the attributes which are used to describe the product, such as recommend_ages. |
| ^^value_type | string |  | Input type of attribute values. The type includes: ENUM: Enumeration type means you can only use the attribute values listed. SINGLETEXT: Text type means you can input anything in this attribute input box. ENUM_TEXT: Enumeration and text means you can both use the attribute values listed and input anything in this attribute input box. |
| ^^values | array<object> |  | Attribute values |
| ^^^id | string |  | Attribute value ID |
| ^^^name_en | string |  | Attribute value names in English |
| ^^^name_zh | string |  | Attribute value names in Chinese |
| ^region_attributes | array<object> |  | A list of product attributes config in different regions |
| ^^attributes | array<object> |  | Attribute relations of category |
| ^^^id | string |  | Attribute ID |
| ^^^is_mutiple_selection | boolean |  | Indicate whether the attribute value supports multiple selections when creating or editing a product. Notice： is_multiple_selection only applies to product attributes. If is_multiple_selection = true, it means that when listing the product, multiple attribute values can be filled in for that product attribute. |
| ^^^is_required | boolean |  | Indicate whether the attribute is required when creating or editing a product. Notice: is_required is only applicable to product attributes. If is_required = true, it means that the product attribute is mandatory when listing the product. |
| ^^^name_en | string |  | Attribute value names in English |
| ^^^name_zh | string |  | Attribute value names in Chinese |
| ^^^requirement_conditions | array<object> |  | A list of conditions that determine if the product attribute is required based on the seller's inputs for other attributes. If any of the conditions is met, the attribute is required; otherwise, it is optional. For example, there's a condition that states that the "Battery type" attribute is required if the seller selects the value "Batteries" for the attribute "Contains Batteries or Cells?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide - CAT-PRE-HAZMAT](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `type=PRODUCT_PROPERTY`, `is_required=false, and `required_regions` is empty. |
| ^^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^^attribute_value_ids | array<string> |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^^type | string |  | Type of attribute. The type includes: BASE: Enumeration type means the basic attributes of the product, such as quantity, weight, volume. SALE: Enumeration type means you can use the attributes as key attributes in "GS Create Product v2". OTHER: Enumeration type means the attributes which are used to describe the product, such as recommend_ages. |
| ^^^value_type | string |  | Input type of attribute values. The type includes: ENUM: Enumeration type means you can only use the attribute values listed. SINGLETEXT: Text type means you can input anything in this attribute input box. ENUM_TEXT: Enumeration and text means you can both use the attribute values listed and input anything in this attribute input box. |
| ^^^values | array<object> |  | Attribute values |
| ^^^^id | string |  | Attribute value ID |
| ^^^^name_en | string |  | Attribute value names in English |
| ^^^^name_zh | string |  | Attribute value names in Chinese |
| ^^region | string |  | region code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSFullServiceGetCertifications

Get Global Selling certifications by categories

**Path:** `/gs_full_service_commodity/202507/beta/categories/{category_id}/certifications`
**Method:** `GET`
**Version:** 202507
**Docs:** https://partner.tiktokshop.com/docv2/page/gsfull-service-get-certifications-202507

### Path Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| category_id | string | Y | Category id of Global Sellling. |

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
| ^certifications | array<object> |  | The list of certifications |
| ^^description | string |  | The certification description |
| ^^is_required | boolean |  | Whether the certification is required for this category |
| ^^qualifications | array<object> |  | The list of qualifications |
| ^^^description | string |  | The qualification description |
| ^^^example_url | string |  | Example urls of qualifications |
| ^^^file_types | array<string> |  | The supported file types of the certifications |
| ^^^max_file_count | integer |  | The max count of files |
| ^^^type | string |  | The qualification type |
| ^^region_code | string |  | The region code |
| ^^requirement_conditions | array<object> |  | A list of conditions that determine if the product certification is required based on the seller's inputs for other attributes. If any of the conditions is met, the certification is required; otherwise, it is optional. For example, there's a condition that states that the "Safety Data Sheet (SDS) for flammable materials" certification is required if the seller selects the value "Yes" for the attribute "Flammable Liquid?". For more scenario-based guidance on using this parameter, refer to the [Solution Guide - CAT-PRE-HAZMAT](https://partner.tiktokshop.com/openlearn/guide/usecase?parent_id=7256668359046153985). Applicable only if `is_required=false`. |
| ^^^attribute_id | string |  | The ID of the product attribute that is being evaluated by the condition. |
| ^^^attribute_value_ids | array<string> |  | The ID of the product attribute value that must match the seller's input for the condition to be true. |
| ^^type | string |  | The certification type |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCreateProductv2

Description of /gs_full_service_commodity/:version/products

**Path:** `/gs_full_service_commodity/202508/beta/products`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-productv2-202508

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotent_key | string |  | idempotent key |
| spu | object |  | spu info |
| ^attributes | array<object> |  | product attributes |
| ^^id | string |  | id of attribute |
| ^^values | array<object> |  | value of attribute |
| ^^^id | string |  | id of attribute value |
| ^^^name | string |  | name of attribute value |
| ^brand_id | string |  | id of brand |
| ^category_id | string |  | id of category |
| ^certifications | array<object> |  | certifications |
| ^^items | array<object> |  | certifications |
| ^^^files | array<object> |  | files |
| ^^^^uri | string |  | uri of file |
| ^^^type | string |  | type |
| ^^type | string |  | type |
| ^description | object |  | description |
| ^^items | array<object> |  | description |
| ^^^sequence | integer |  | sequence |
| ^^^type | string |  | type |
| ^^^uri | string |  | uri |
| ^first_key_attribute_id | string |  | first key attribute id |
| ^grading_template_id | string |  | grading template id |
| ^ingredient | object |  | ingredient |
| ^^multi_material_composition | array<object> |  | multi material composition |
| ^^^component | object |  | component |
| ^^^^property_value_id | string |  | property value id |
| ^^^ingredients | array<object> |  | ingredients |
| ^^^^percentage | string |  | percentage |
| ^^^^property_value_id | string |  | property value id |
| ^^single_material_composition | array<object> |  | single material composition |
| ^^^percentage | string |  | percentage |
| ^^^property_value_id | string |  | property value id |
| ^^type | string |  | type |
| ^manufacture_ids | array<string> |  | manufacture ids |
| ^media | object |  | media info of product |
| ^^pic_set_type | string |  | pic set type |
| ^^pic_type | string |  | pic type |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material_show_type |
| ^^^material_use_type_code | string |  | material_use_type_code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^videos | array<object> |  | video info of product |
| ^^^uri | string |  | uri of video |
| ^product_name_en | string |  | name of product |
| ^product_name_zh | string |  | name of product |
| ^rp_ids | array<string> |  | rp ids |
| ^second_key_attribute_id | string |  | second_key_attribute_id |
| ^size_group_id | string |  | size_group_id |
| ^skcs | array<object> |  | skcs |
| ^^external_skc_code | string |  | external skc code |
| ^^first_key_attribute_value_id | string |  | first key attribute value id |
| ^^first_key_attribute_value_name | string |  | first key attribute value name |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material show type |
| ^^^material_use_type_code | string |  | material use type code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^skus | array<object> |  | skus |
| ^^^dimensions | object |  | dimensions |
| ^^^^height | string |  | height |
| ^^^^length | string |  | length |
| ^^^^unit | string |  | unit |
| ^^^^width | string |  | width |
| ^^^external_sku_code | string |  | external sku code |
| ^^^inventory | integer |  | inventory |
| ^^^pictures | array<object> |  | pictures |
| ^^^^material_show_type | string |  | material show type |
| ^^^^material_use_type_code | string |  | material use type code |
| ^^^^sequence | integer |  | sequence |
| ^^^^uri | string |  | uri of picture |
| ^^^price | object |  | price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^reference_sale_price | object |  | reference sale price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^sale_price_certificates | array<object> |  | sale price certificates |
| ^^^^uri | string |  | uri |
| ^^^second_key_attribute_value_id | string |  | second key attribute value id |
| ^^^second_key_attribute_value_name | string |  | second key attribute value name |
| ^^^stockup_mode | string |  | stockup mode |
| ^^^total_unit_count | string |  | total unit count |
| ^^^weight | object |  | weight |
| ^^^^unit | string |  | unit |
| ^^^^value | string |  | value |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^spu_code | string |  | spu code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCalculateProductAuditInfo

Description of [POST]/gs_full_service_commodity/:version/calculate_audit_info

**Path:** `/gs_full_service_commodity/202508/calculate_audit_info`
**Method:** `POST`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/gscalculate-product-audit-info-202508

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| spu | object |  | spu info |
| ^attributes | array<object> |  | product attributes |
| ^^id | string |  | id of attribute |
| ^^values | array<object> |  | value of attribute |
| ^^^id | string |  | id of attribute value |
| ^^^name | string |  | name of attribute value |
| ^brand_id | string |  | id of brand |
| ^category_id | string |  | id of category |
| ^certifications | array<object> |  | certifications |
| ^^items | array<object> |  | certifications |
| ^^^files | array<object> |  | files |
| ^^^^uri | string |  | uri of file |
| ^^^type | string |  | type |
| ^^type | string |  | type |
| ^description | object |  | description |
| ^^items | array<object> |  | description |
| ^^^sequence | integer |  | sequence |
| ^^^type | string |  | type |
| ^^^uri | string |  | uri |
| ^first_key_attribute_id | string |  | first key attribute id |
| ^grading_template_id | string |  | grading template id |
| ^ingredient | object |  | ingredient |
| ^^multi_material_composition | array<object> |  | multi material composition |
| ^^^component | object |  | component |
| ^^^^property_value_id | string |  | property value id |
| ^^^ingredients | array<object> |  | ingredients |
| ^^^^percentage | string |  | percentage |
| ^^^^property_value_id | string |  | property value id |
| ^^single_material_composition | array<object> |  | single material composition |
| ^^^percentage | string |  | percentage |
| ^^^property_value_id | string |  | property value id |
| ^^type | string |  | type |
| ^manufacture_ids | array<string> |  | manufacture ids |
| ^media | object |  | media info of product |
| ^^pic_set_type | string |  | pic set type |
| ^^pic_type | string |  | pic type |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material_show_type |
| ^^^material_use_type_code | string |  | material_use_type_code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^videos | array<object> |  | video info of product |
| ^^^uri | string |  | uri of video |
| ^product_name_en | string |  | name of product |
| ^product_name_zh | string |  | name of product |
| ^rp_ids | array<string> |  | rp ids |
| ^second_key_attribute_id | string |  | second_key_attribute_id |
| ^size_group_id | string |  | size_group_id |
| ^skcs | array<object> |  | skcs |
| ^^external_skc_code | string |  | external skc code |
| ^^first_key_attribute_value_id | string |  | first key attribute value id |
| ^^first_key_attribute_value_name | string |  | first key attribute value name |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material show type |
| ^^^material_use_type_code | string |  | material use type code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^skus | array<object> |  | skus |
| ^^^dimensions | object |  | dimensions |
| ^^^^height | string |  | height |
| ^^^^length | string |  | length |
| ^^^^unit | string |  | unit |
| ^^^^width | string |  | width |
| ^^^external_sku_code | string |  | external sku code |
| ^^^inventory | integer |  | inventory |
| ^^^pictures | array<object> |  | pictures |
| ^^^^material_show_type | string |  | material show type |
| ^^^^material_use_type_code | string |  | material use type code |
| ^^^^sequence | integer |  | sequence |
| ^^^^uri | string |  | uri of picture |
| ^^^price | object |  | price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^reference_sale_price | object |  | reference sale price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^sale_price_certificates | array<object> |  | sale price certificates |
| ^^^^uri | string |  | uri |
| ^^^second_key_attribute_value_id | string |  | second key attribute value id |
| ^^^second_key_attribute_value_name | string |  | second key attribute value name |
| ^^^stockup_mode | string |  | stockup mode |
| ^^^total_unit_count | string |  | total unit count |
| ^^^weight | object |  | weight |
| ^^^^unit | string |  | unit |
| ^^^^value | string |  | value |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^product_publish_detail | array<object> |  | product publish detail |
| ^^can_publish | boolean |  | can_publish |
| ^^region | string |  | region |
| ^^unpublishable_reasons | array<object> |  | unpublishable reasons |
| ^^^reason_information | string |  | reason_information |
| ^^^reason_type | integer |  | 4：BRAND、 5：CATEGORY、 6：PACKAGE_WEIGHT、 7：PACKAGE_VOLUME、 10：CERT_CHECK、 14：COMPLIANCE_PROPERTY、 15：SUPPLIER_INFO、 19：JIT、 50：GROUP_COMPLIANCE |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSListSupplierManufacturer

Description of [get]/gs_full_service_commodity/:version/supplier_manufacturers

**Path:** `/gs_full_service_commodity/202508/supplier_manufacturers`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/gslist-supplier-manufacturer-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | It is an identifier used to retrieve the next page of data, and there is no need to pass it when requesting the first page. |
| page_size | integer |  | Indicates the number of data entries displayed per page, used to control the number of records returned in a single query. The default value is 10, and the page size must be less than or equal to 30. |

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
| ^manufacturer_list | array<object> |  | manufacturer list |
| ^^address | string |  | address |
| ^^email | string |  | email |
| ^^id | string |  | id |
| ^^manufacturer_name | string |  | manufacturer name |
| ^^phone_number | object |  | phone number |
| ^^^phone_number | string |  | phone number |
| ^^^phone_number_region | string |  | phone number region |
| ^^registered_trade_name | string |  | registered trade name |
| ^next_page_token | string |  | next page token |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSGetSupplierRP

Description of [get]/gs_full_service_commodity/:version/supplier_rps

**Path:** `/gs_full_service_commodity/202508/supplier_rps`
**Method:** `GET`
**Version:** 202508
**Docs:** https://partner.tiktokshop.com/docv2/page/gsget-supplier-rp-202508

### Query Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| page_token | string |  | It is an identifier used to retrieve the next page of data, and there is no need to pass it when requesting the first page. |
| page_size | integer |  | Indicates the number of data entries displayed per page, used to control the number of records returned in a single query. The default value is 10, and the page size must be less than or equal to 30. |

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
| ^next_page_token | string |  | next page token |
| ^rp_infos | array<object> |  | rp infos |
| ^^address | object |  | address |
| ^^^city | string |  | city |
| ^^^country | string |  | country |
| ^^^province | string |  | province |
| ^^^street | string |  | street |
| ^^^street2 | string |  | street2 |
| ^^company_name | string |  | company name |
| ^^create_time | integer |  | create time |
| ^^default_RP | boolean |  | default RP |
| ^^email | string |  | email |
| ^^id | string |  | id |
| ^^name | object |  | name |
| ^^^first_name | string |  | first name |
| ^^^last_name | string |  | last name |
| ^^^middle_name | string |  | middle name |
| ^^phone_number | object |  | phone number |
| ^^^phone_number | string |  | phone number |
| ^^^phone_number_region | string |  | phone number region |
| ^^rp_name | string |  | rp name |
| ^^type | integer |  | 1:PERSONAL 2:COMPANY |
| ^^update_time | integer |  | update time |
| ^^version | integer |  | version |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCreateProductv2

Description of /gs_full_service_commodity/:version/products

**Path:** `/gs_full_service_commodity/202509/beta/products`
**Method:** `POST`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/gscreate-productv2-202509

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| idempotent_key | string |  | idempotent key |
| spu | object |  | spu info |
| ^attributes | array<object> |  | product attributes |
| ^^id | string |  | id of attribute |
| ^^region | string |  | region code |
| ^^values | array<object> |  | value of attribute |
| ^^^id | string |  | id of attribute value |
| ^^^name | string |  | name of attribute value |
| ^brand_id | string |  | id of brand |
| ^category_id | string |  | id of category |
| ^certifications | array<object> |  | certifications |
| ^^items | array<object> |  | certifications |
| ^^^files | array<object> |  | files |
| ^^^^uri | string |  | uri of file |
| ^^^type | string |  | type |
| ^^type | string |  | type |
| ^description | object |  | description |
| ^^items | array<object> |  | description |
| ^^^sequence | integer |  | sequence |
| ^^^type | string |  | type |
| ^^^uri | string |  | uri |
| ^first_key_attribute_id | string |  | first key attribute id |
| ^grading_template_id | string |  | grading template id |
| ^ingredient | object |  | ingredient |
| ^^multi_material_composition | array<object> |  | multi material composition |
| ^^^component | object |  | component |
| ^^^^property_value_id | string |  | property value id |
| ^^^ingredients | array<object> |  | ingredients |
| ^^^^percentage | string |  | percentage |
| ^^^^property_value_id | string |  | property value id |
| ^^single_material_composition | array<object> |  | single material composition |
| ^^^percentage | string |  | percentage |
| ^^^property_value_id | string |  | property value id |
| ^^type | string |  | type |
| ^key_attribute | array<object> |  | The attribute of key attribute 1 ~ key attribute N are passed in order according to the order of sales attributes |
| ^^key_attribute_id | string |  | Key Attribute ID |
| ^manufacture_ids | array<string> |  | manufacture ids |
| ^media | object |  | media info of product |
| ^^pic_set_type | string |  | pic set type |
| ^^pic_type | string |  | pic type |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material_show_type |
| ^^^material_use_type_code | string |  | material_use_type_code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^videos | array<object> |  | video info of product |
| ^^^uri | string |  | uri of video |
| ^product_name_en | string |  | name of product |
| ^product_name_zh | string |  | name of product |
| ^rp_ids | array<string> |  | rp ids |
| ^second_key_attribute_id | string |  | second_key_attribute_id |
| ^size_group_id | string |  | size_group_id |
| ^skcs | array<object> |  | skcs |
| ^^external_skc_code | string |  | external skc code |
| ^^first_key_attribute_value_id | string |  | first key attribute value id |
| ^^first_key_attribute_value_name | string |  | first key attribute value name |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material show type |
| ^^^material_use_type_code | string |  | material use type code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^skus | array<object> |  | skus |
| ^^^dimensions | object |  | dimensions |
| ^^^^height | string |  | height |
| ^^^^length | string |  | length |
| ^^^^unit | string |  | unit |
| ^^^^width | string |  | width |
| ^^^external_sku_code | string |  | external sku code |
| ^^^inventory | integer |  | inventory |
| ^^^key_attribute_value | array<object> |  | The attribute values of key attribute 1 ~ key attribute N are passed in order according to the order of sales attributes |
| ^^^^key_attribute_value_id | string |  | Key attribute value ID, fill in according to the enumeration value contained under the key attribute |
| ^^^^key_attribute_value_name | string |  | Key attribute value name. If the key attribute supports customization, fill in the key attribute name if customization is required. |
| ^^^pictures | array<object> |  | pictures |
| ^^^^material_show_type | string |  | material show type |
| ^^^^material_use_type_code | string |  | material use type code |
| ^^^^sequence | integer |  | sequence |
| ^^^^uri | string |  | uri of picture |
| ^^^price | object |  | price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^reference_sale_price | object |  | reference sale price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^sale_price_certificates | array<object> |  | sale price certificates |
| ^^^^uri | string |  | uri |
| ^^^second_key_attribute_value_id | string |  | second key attribute value id |
| ^^^second_key_attribute_value_name | string |  | second key attribute value name |
| ^^^stockup_mode | string |  | stockup mode |
| ^^^total_unit_count | string |  | total unit count |
| ^^^weight | object |  | weight |
| ^^^^unit | string |  | unit |
| ^^^^value | string |  | value |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^spu_code | string |  | spu code |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---

## GSCalculateProductAuditInfo

Description of [POST]/gs_full_service_commodity/:version/calculate_audit_info

**Path:** `/gs_full_service_commodity/202509/calculate_audit_info`
**Method:** `POST`
**Version:** 202509
**Docs:** https://partner.tiktokshop.com/docv2/page/gscalculate-product-audit-info-202509

### Header Parameters

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| x-tts-access-token | string | Y |  |
| Content-Type | string | Y | Allowed type: application/json |

### Request Body (`application/json`)

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| spu | object |  | spu info |
| ^attributes | array<object> |  | product attributes |
| ^^id | string |  | id of attribute |
| ^^region | string |  | region of attribute |
| ^^values | array<object> |  | value of attribute |
| ^^^id | string |  | id of attribute value |
| ^^^name | string |  | name of attribute value |
| ^brand_id | string |  | id of brand |
| ^category_id | string |  | id of category |
| ^certifications | array<object> |  | certifications |
| ^^items | array<object> |  | certifications |
| ^^^files | array<object> |  | files |
| ^^^^uri | string |  | uri of file |
| ^^^type | string |  | type |
| ^^type | string |  | type |
| ^description | object |  | description |
| ^^items | array<object> |  | description |
| ^^^sequence | integer |  | sequence |
| ^^^type | string |  | type |
| ^^^uri | string |  | uri |
| ^first_key_attribute_id | string |  | first key attribute id |
| ^grading_template_id | string |  | grading template id |
| ^ingredient | object |  | ingredient |
| ^^multi_material_composition | array<object> |  | multi material composition |
| ^^^component | object |  | component |
| ^^^^property_value_id | string |  | property value id |
| ^^^ingredients | array<object> |  | ingredients |
| ^^^^percentage | string |  | percentage |
| ^^^^property_value_id | string |  | property value id |
| ^^single_material_composition | array<object> |  | single material composition |
| ^^^percentage | string |  | percentage |
| ^^^property_value_id | string |  | property value id |
| ^^type | string |  | type |
| ^key_attribute | array<object> |  | 销售属性，按照顺序依次录入 |
| ^^key_attribute_id | string |  | Key Attribute ID |
| ^manufacture_ids | array<string> |  | manufacture ids |
| ^media | object |  | media info of product |
| ^^pic_set_type | string |  | pic set type |
| ^^pic_type | string |  | pic type |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material_show_type |
| ^^^material_use_type_code | string |  | material_use_type_code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^videos | array<object> |  | video info of product |
| ^^^uri | string |  | uri of video |
| ^product_name_en | string |  | name of product |
| ^product_name_zh | string |  | name of product |
| ^rp_ids | array<string> |  | rp ids |
| ^second_key_attribute_id | string |  | second_key_attribute_id |
| ^size_group_id | string |  | size_group_id |
| ^skcs | array<object> |  | skcs |
| ^^external_skc_code | string |  | external skc code |
| ^^first_key_attribute_value_id | string |  | first key attribute value id |
| ^^first_key_attribute_value_name | string |  | first key attribute value name |
| ^^pictures | array<object> |  | pictures |
| ^^^material_show_type | string |  | material show type |
| ^^^material_use_type_code | string |  | material use type code |
| ^^^sequence | integer |  | sequence |
| ^^^uri | string |  | uri of picture |
| ^^skus | array<object> |  | skus |
| ^^^dimensions | object |  | dimensions |
| ^^^^height | string |  | height |
| ^^^^length | string |  | length |
| ^^^^unit | string |  | unit |
| ^^^^width | string |  | width |
| ^^^external_sku_code | string |  | external sku code |
| ^^^inventory | integer |  | inventory |
| ^^^key_attribute_value | array<object> |  | 关键属性1~关键属性N的属性值，按照销售属性的顺序依次传入 |
| ^^^^key_attribute_value_id | string |  | Key attribute 1 attribute value ID, fill in according to the enumeration value contained under the key attribute |
| ^^^^key_attribute_value_name | string |  | Key attribute 1, attribute value name. If the key attribute supports customization, fill in the key attribute name if customization is required. |
| ^^^pictures | array<object> |  | pictures |
| ^^^^material_show_type | string |  | material show type |
| ^^^^material_use_type_code | string |  | material use type code |
| ^^^^sequence | integer |  | sequence |
| ^^^^uri | string |  | uri of picture |
| ^^^price | object |  | price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^reference_sale_price | object |  | reference sale price |
| ^^^^amount | string |  | amount |
| ^^^^currency | string |  | currency |
| ^^^sale_price_certificates | array<object> |  | sale price certificates |
| ^^^^uri | string |  | uri |
| ^^^second_key_attribute_value_id | string |  | second key attribute value id |
| ^^^second_key_attribute_value_name | string |  | second key attribute value name |
| ^^^stockup_mode | string |  | stockup mode |
| ^^^total_unit_count | string |  | total unit count |
| ^^^weight | object |  | weight |
| ^^^^unit | string |  | unit |
| ^^^^value | string |  | value |

### Response

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| code | integer |  | The success or failure status code returned in API response. |
| data | object |  | Specific return information. |
| ^product_publish_detail | array<object> |  | product publish detail |
| ^^can_publish | boolean |  | can_publish |
| ^^region | string |  | region |
| ^^unpublishable_reasons | array<object> |  | unpublishable reasons |
| ^^^reason_information | string |  | reason_information |
| ^^^reason_type | integer |  | 4：BRAND、 5：CATEGORY、 6：PACKAGE_WEIGHT、 7：PACKAGE_VOLUME、 10：CERT_CHECK、 14：COMPLIANCE_PROPERTY、 15：SUPPLIER_INFO、 19：JIT、 50：GROUP_COMPLIANCE |
| message | string |  | The success or failure messages returned in API response. Reasons of failure will be described in the message. |
| request_id | string |  | Request log. |

---
