// Storefront robots.txt — per company, served on the customer's own domain.
// AI crawlers are listed explicitly so `allow_ai_crawlers` is a real switch:
// some shops want to be quotable by ChatGPT/Perplexity, others don't.
import { NextResponse } from 'next/server';
import { getStorefrontCompany } from '@/lib/storefront-server';
import { storefrontUrl } from '@/lib/storefront';

export const revalidate = 3600;

// Answer-engine + AI-training crawlers, toggled together by allow_ai_crawlers.
//
// ⚠️ **ตัวที่ index กับตัวที่ fetch ตอนผู้ใช้ถามสด เป็นคนละ user-agent** — ระบุแค่ตัว index
// แล้วปิด/เปิดจะไม่ครบ (เช่น PerplexityBot เก็บ index ส่วน Perplexity-User ดึงตอนมีคนถาม)
const AI_CRAWLERS = [
  'GPTBot',              // OpenAI training
  'OAI-SearchBot',       // ChatGPT search
  'ChatGPT-User',        // ChatGPT browsing on behalf of a user
  'ClaudeBot',           // Anthropic — index
  'Claude-SearchBot',    // Anthropic — ค้นตอนผู้ใช้ถาม
  'Claude-User',
  'anthropic-ai',        // ตัวเก่า ยังมีที่อ้างถึงอยู่
  'PerplexityBot',       // index
  'Perplexity-User',     // ดึงสดตอนผู้ใช้ถาม (คนละตัวกับข้างบน)
  'Google-Extended',     // Gemini / AI Overviews grounding
  'Google-CloudVertexBot',
  'Applebot-Extended',
  'Meta-ExternalAgent',  // Llama / Meta AI
  'meta-externalagent',
  'MistralAI-User',
  'DuckAssistBot',
  'Amazonbot',
  'YouBot',
  'PetalBot',
  'cohere-ai',
  'CCBot',               // Common Crawl — feeds many LLM datasets
  'Bytespider',
];

/**
 * หน้าธุรกรรม — `noindex` อยู่แล้วแต่ bot ต้อง**โหลดหน้าก่อน**ถึงจะรู้ ⇒ เผา crawl budget ฟรี ๆ
 * (`/order/[id]` หนักสุด เพราะดึงข้อมูลบิลทุกครั้งที่ถูกเรียก)
 * `?q=` สร้าง URL ได้ไม่จำกัด — ปล่อยไว้ crawler เดินไม่จบ
 */
const NO_CRAWL_PATHS = ['/cart', '/checkout', '/account', '/orders', '/order/'];

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const company = await getStorefrontCompany(slug);
  if (!company) return new NextResponse('Not found', { status: 404 });

  const cfg = company.config;
  const lines: string[] = [];

  if (!cfg.public_base_url) {
    // ยังไม่ได้ผูกโดเมนของร้าน — อย่าให้ index บนโดเมน aoo (หลายร้านโดเมนเดียวกัน)
    lines.push('User-agent: *', 'Disallow: /');
  } else {
    const basePath = cfg.public_base_path || '';
    lines.push('User-agent: *', 'Allow: /');
    for (const path of NO_CRAWL_PATHS) lines.push(`Disallow: ${basePath}${path}`);
    lines.push('Disallow: /*?q=', '');
    for (const bot of AI_CRAWLERS) {
      lines.push(`User-agent: ${bot}`, cfg.allow_ai_crawlers ? 'Allow: /' : 'Disallow: /', '');
    }
    lines.push(`Sitemap: ${storefrontUrl(cfg, slug, '/sitemap.xml')}`);
    // ชี้ทางไป llms.txt — ไม่มีใครรู้ว่ามีอยู่เลยถ้าไม่บอก (ไม่อยู่ใน sitemap และไม่มีลิงก์ในหน้า)
    if (cfg.allow_ai_crawlers) lines.push(`# llms.txt: ${storefrontUrl(cfg, slug, '/llms.txt')}`);
  }

  return new NextResponse(lines.join('\n') + '\n', {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=0, s-maxage=3600',
    },
  });
}
