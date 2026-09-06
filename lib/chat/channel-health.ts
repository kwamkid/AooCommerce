// ตรวจสุขภาพช่องทางแชท LINE / Facebook แบบ "ถามแพลตฟอร์มจริง"
//
// ⚠️ ของเดิมตัวเฝ้าเดาจาก **ความเงียบ** (ไม่มีข้อความเข้านานกว่าปกติ = น่าจะพัง)
// ซึ่งใช้ไม่ได้เลย เพราะ "ไม่มีใครทัก" กับ "ช่องทางพัง" หน้าตาเหมือนกันเป๊ะเมื่อมองจาก
// ฝั่งเรา — สุดสัปดาห์ที่ลูกค้าไม่ทัก = เตือนผิดทั้งวัน (6–7 ก.ย. 2026)
//
// ที่นี่จึงถามตรง ๆ กับ API ของแพลตฟอร์มว่า **token ยังใช้ได้ไหม** และ
// **webhook ยังชี้มาที่ระบบเราไหม** — คำตอบเป็นข้อเท็จจริง ไม่ใช่การเดาจากสถิติ
//
// ผลตรวจเก็บบนแถวช่องทางเอง (`chat_accounts.health_*`) เพราะ:
//   1. ตรวจซ้ำทุก 6 ชม./ช่องทางก็พอ — ไม่ต้องยิง API ทุกครั้งที่มีคนเปิดหน้าเว็บ
//   2. หน้าตั้งค่าช่องทางแชทอ่านค่านี้ไปโชว์ได้เลย ไม่ต้องมี logic ตรวจซ้ำที่หน้าจอ
//      (กติกา CLAUDE.md: ตัวเฝ้าเป็นแหล่งความจริงเดียว ห้ามเขียน check ซ้ำในหน้าใดหน้าหนึ่ง)

import { supabaseAdmin } from '@/lib/supabase-admin';
import { parallelLimit } from '@/lib/parallel';
import { logIntegrationNow } from '@/lib/integration-logger';

export type ChatHealthStatus =
  | 'ok'
  /** token ใช้ไม่ได้แล้ว — ข้อความเข้าไม่ได้และตอบกลับไม่ได้ */
  | 'token_invalid'
  /** แพลตฟอร์มไม่ได้ส่ง event มาที่เรา (LINE ไม่ได้ตั้ง endpoint / เพจไม่ได้ subscribe แอปเรา) */
  | 'webhook_missing'
  /** ตั้งไว้ถูกแล้วแต่แพลตฟอร์มเรียกเข้ามาไม่สำเร็จ (ระบบเราตอบไม่ได้) */
  | 'webhook_unreachable'
  /** ตรวจไม่สำเร็จ (เน็ตหลุด / API ตอบแปลก) — **ไม่ใช่หลักฐานว่าช่องทางพัง** ห้ามเอาไปเตือน */
  | 'check_failed';

export interface ChatHealthResult {
  status: ChatHealthStatus;
  /** สิ่งที่เจอจริง เขียนให้เจ้าของร้านอ่านรู้เรื่อง (เก็บลง health_detail) */
  detail: string;
  /** วิธีแก้ที่ลงมือได้ทันที — ตัวเฝ้าเอาไปใส่ในแจ้งเตือนตรง ๆ */
  fix: string;
}

/** แถวช่องทางแชทเท่าที่การตรวจต้องใช้ (ไม่ผูกกับ type ของทั้งตาราง) */
export interface ChatChannelForHealth {
  id: string;
  company_id: string;
  platform: string;
  account_name: string | null;
  credentials: Record<string, unknown> | null;
}

