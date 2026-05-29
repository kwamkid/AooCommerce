---
name: push
description: /push — git add + commit ตามสิ่งที่ทำในรอบนี้ + push ขึ้น remote. ใช้เมื่อ user ต้องการ approve ให้ deploy ทันที (ตามกฎใน CLAUDE.md ห้าม push เองจนกว่า user จะสั่ง — /push คือสัญญาณนั้น).
---

# Push — add + commit + push อัตโนมัติ

## Trigger
เมื่อ user พิมพ์ `/push`

> ตามกฎใน `CLAUDE.md` section "Git Workflow" — **ห้าม `git push` เองจนกว่า user สั่ง** การที่ user พิมพ์ `/push` คือสัญญาณ approval per-batch (ครั้งเดียว — ไม่ผูกถึงรอบหน้า)

## Steps

### 1. ตรวจสถานะ + branch
```bash
git status
git branch --show-current
git log --oneline @{u}..  # commits ที่ค้าง push
```

- ถ้า working tree clean + ไม่มี commit ค้าง → แจ้ "ไม่มีอะไรให้ push" จบ
- ถ้า working tree clean แต่มี local commits ค้าง → ข้ามไป step 4 (push อย่างเดียว)
- ถ้า branch ปัจจุบันไม่ใช่ที่คาด (เช่นกะจะ push feature branch แต่อยู่ main) → ยืนยันก่อน

### 2. ตรวจไฟล์ที่จะ stage — ห้ามมี secrets / unrelated

**ตรวจ red-flag patterns:**
- `.env`, `.env.*`, `*.env` — environment files
- `credentials.json`, `*.key`, `*.pem`, `*-key.json` — keys
- `*.bak`, `*.orig`, `*.tmp` — backup/temp files
- ขนาด > 1MB ที่ไม่ใช่ asset ปกติ
- ไฟล์ที่อยู่ใน `node_modules/`, `.next/`, `dist/`, `build/` (ปกติ gitignored แต่กันพลาด)

**ถ้าเจอ red-flag**:
- หยุด + แจ้ user + ถามว่าจะ stage หรือไม่
- **ห้าม stage อัตโนมัติ**

**ถ้ามี untracked files แปลกๆ** (ไม่ได้สร้างใน session นี้):
- แจ้ user + ถามก่อน
- เช่น `ProcessingTab.tsx.bak` ที่ค้างจากรอบเก่า — อาจเป็นของ user

### 3. Stage + Commit

**Stage**: ระบุไฟล์ตรงๆ — **ห้าม `git add -A` / `git add .`**
```bash
git add path/to/file1 path/to/file2
```

**Commit message structure**:
- Subject: 1 บรรทัด, ≤ 70 ตัวอักษร, action-oriented (verb + scope)
- Blank line
- Body: bullet หรือ short paragraph อธิบาย **what + why** (ไม่ใช่ how — code อ่านได้เอง)
- Footer: `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`

**ใช้ HEREDOC pass message เสมอ** (Markdown formatting + multi-line):
```bash
git commit -m "$(cat <<'EOF'
Subject line here

Body paragraph or bullets.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

**⚠️ Heredoc gotcha**: **ห้ามใช้ apostrophe (`'`) ใน body** — bash จะ parse error
- ใช้ "user's" → เขียน "user" หรือ "the user" แทน
- ใช้ "don't" → เขียน "do not" แทน
- ผมเคยพลาดเรื่องนี้รอบนี้แล้ว 2 ครั้ง

**ถ้างาน mixed concerns** (เช่น perf fix + UI redesign + bug fix ใน 1 commit):
- ถาม user ก่อนว่าจะรวมหรือแยก (default: รวมถ้า scope เล็ก, แยกถ้า scope ใหญ่)
- ตัวอย่าง mixed ที่ควรแยก: schema migration + UI change
- ตัวอย่าง mixed ที่รวมได้: tweak ฟอร์ม + เพิ่ม validation รวมกัน

### 4. Push
```bash
git push origin <current-branch>
```

**ห้าม**:
- `--force` / `--force-with-lease` (ยกเว้น user สั่งเฉพาะกิจ)
- `--no-verify` (ห้าม skip pre-push hooks)
- push ไป main branch ของคนอื่น (ถ้าโปรเจคมี protected branch convention)

**ถ้า push fail** (rejected, hook error, etc.):
- หยุด + แจ้ error + เสนอวิธีแก้ (rebase, fix hook, etc.)
- **ห้าม force push** เป็นทางออกแรก

### 5. แจ้งผลลัพธ์
- Commit hash(es) + push status
- บอก URL ของ remote (ถ้าเป็น GitHub: `https://github.com/<owner>/<repo>/commit/<sha>`)
- ถ้าเปลี่ยน CLAUDE.md / rule ใหม่ → เตือนว่าควรพิมพ์ `/log` ด้วย (แต่ไม่ทำเอง)

## ข้อควรระวัง

| Risk | ทำยังไง |
|---|---|
| Secret leak | ตรวจ red-flag patterns ก่อน stage; ห้าม `add -A` |
| Force push | ห้ามทำเอง — แจ้ปัญหาแทน |
| Skip hooks | ห้าม `--no-verify` |
| Wrong branch | เช็ค branch ก่อน push, ถามถ้าไม่ใช่ที่คาด |
| Mixed concerns | ถามก่อนถ้าควรแยก commit |
| HEREDOC + apostrophe | rewrite ให้ไม่มี `'` |

## Format ตัวอย่าง

**Commit message ดี**:
```
Performance: process-level auth cache (~400ms off every API call)

Every API route paid two Supabase round-trips for auth - JWT verify
plus company_members lookup. Cache the resolved AuthResult per
token+companyId for 30s so warm invocations skip both calls.

Cache only authenticated results; invalid tokens are cheap to re-check
and we do not want to lock out a freshly-refreshed token.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Commit message ไม่ดี**:
- "Update files" — ไม่บอกอะไรเลย
- "Fix bug" — bug อะไร?
- "WIP" — commit message ที่ pushed ขึ้น main ไม่ควรเป็น WIP
- ใช้ `user's` ใน HEREDOC — parse error

## Workflow ตัวอย่าง

```
User: /push

[Step 1] git status
  → modified: app/orders/[id]/page.tsx
  → modified: components/ui/Modal.tsx

[Step 2] ตรวจ → ไม่มี secret, ไม่มี untracked แปลก ✓

[Step 3] git add app/orders/[id]/page.tsx components/ui/Modal.tsx
         git commit -m "..."
         → commit abc1234

[Step 4] git push origin main
         → pushed successfully

[Step 5] แจ้ user:
  ✅ Pushed abc1234 → origin/main
  GitHub: https://github.com/.../commit/abc1234
```
