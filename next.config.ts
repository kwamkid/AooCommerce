import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ไฟล์ใน public/ **ไม่ได้** ถูกแพ็คลง serverless function ให้อัตโนมัติ และตัวตามรอย
  // ของ Next อ่าน path ที่ประกอบจากตัวแปรตอน runtime ไม่ออก — /api/push/icon อ่านโลโก้
  // แพลตฟอร์ม (SVG) กับไอคอนแอปสำรองจาก public/ จึงต้องสั่งแพ็คเอง ไม่งั้นบน Vercel
  // จะ readFile ไม่เจอแล้วตกไปใช้ไอคอนแอปทุกใบแบบเงียบ ๆ (ในเครื่อง dev ไม่มีอาการ)
  outputFileTracingIncludes: {
    '/api/push/icon': [
      './public/social/*.svg',
      './public/marketplace/*.svg',
      './public/icons/icon-192.png',
    ],
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'profile.line-scdn.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'sprofile.line-scdn.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'stickershop.line-scdn.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'graph.facebook.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.fbcdn.net',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cf.shopee.co.th',
        pathname: '/file/**',
      },
    ],
  },
};

export default nextConfig;
