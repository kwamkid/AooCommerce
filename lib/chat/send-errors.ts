// Path: lib/chat/send-errors.ts
// แปล error ดิบตอนส่งข้อความ/รูปในแชท ให้เป็นประโยคที่บอกว่า "เกิดอะไร + ทำอะไรต่อ"
//
// เจ้าของสั่ง (9 ก.ย. 2026): "ถ้าอัพไฟล์ไหนไม่ได้ ให้ขึ้น error message บอกให้ชัดเจน"
// ของเดิมโยน `uploadError.message` / `errData.error` ของ Supabase-LINE-Facebook ขึ้น toast ตรง ๆ
// (อังกฤษล้วน เช่น "InvalidKey", "(#100) Upload attachment failure") หรือเหลือแค่ "ส่งรูปภาพไม่สำเร็จ"
//
// กติกา: ข้อความที่เป็นภาษาไทยอยู่แล้ว (error ที่เราเขียนเอง) ต้องผ่านไปตามเดิม — ตัวจับคู่ทุกตัว
// เป็นคำอังกฤษ/รหัสของระบบภายนอกเท่านั้น · จับไม่ได้ให้คืนของดิบพร้อมคำนำ ไม่กลืนหาย

const has = (raw: string, re: RegExp) => re.test(raw);

/** error จาก Supabase Storage ตอนอัปโหลด */
export function describeUploadError(raw: string | null | undefined): string {
  const r = (raw || '').trim();
  if (!r) return 'อัปโหลดไม่สำเร็จโดยไม่ทราบสาเหตุ — กดลองใหม่';
  if (has(r, /invalid ?key/i)) return 'ชื่อไฟล์มีอักขระที่ระบบเก็บไฟล์ไม่รับ — เปลี่ยนชื่อไฟล์เป็นภาษาอังกฤษแล้วลองใหม่';
  if (has(r, /payload too large|maximum allowed size|too large|exceeds? .*size|\b413\b/i)) return 'ไฟล์ใหญ่เกินที่ระบบรับ — ย่อรูปให้เล็กลงแล้วลองใหม่';
  if (has(r, /row-level security|unauthori[sz]ed|not allowed|permission|forbidden|\bjwt\b|\b40[13]\b/i)) return 'ไม่มีสิทธิ์อัปโหลด — ออกจากระบบแล้วเข้าใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแล';
  if (has(r, /failed to fetch|network ?error|load failed|network request failed|timed? ?out|ECONN|socket/i)) return 'เครือข่ายหลุดระหว่างอัปโหลด — เช็คอินเทอร์เน็ตแล้วกดลองใหม่';
  if (has(r, /already exists|duplicate/i)) return 'มีไฟล์ชื่อนี้อยู่แล้ว — กดลองใหม่อีกครั้ง';
  if (has(r, /mime|content.?type|unsupported/i)) return 'ระบบเก็บไฟล์ไม่รับไฟล์ชนิดนี้ — บันทึกเป็น JPG แล้วลองใหม่';
  return `อัปโหลดไม่สำเร็จ: ${r}`;
}

/**
 * error ตอนส่งไปยังแพลตฟอร์ม (ตอบกลับจาก /api/chat/messages) หรือ error ของเครือข่ายฝั่งเรา
 * `httpStatus` ใส่เมื่อเซิร์ฟเวอร์ตอบมาแต่ไม่มีข้อความ — จะได้ไม่เหลือแค่ "ไม่สำเร็จ"
 */
export function describeSendError(raw: string | null | undefined, httpStatus?: number): string {
  const r = (raw || '').trim();
  if (!r) return httpStatus ? `เซิร์ฟเวอร์ตอบผิดพลาด (HTTP ${httpStatus}) — กดลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแล` : 'ส่งไม่สำเร็จโดยไม่ทราบสาเหตุ — กดลองใหม่';
  if (has(r, /failed to fetch|network ?error|load failed|network request failed|timed? ?out|ECONN|socket/i)) return 'เครือข่ายหลุดระหว่างส่ง — เช็คอินเทอร์เน็ตแล้วกดลองใหม่';
  if (has(r, /rate ?limit|too many|\b429\b|quota|monthly limit/i)) return 'แพลตฟอร์มจำกัดความถี่การส่ง — รอสัก 1 นาทีแล้วลองใหม่';
  if (has(r, /originalContentUrl|previewImageUrl|fetch the file|upload attachment failure|could not (be )?download|invalid[^.]*url|url[^.]*invalid|media.*(fail|invalid)/i)) return 'แพลตฟอร์มดึงรูปจากลิงก์ของเราไม่ได้ — กดลองใหม่ ถ้ายังไม่ได้ให้ลองส่งรูปอื่น';
  if (has(r, /too large|exceed|file size|\b(1|10|25) ?MB\b/i)) return 'รูปใหญ่เกินที่แพลตฟอร์มรับ — ย่อรูปแล้วส่งใหม่';
  if (has(r, /invalid[^.]*token|token[^.]*(invalid|expired)|expired|\b401\b|authentication|access token|channel access|OAuthException/i)) return 'การเชื่อมต่อช่องทางนี้หมดอายุ — ไปที่ ตั้งค่า › ช่องทางแชท แล้วเชื่อมต่อใหม่';
  if (has(r, /block|not (a )?friend|cannot be found|unknown user|no longer|user.*deleted|\b404\b|not found/i)) return 'ส่งหาลูกค้ารายนี้ไม่ได้ — ลูกค้าอาจบล็อกหรือเลิกติดตามแล้ว';
  if (has(r, /\b50[023]\b|internal server|service unavailable|failed to send/i)) return 'แพลตฟอร์มขัดข้องชั่วคราว — รอสักครู่แล้วลองใหม่';
  return r;
}
