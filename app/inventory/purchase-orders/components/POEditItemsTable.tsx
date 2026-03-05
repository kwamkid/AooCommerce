'use client';

import type { EditItem } from './types';
import { productDisplayName } from '../../components/types';
import type { ProductSearchItem } from '@/components/ui/ProductSearchInput';
import ItemsTable, { type TableItem } from '@/components/ui/ItemsTable';

interface Props {
  items: EditItem[];
  supplierId: string;
  supplierProducts: ProductSearchItem[];
  loadingProducts: boolean;
  stockMap: Record<string, number>;
  onAddProduct: (product: ProductSearchItem) => void;
  onUpdateQty: (idx: number, v: number) => void;
  onUpdateCost: (idx: number, v: number) => void;
  onRemove: (idx: number) => void;
}

export default function POEditItemsTable({
  items, supplierId, supplierProducts, loadingProducts, stockMap,
  onAddProduct, onUpdateQty, onUpdateCost, onRemove,
}: Props) {
  const tableItems: TableItem[] = items.map(i => ({
    variation_id: i.variation_id,
    product_id: i.product_id,
    product_name: productDisplayName({ product_name: i.name, product_code: i.code, variation_label: i.variation_label, sku: i.sku }),
    product_code: i.code,
    sku: i.sku,
    image: i.image,
    quantity: i.quantity,
    unit_cost: i.unit_cost,
  }));

  return (
    <ItemsTable
      items={tableItems}
      columns={['stock_badge', 'qty', 'unit_cost', 'total']}
      stockMap={stockMap}
      products={supplierId ? supplierProducts : []}
      loadingProducts={loadingProducts}
      searchPlaceholder="ค้นหาสินค้าของ supplier นี้..."
      searchDisabledMessage={supplierId ? undefined : 'เลือก Supplier ก่อนเพื่อค้นหาสินค้า'}
      onAdd={onAddProduct}
      onUpdateField={(idx, field, value) => {
        if (field === 'quantity') onUpdateQty(idx, value as number);
        if (field === 'unit_cost') onUpdateCost(idx, value as number);
      }}
      onRemove={onRemove}
      emptyMessage={supplierId ? 'เพิ่มสินค้าโดยพิมพ์ค้นหาด้านบน' : 'เลือก Supplier ก่อน'}
    />
  );
}