/** ยิงแต่ละ call รอไม่เกินเท่านี้ — ค้างนานกว่านี้ถือว่าตรวจไม่สำเร็จ ดีกว่าแขวน request ผู้ใช้ */
const REQUEST_TIMEOUT_MS = 8_000;
/** ตรวจซ้ำช่องทางเดิมบ่อยสุดเท่านี้ */
const DEFAULT_MAX_AGE_HOURS = 6;
/** ตรวจได้กี่ช่องทางต่อรอบ — ที่เหลือรอรอบถัดไป (เรียงเอาตัวที่ค้างนานสุดก่อน) */
const DEFAULT_LIMIT = 10;
/**
 * งบเวลารวมของทั้งรอบ — **เพดานแข็ง** ไม่ใช่แค่ "ไม่เริ่มงานใหม่"
 *
 * `collectWatchdogIssues()` ถูกเรียกจาก `/api/header/summary` ซึ่งเป็นสายที่ผู้ใช้รออยู่จริง ๆ
 * ปกติทั้งรอบจบใน 1–2 วิ แต่ถ้าแพลตฟอร์มอืดพร้อมกัน LINE ตัวเดียวกินได้ถึง 3×8 วิ
 * (ตรวจ 3 ชั้น) → ต้องมีเส้นตายรวมกันคนละชั้นกับ timeout รายคำขอ ไม่งั้นหน้าเว็บค้าง
 *
 * ตัวที่ยังตรวจไม่ทัน `health_checked_at` ยังเก่าอยู่ → รอบถัดไปหยิบมันก่อนเพื่อนเอง
 */
const TIME_BUDGET_MS = 8_000;

const LINE_API = 'https://api.line.me/v2/bot';
const GRAPH_API = 'https://graph.facebook.com/v21.0';

/**
 * โฮสต์สาธารณะของระบบ — ต้องเป็น URL ที่ **แพลตฟอร์มภายนอกเรียกถึงได้**
 * (localhost ใช้ไม่ได้ ต่อให้รันบนเครื่อง dev ก็ต้องเทียบกับของ production)
 * fallback ตรงกับที่ Shopee webhook ฮาร์ดโค้ดไว้ใน `app/api/shopee/webhook/route.ts`
 */
const PUBLIC_BASE_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://aoocommerce.vercel.app')
  .replace(/\/+$/, '');

/** URL webhook ของช่องทางนี้ — ต้องตรงกับ `getWebhookUrl()` ใน `app/api/chat-accounts/route.ts` */
export function chatWebhookUrl(accountId: string, platform: string): string {
  return `${PUBLIC_BASE_URL}/api/${platform === 'line' ? 'line' : 'fb'}/webhook?account=${accountId}`;
}

/** ข้อความ "วิธีแก้" — ตัวเฝ้าเรียกใช้ตัวเดียวกันนี้ จะได้ไม่มีสองสำนวนพูดคนละเรื่อง */
export function chatHealthFix(platform: string, accountId: string): string {
  if (platform === 'line') {
    return `เปิด LINE Developers > Messaging API > Webhook URL ให้ชี้ที่ ${chatWebhookUrl(accountId, 'line')} แล้วเปิด "Use webhook" · ถ้า token เปลี่ยน ให้แก้ที่ ตั้งค่า > ช่องทางแชท > LINE`;
  }
  return 'เปิด ตั้งค่า > ช่องทางแชท > Facebook แล้วกดเชื่อมเพจใหม่ (สิทธิ์เพจหมดอายุทุก 60 วัน)';
}

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * endpoint ที่แพลตฟอร์มจดไว้ = ของเราหรือเปล่า
 * เทียบแค่ host + path + `account=` — **ไม่สน protocol/สแลชท้าย/พารามิเตอร์อื่น**
 * เพราะคนตั้งค่ามักพิมพ์ต่างกันนิดหน่อยแต่ถึงปลายทางเดียวกัน (เตือนผิดไม่ได้)
 */
function sameWebhookEndpoint(actual: string, expected: string): boolean {
  try {
    const a = new URL(actual);
    const b = new URL(expected);
    const path = (u: URL) => u.pathname.replace(/\/+$/, '');
    return a.host === b.host
      && path(a) === path(b)
      && a.searchParams.get('account') === b.searchParams.get('account');
  } catch {
    return false; // ค่าที่ตั้งไว้ไม่ใช่ URL ด้วยซ้ำ
  }
}

