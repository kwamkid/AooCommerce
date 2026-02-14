'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { apiFetch } from '@/lib/api-client';
import { ArrowLeft, Printer } from 'lucide-react';
import QRCode from 'qrcode';

interface ShippingAddress {
  id: string;
  address_name: string;
  contact_person?: string;
  phone?: string;
  address_line1: string;
  district?: string;
  amphoe?: string;
  province: string;
  postal_code?: string;
  google_maps_link?: string;
}

interface ProductItem {
  product_name: string;
  bottle_size?: string;
  quantity: number;
}

interface ShippingLabel {
  address: ShippingAddress;
  items: ProductItem[];
  totalBottles: number;
}

interface Order {
  id: string;
  order_number: string;
  delivery_date?: string;
  notes?: string;
  customer: {
    name: string;
  };
}

export default function ShippingLabelsPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params?.id as string;
  const { userProfile, loading: authLoading } = useAuth();

  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState<Order | null>(null);
  const [labels, setLabels] = useState<ShippingLabel[]>([]);
  const [qrCodes, setQrCodes] = useState<{ [key: string]: string }>({});

  useEffect(() => {
    if (!authLoading && userProfile) {
      fetchOrderData();
    }
  }, [authLoading, userProfile, orderId]);

  const fetchOrderData = async () => {
    try {
      const response = await apiFetch(`/api/orders/${orderId}`);

      if (!response.ok) {
        throw new Error('Failed to fetch order');
      }

      const result = await response.json();
      const orderData = result.order;

      setOrder({
        id: orderData.id,
        order_number: orderData.order_number,
        delivery_date: orderData.delivery_date,
        notes: orderData.notes,
        customer: {
          name: orderData.customer.name
        }
      });

      // Group items by shipping address
      const labelsByAddress = new Map<string, ShippingLabel>();

      orderData.items.forEach((item: any) => {
        item.shipments.forEach((shipment: any) => {
          const addressId = shipment.shipping_address.id;

          if (!labelsByAddress.has(addressId)) {
            labelsByAddress.set(addressId, {
              address: shipment.shipping_address,
              items: [],
              totalBottles: 0
            });
          }

          const label = labelsByAddress.get(addressId)!;

          // Add or update product in this label
          const existingProduct = label.items.find(
            p => p.product_name === item.product_name && p.bottle_size === item.bottle_size
          );

          if (existingProduct) {
            existingProduct.quantity += shipment.quantity;
          } else {
            label.items.push({
              product_name: item.product_name,
              bottle_size: item.bottle_size,
              quantity: shipment.quantity
            });
          }

          label.totalBottles += shipment.quantity;
        });
      });

      const labelsArray = Array.from(labelsByAddress.values());
      setLabels(labelsArray);

      // Generate QR codes for each address
      const qrCodesObj: { [key: string]: string } = {};
      for (const label of labelsArray) {
        if (label.address.google_maps_link) {
          try {
            const qrDataUrl = await QRCode.toDataURL(label.address.google_maps_link, {
              width: 150,
              margin: 1
            });
            qrCodesObj[label.address.id] = qrDataUrl;
          } catch (err) {
            console.error('Error generating QR code:', err);
          }
        }
      }
      setQrCodes(qrCodesObj);

      setLoading(false);
    } catch (error) {
      console.error('Error fetching order data:', error);
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#F4511E] mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-slate-400">กำลังโหลด...</p>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600 dark:text-slate-400">ไม่พบข้อมูลคำสั่งซื้อ</p>
      </div>
    );
  }

  return (
    <>
      {/* Print controls - hidden when printing */}
      <div className="no-print bg-white dark:bg-slate-900 border-b border-gray-200 dark:border-slate-700 px-6 py-4 flex items-center justify-end sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600 dark:text-slate-400">
            {labels.length} ใบปะหน้า
          </span>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-[#F4511E] text-white rounded-lg hover:bg-[#D63B0E] transition-colors"
          >
            <Printer className="w-5 h-5" />
            พิมพ์ทั้งหมด
          </button>
        </div>
      </div>

      {/* Shipping Labels */}
      <div className="labels-container">
        {labels.map((label, index) => (
          <div key={label.address.id} className="shipping-label">
            {/* Header */}
            <div className="label-header">
              <h1 className="label-title">ใบปะหน้ากล่อง</h1>
            </div>

            {/* Delivery Info - Split Layout */}
            <div className="info-section-split">
              <div className="info-left">
                <span className="info-item">
                  <span className="info-label">Order:</span> {order.order_number}
                </span>
                {order.notes && (
                  <>
                    <span className="info-divider">|</span>
                    <span className="info-item">
                      <span className="info-label">หมายเหตุ:</span> {order.notes}
                    </span>
                  </>
                )}
              </div>
              <div className="info-right">
                <span className="info-item-delivery">
                  <span className="info-label">วันที่ส่ง:</span>{' '}
                  {order.delivery_date
                    ? new Date(order.delivery_date).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })
                    : '-'}
                </span>
              </div>
            </div>

            {/* 2 Column Layout */}
            <div className="two-column-container">
              {/* Left Column - Customer & Address */}
              <div className="left-column">
                <div className="customer-section">
                  <div className="customer-name">{order.customer.name}</div>
                  <div className="branch-name">{label.address.address_name}</div>
                  <div className="address-detail">
                    <div className="address-line">{label.address.address_line1}</div>
                    <div className="address-line">
                      {label.address.amphoe && `${label.address.amphoe}, `}จ.{label.address.province} {label.address.postal_code}
                    </div>
                    {label.address.phone && (
                      <div className="address-line">โทร: {label.address.phone}</div>
                    )}
                  </div>

                  {/* QR Code - Bottom Left */}
                  {qrCodes[label.address.id] && (
                    <div className="qr-code-section">
                      <img src={qrCodes[label.address.id]} alt="QR Code" className="qr-code" />
                      <div className="qr-label">สแกนดูแผนที่</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column - Items List */}
              <div className="right-column">
                <div className="items-section">
                  <h2 className="items-title">รายการสินค้า</h2>
                  <table className="items-table">
                    <thead>
                      <tr>
                        <th className="table-header-no">ลำดับ</th>
                        <th className="table-header-product">รายการ</th>
                        <th className="table-header-qty">จำนวน</th>
                      </tr>
                    </thead>
                    <tbody>
                      {label.items.map((item, itemIndex) => (
                        <tr key={itemIndex}>
                          <td className="table-cell-no">{itemIndex + 1}</td>
                          <td className="table-cell-product">
                            {item.product_name}
                            {item.bottle_size && ` (${item.bottle_size})`}
                          </td>
                          <td className="table-cell-qty">{item.quantity} ขวด</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="total-row">
                        <td colSpan={2} className="total-label">รวมทั้งหมด</td>
                        <td className="total-value">{label.totalBottles} ขวด</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </div>

            {/* Label count indicator */}
            <div className="label-footer">
              ใบที่ {index + 1} / {labels.length}
            </div>
          </div>
        ))}
      </div>

      {/* Print Styles */}
      <style jsx>{`
        @media print {
          .no-print {
            display: none !important;
          }

          .shipping-label {
            page-break-after: always;
            page-break-inside: avoid;
          }

          .shipping-label:last-child {
            page-break-after: auto;
          }
        }

        .labels-container {
          padding: 20px;
          margin: 0 auto;
        }

        .shipping-label {
          background: white;
          border: 2px solid #000;
          padding: 8mm;
          margin: 0 auto 20px;
          font-family: 'Sarabun', sans-serif;
          width: 210mm;
          height: 148mm;
          box-sizing: border-box;
        }

        @media print {
          .labels-container {
            padding: 0;
            margin: 0;
          }

          .shipping-label {
            width: 210mm;
            height: 148mm;
            margin: 0;
            padding: 8mm;
            box-sizing: border-box;
          }

          @page {
            size: 210mm 148mm;
            margin: 0;
          }
        }

        .label-header {
          text-align: center;
          border-bottom: 2px solid #000;
          padding-bottom: 4px;
          margin-bottom: 6px;
        }

        .label-title {
          font-size: 18px;
          font-weight: bold;
          margin: 0;
          margin-bottom: 2px;
        }

        .info-section-split {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
          padding: 8px 10px;
          border: 2px solid #ddd;
          border-radius: 4px;
          font-size: 13px;
          font-weight: 600;
        }

        .info-left {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
        }

        .info-right {
          display: flex;
          align-items: center;
        }

        .info-item-delivery {
          font-size: 14px;
          font-weight: 700;
        }

        @media print {
          .info-section-split {
            border: 2px solid #000;
          }

          .address-detail {
            color: #000;
          }

          .branch-name {
            color: #000;
          }

          .qr-code {
            border-color: #000;
          }
        }

        .info-item {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }

        .info-label {
          font-weight: bold;
        }

        .info-divider {
          color: #999;
          font-weight: 400;
          font-size: 14px;
        }

        .two-column-container {
          display: flex;
          gap: 10mm;
          margin-bottom: 8px;
        }

        .left-column {
          flex: 0 0 40%;
        }

        .right-column {
          flex: 1;
        }

        .customer-section {
          display: flex;
          flex-direction: column;
          padding: 6px 8px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          height: 100%;
          position: relative;
        }

        .customer-name {
          font-size: 20px;
          font-weight: bold;
          margin-bottom: 4px;
        }

        .branch-name {
          font-size: 18px;
          font-weight: bold;
          color: #F4511E;
          margin-bottom: 6px;
        }

        .address-detail {
          font-size: 11px;
          line-height: 1.5;
          color: #333;
        }

        .address-line {
          margin-bottom: 2px;
        }

        .qr-code-section {
          margin-top: auto;
          padding-top: 8px;
        }

        .qr-code {
          width: 80px;
          height: 80px;
          border: 1px solid #e0e0e0;
          border-radius: 4px;
          display: block;
        }

        .qr-label {
          margin-top: 3px;
          font-size: 8px;
          font-weight: 600;
        }

        .items-section {
          height: 100%;
        }

        .items-title {
          font-size: 16px;
          font-weight: bold;
          margin-bottom: 6px;
          padding-bottom: 4px;
          border-bottom: 2px solid #e0e0e0;
        }

        .items-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .items-table thead {
          border: 1px solid #ddd;
        }

        @media print {
          .items-table thead {
            border: 1px solid #000;
          }
        }

        .table-header-no {
          width: 40px;
          padding: 4px 6px;
          text-align: center;
          border: 1px solid #ddd;
          font-weight: bold;
        }

        .table-header-product {
          padding: 4px 6px;
          text-align: left;
          border: 1px solid #ddd;
          font-weight: bold;
        }

        .table-header-qty {
          width: 70px;
          padding: 4px 6px;
          text-align: center;
          border: 1px solid #ddd;
          font-weight: bold;
        }

        .items-table tbody tr {
          border-bottom: 1px solid #eee;
        }

        .table-cell-no {
          padding: 3px 6px;
          text-align: center;
          border: 1px solid #ddd;
        }

        .table-cell-product {
          padding: 3px 6px;
          text-align: left;
          border: 1px solid #ddd;
        }

        .table-cell-qty {
          padding: 3px 6px;
          text-align: center;
          border: 1px solid #ddd;
          font-weight: 700;
          font-size: 14px;
        }

        .items-table tfoot .total-row {
          border: 2px solid #000;
          font-weight: bold;
        }

        @media print {
          .items-table tfoot .total-row {
            border: 2px solid #000;
          }

          .total-label,
          .total-value {
            border-color: #000;
            color: #000;
          }
        }

        .total-label {
          padding: 5px 6px;
          text-align: right;
          border: 1px solid #000;
          font-size: 14px;
          font-weight: bold;
        }

        .total-value {
          padding: 5px 6px;
          text-align: center;
          border: 1px solid #000;
          font-size: 16px;
          font-weight: bold;
        }

        .label-footer {
          text-align: center;
          font-size: 9px;
          color: #666;
          padding-top: 5px;
          border-top: 1px solid #e0e0e0;
        }
      `}</style>
    </>
  );
}
