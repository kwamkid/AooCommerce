import { redirect } from 'next/navigation';

// หน้า Marketplace ย้ายไปรวมกับ "ช่องทางการขาย" แล้ว (แท็บ "เชื่อมต่อ Marketplace")
// คง path เดิมไว้เป็น redirect กันบุ๊กมาร์ก/ลิงก์เก่าพัง — query ทั้งหมดส่งต่อ
// (เช่น ?shopee=connected จาก OAuth callback เวอร์ชันเก่าที่ยัง in-flight)
export default async function IntegrationsRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') qs.set(key, value);
    else if (Array.isArray(value)) value.forEach(v => qs.append(key, v));
  }
  qs.set('tab', 'marketplace');
  redirect(`/settings/sales-channels?${qs.toString()}`);
}