// ─────────────────────────────── LINE ───────────────────────────────

/**
 * LINE Messaging API — ตรวจ 3 ชั้น (หยุดที่ชั้นแรกที่พัง เพราะชั้นถัดไปจะพังตามอยู่แล้ว)
 *   1. GET /v2/bot/info                     → token ยังใช้ได้ไหม
 *   2. GET /v2/bot/channel/webhook/endpoint → ตั้ง URL ไว้ตรงกับเราไหม + เปิด "Use webhook" ไหม
 *   3. POST /v2/bot/channel/webhook/test    → LINE ยิงมาที่ URL นั้นแล้วถึงจริงไหม
 */
export async function checkLineChannel(account: ChatChannelForHealth): Promise<ChatHealthResult> {
  const creds = (account.credentials || {}) as Record<string, unknown>;
  const token = typeof creds.channel_access_token === 'string' ? creds.channel_access_token : '';
  const expected = chatWebhookUrl(account.id, 'line');
  const fix = chatHealthFix('line', account.id);

  if (!token) {
    return { status: 'token_invalid', detail: 'ยังไม่ได้ใส่ Channel access token ในระบบ', fix };
  }

  const auth = { Authorization: `Bearer ${token}` };

  try {
    // 1) token ใช้ได้ไหม
    const infoRes = await fetch(`${LINE_API}/info`, {
      headers: auth,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (infoRes.status === 401 || infoRes.status === 403) {
      return { status: 'token_invalid', detail: 'Channel access token ใช้ไม่ได้แล้ว — LINE ปฏิเสธคำขอ', fix };
    }
    if (!infoRes.ok) {
      return { status: 'check_failed', detail: `LINE ตอบ ${infoRes.status} ตอนขอข้อมูล OA`, fix };
    }
    const info = await infoRes.json().catch(() => ({})) as { displayName?: string };

    // 2) webhook ที่ LINE จดไว้ ชี้มาที่เราไหม
    const epRes = await fetch(`${LINE_API}/channel/webhook/endpoint`, {
      headers: auth,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (epRes.status === 401 || epRes.status === 403) {
      return { status: 'token_invalid', detail: 'Channel access token ไม่มีสิทธิ์อ่านค่า webhook — token น่าจะถูกเปลี่ยนแล้ว', fix };
    }
    // 404 = ยังไม่เคยตั้ง Webhook URL เลย (ไม่ใช่ error ของการตรวจ)
    if (epRes.status === 404) {
      return { status: 'webhook_missing', detail: 'LINE ยังไม่ได้ตั้ง Webhook URL ไว้เลย — ข้อความจากลูกค้าจะไม่วิ่งเข้าระบบ', fix };
    }
    if (!epRes.ok) {
      return { status: 'check_failed', detail: `LINE ตอบ ${epRes.status} ตอนขอค่า webhook`, fix };
    }
    const ep = await epRes.json().catch(() => ({})) as { endpoint?: string; active?: boolean };

    if (!ep.endpoint) {
      return { status: 'webhook_missing', detail: 'LINE ยังไม่ได้ตั้ง Webhook URL ไว้เลย — ข้อความจากลูกค้าจะไม่วิ่งเข้าระบบ', fix };
    }
    if (!sameWebhookEndpoint(ep.endpoint, expected)) {
      return {
        status: 'webhook_missing',
        detail: `LINE ส่งข้อความไปที่ ${ep.endpoint} ซึ่งไม่ใช่ระบบเรา (ต้องเป็น ${expected})`,
        fix,
      };
    }
    if (ep.active === false) {
      return {
        status: 'webhook_missing',
        detail: 'URL ตั้งถูกแล้ว แต่สวิตช์ "Use webhook" ใน LINE Developers ปิดอยู่ — LINE จึงไม่ส่งข้อความมาเลย',
        fix,
      };
    }

    // 3) ยิงจริงถึงไหม — LINE จะ POST มาที่ webhook เราพร้อม events ว่าง
    //    (route ของเราตอบ 200 ให้ events ว่างอยู่แล้ว จึงไม่มี contact/ข้อความปลอมเกิดขึ้น)
    const testRes = await fetch(`${LINE_API}/channel/webhook/test`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: expected }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!testRes.ok) {
      return { status: 'check_failed', detail: `LINE ตอบ ${testRes.status} ตอนสั่งทดสอบ webhook`, fix };
    }
    const test = await testRes.json().catch(() => ({})) as {
      success?: boolean; statusCode?: number; reason?: string; detail?: string;
    };
    // ฟันธงว่า "ไม่ถึง" เฉพาะเมื่อมีหลักฐานชัด — LINE ทยอยเลิกใช้ฟิลด์ `success`
    // แล้วใช้ `statusCode` แทน · ตอบมาไม่ครบทั้งคู่ = ไม่รู้ ห้ามเดาว่าพัง
    const failed = test.success === false
      || (typeof test.statusCode === 'number' && test.statusCode >= 400);
    if (failed) {
      const why = [test.reason, test.detail].filter(Boolean).join(' · ') || `HTTP ${test.statusCode ?? '-'}`;
      return {
        status: 'webhook_unreachable',
        detail: `LINE เรียก webhook ของเราไม่สำเร็จ (${why}) — ข้อความจากลูกค้าจะตกหล่น`,
        fix,
      };
    }

    return {
      status: 'ok',
      detail: `OA "${info.displayName || account.account_name || '-'}" ปกติ — token ใช้ได้ · webhook ชี้มาที่ระบบและเรียกถึง`,
      fix,
    };
  } catch (e) {
    // เน็ตหลุด/timeout = **ปัญหาของการตรวจ ไม่ใช่ของช่องทาง** — ไม่เอาไปเตือน
    return { status: 'check_failed', detail: `ตรวจไม่สำเร็จ: ${errText(e)}`, fix };
  }
}

// ───────────────────────────── Facebook ─────────────────────────────

type GraphError = { message?: string; type?: string; code?: number };

/** true = เป็น error ของ token (หมดอายุ / ถูกถอนสิทธิ์) ไม่ใช่ error ชั่วคราว */
function isTokenError(err: GraphError | undefined, httpStatus: number): boolean {
  if (err?.code === 190) return true;
  if (err?.type === 'OAuthException' && (httpStatus === 401 || httpStatus === 400)) return true;
  return httpStatus === 401;
}

/**
 * Facebook Graph API — ตรวจ 2 ชั้น
 *   1. GET /{page_id}?fields=id,name        → page access token ยังใช้ได้ไหม
 *   2. GET /{page_id}/subscribed_apps       → เพจยัง subscribe **แอปเรา** สำหรับ event `messages` ไหม
 *
 * หมายเหตุ: เพจที่มาจาก Instagram ก็เก็บเป็น platform `'facebook'` เหมือนกัน
 * (token/page_id ชุดเดียวกัน) จึงตรวจด้วยเส้นทางเดียวกันได้
 */
export async function checkFacebookPage(account: ChatChannelForHealth): Promise<ChatHealthResult> {
  const creds = (account.credentials || {}) as Record<string, unknown>;
  const token = typeof creds.page_access_token === 'string' ? creds.page_access_token : '';
  const pageId = typeof creds.page_id === 'string' ? creds.page_id : '';
  const fix = chatHealthFix('facebook', account.id);

  if (!token || !pageId) {
    return { status: 'token_invalid', detail: 'ยังไม่มี Page access token / Page ID ในระบบ', fix };
  }

  const qs = `access_token=${encodeURIComponent(token)}`;

  try {
    // 1) token ของเพจยังใช้ได้ไหม
    const pageRes = await fetch(`${GRAPH_API}/${pageId}?fields=id,name&${qs}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const pageBody = await pageRes.json().catch(() => ({})) as { name?: string; error?: GraphError };
    if (pageBody.error || !pageRes.ok) {
      if (isTokenError(pageBody.error, pageRes.status)) {
        return {
          status: 'token_invalid',
          detail: `token เพจหมดอายุ/ถูกถอน — ต้องเชื่อมเพจใหม่ (${pageBody.error?.message || `HTTP ${pageRes.status}`})`,
          fix,
        };
      }
      return {
        status: 'check_failed',
        detail: `Graph API ตอบผิดปกติ: ${pageBody.error?.message || `HTTP ${pageRes.status}`}`,
        fix,
      };
    }
    const pageName = pageBody.name || account.account_name || pageId;

    // 2) เพจยัง subscribe แอปเราอยู่ไหม
    //    ไม่ตั้ง NEXT_PUBLIC_FACEBOOK_APP_ID = เทียบไม่ได้ว่า "แอปเรา" คือตัวไหน
    //    → ข้ามชั้นนี้ไปเลย **ห้ามฟันว่าพัง** (จะกลายเป็นเตือนผิดทุกเพจ)
    const appId = process.env.NEXT_PUBLIC_FACEBOOK_APP_ID;
    if (!appId) {
      return { status: 'ok', detail: `เพจ "${pageName}" token ใช้ได้ (ข้ามการตรวจ subscribed_apps เพราะยังไม่ได้ตั้ง NEXT_PUBLIC_FACEBOOK_APP_ID)`, fix };
    }

    const subRes = await fetch(`${GRAPH_API}/${pageId}/subscribed_apps?${qs}`, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const subBody = await subRes.json().catch(() => ({})) as {
      data?: { id?: string; name?: string; subscribed_fields?: string[] }[];
      error?: GraphError;
    };
    if (subBody.error || !subRes.ok) {
      if (isTokenError(subBody.error, subRes.status)) {
        return {
          status: 'token_invalid',
          detail: `token เพจหมดอายุ/ถูกถอน — ต้องเชื่อมเพจใหม่ (${subBody.error?.message || `HTTP ${subRes.status}`})`,
          fix,
        };
      }
      // สิทธิ์ไม่พอ/Graph ล่ม = ตรวจไม่ได้ ไม่ใช่หลักฐานว่าเพจหลุด subscribe
      return {
        status: 'check_failed',
        detail: `อ่านรายการแอปที่เพจ subscribe ไม่ได้: ${subBody.error?.message || `HTTP ${subRes.status}`}`,
        fix,
      };
    }

    const apps = Array.isArray(subBody.data) ? subBody.data : [];
    const mine = apps.find(a => String(a.id) === String(appId));
    if (!mine) {
      return {
        status: 'webhook_missing',
        detail: `เพจ "${pageName}" ไม่ได้ subscribe แอปเราสำหรับ messages แล้ว — ข้อความจากลูกค้าจะไม่เข้าระบบ`,
        fix,
      };
    }
    const fields = mine.subscribed_fields || [];
    if (!fields.includes('messages')) {
      return {
        status: 'webhook_missing',
        detail: `เพจ "${pageName}" subscribe แอปเราอยู่ แต่ไม่ได้เปิด event "messages" (มีแค่ ${fields.join(', ') || '-'}) — ข้อความจากลูกค้าจะไม่เข้าระบบ`,
        fix,
      };
    }

    return { status: 'ok', detail: `เพจ "${pageName}" ปกติ — token ใช้ได้ · subscribe แอปเราครบ (messages)`, fix };
  } catch (e) {
    return { status: 'check_failed', detail: `ตรวจไม่สำเร็จ: ${errText(e)}`, fix };
  }
}

// ───────────────────────────── ตัวรันรอบ ─────────────────────────────

/**
 * ตรวจช่องทางที่ถึงรอบแล้ว แล้วบันทึกผลลงแถวช่องทาง
 *
 * @param opts.companyId  ระบุ = เฉพาะบริษัทนั้น (สายที่มาจากหน้าเว็บของร้าน)
 * @param opts.maxAgeHours ตรวจซ้ำถี่สุดเท่านี้ (default 6)
 * @param opts.limit      ตรวจได้กี่ช่องทางต่อรอบ (default 10) — ที่เหลือรอรอบหน้า
 */
export async function runChatChannelHealthChecks(
  opts: { companyId?: string | null; maxAgeHours?: number; limit?: number } = {}
): Promise<{ checked: number; problems: number }> {
  const maxAgeHours = opts.maxAgeHours ?? DEFAULT_MAX_AGE_HOURS;
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cutoff = new Date(Date.now() - maxAgeHours * 3_600_000).toISOString();
  const startedAt = Date.now();

  let query = supabaseAdmin
    .from('chat_accounts')
    .select('id, company_id, platform, account_name, credentials')
    .in('platform', ['line', 'facebook'])
    .eq('is_active', true)
    // ยังไม่เคยตรวจ = ต้องตรวจก่อนใคร (nullsFirst) — ช่องทางที่เพิ่งเชื่อมจะได้รู้ผลไว
    .or(`health_checked_at.is.null,health_checked_at.lt.${cutoff}`)
    .order('health_checked_at', { ascending: true, nullsFirst: true })
    .limit(limit);
  if (opts.companyId) query = query.eq('company_id', opts.companyId);

  const { data, error } = await query;
  if (error || !data || data.length === 0) return { checked: 0, problems: 0 };

  let checked = 0;
  let problems = 0;

  const run = parallelLimit(data as ChatChannelForHealth[], async (account) => {
    // หมดงบเวลาแล้วหยุดหยิบตัวใหม่ — ตัวที่ยังไม่ตรวจ health_checked_at ยังเก่าอยู่
    // รอบหน้าจึงหยิบมันก่อนเพื่อนเอง (ไม่มีทางมีช่องทางที่ไม่เคยถูกตรวจถาวร)
    if (Date.now() - startedAt > TIME_BUDGET_MS) return;

    const result = account.platform === 'line'
      ? await checkLineChannel(account)
      : await checkFacebookPage(account);

    checked++;
    if (result.status !== 'ok' && result.status !== 'check_failed') problems++;

    await supabaseAdmin
      .from('chat_accounts')
      .update({
        health_status: result.status,
        health_detail: result.detail,
        health_checked_at: new Date().toISOString(),
        // ไม่แตะ updated_at — นี่คือผลตรวจของระบบ ไม่ใช่การแก้ไขของผู้ใช้
      })
      .eq('id', account.id);

    // log เฉพาะขาที่ไม่ผ่าน (กติกาปริมาณ: ขาสำเร็จวันละหลายสิบใบไม่มีประโยชน์)
    // ต้อง await เพราะโค้ดนี้วิ่งใน request handler — ปล่อยลอยแล้ว Vercel freeze ทิ้ง
    if (result.status !== 'ok') {
      await logIntegrationNow({
        company_id: account.company_id,
        integration: account.platform,
        account_id: account.id,
        account_name: account.account_name,
        direction: 'outgoing',
        action: 'chat_health_check',
        status: 'error',
        error_message: `${result.status}: ${result.detail}`,
      }).catch(() => { /* log พังห้ามล้มการตรวจ */ });
    }
  }, 3)
    // ตัวเฝ้าห้ามทำให้ผู้เรียกพัง — การตรวจสุขภาพล้มก็แค่ "รอบนี้ไม่มีผลใหม่"
    // (collectWatchdogIssues ถูกเรียกจาก /api/header/summary ที่ผู้ใช้รออยู่)
    .catch(e => { console.warn('[chat-health] รอบตรวจล้ม:', errText(e)); return []; });

  // เส้นตายรวม — งานที่ยังค้างปล่อยให้วิ่งต่อไปเงียบ ๆ (ผลที่เขียนลงแล้วยังใช้ได้
  // และการเขียนซ้ำก็ไม่มีผลข้างเคียง) แต่ **ผู้เรียกไม่ต้องรอมันอีกต่อไป**
  await Promise.race([
    run,
    new Promise<void>(resolve => setTimeout(resolve, TIME_BUDGET_MS)),
  ]);

  return { checked, problems };
}
