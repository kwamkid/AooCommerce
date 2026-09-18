import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),

  // ── ไอคอนกลาง ──────────────────────────────────────────────────────
  // ไอคอนที่มีชื่อความหมายใน lib/icons.ts แล้ว ห้าม import จาก lucide ตรง ๆ อีก
  // (ไม่งั้นเมนูข้างกับหน้าจริงจะกลับไปเป็นคนละไอคอนเหมือนเดิม)
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}"],
    ignores: ["lib/icons.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "lucide-react",
          importNames: ["AlertCircle", "AlertTriangle", "ArrowDownToLine", "ArrowLeft", "ArrowLeftRight", "ArrowRight", "ArrowUpFromLine", "Award", "Ban", "Banknote", "BarChart3", "Bell", "Box", "Building2", "Calendar", "Camera", "Check", "CheckCircle2", "ChevronDown", "ChevronLeft", "ChevronRight", "ChevronUp", "ClipboardList", "Clock", "Copy", "CreditCard", "DollarSign", "Download", "ExternalLink", "Eye", "EyeOff", "Factory", "FileSpreadsheet", "FileText", "Filter", "Gift", "Globe", "Handshake", "Home", "ImageGlyph", "ImagePlus", "Info", "KeyRound", "Link2", "Loader2", "LogOut", "Mail", "MapPin", "Megaphone", "Menu", "MessageCircle", "MessageSquareText", "Minus", "Monitor", "Moon", "MoreVertical", "Package", "Pencil", "Percent", "Phone", "Plus", "Printer", "QrCode", "Receipt", "ReceiptText", "RefreshCw", "RotateCcw", "Save", "Search", "Send", "Settings", "ShieldCheck", "ShoppingBag", "ShoppingCart", "Star", "Store", "Sun", "Tag", "Target", "Ticket", "Trash2", "TrendingUp", "Truck", "Undo2", "Upload", "User", "UserCircle", "UserCog", "UserPlus", "Users", "Warehouse", "X", "XCircle", "Zap"],
          message: "ไอคอนนี้มีชื่อความหมายอยู่ใน @/lib/icons แล้ว — import จากที่นั่นแทน (เปลี่ยนไอคอนทั้งระบบได้ที่เดียว)",
        }],
      }],
    },
  },

  // ── ราคาขายจริง ───────────────────────────────────────────────────
  // ห้ามคิด "มีส่วนลดใช้ส่วนลด" เองในหน้า/route — ใช้ sellingPrice() จาก lib/product-display.ts
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}"],
    ignores: ["lib/product-display.ts"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "ConditionalExpression > BinaryExpression[operator='>'][left.property.name='discount_price']",
        message: "ห้ามคิดราคาขายจริงเอง — ใช้ sellingPrice(v) จาก @/lib/product-display (โปรโมชั่นคิดจาก default_price เสมอ ดู .claude/rules/domains/products.md)",
      }],
    },
  },
]);

export default eslintConfig;
