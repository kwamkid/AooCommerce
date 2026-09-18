// Path: lib/icons.ts
//
// ทะเบียนไอคอนกลางของทั้งระบบ — "หนึ่งความหมาย = หนึ่งไอคอน" ทุกหน้า
//
// ⛔ ห้าม import ไอคอนจาก 'lucide-react' ตรง ๆ ในหน้า/คอมโพเนนต์อีก
//    ให้ import ชื่อความหมายจากไฟล์นี้แทน เช่น
//        import { ProductIcon, AddIcon } from '@/lib/icons';
//        <ProductIcon className="w-4 h-4" />
//    อยากเปลี่ยนไอคอนสินค้าทั้งระบบ = แก้บรรทัดเดียวในไฟล์นี้
//
// เหตุผล: ก่อนหน้านี้ไอคอนเดียวกันในเมนูข้าง กับในหน้าจริง เป็นคนละตัว
// (สินค้าเป็น Package2 ที่ sidebar แต่เป็น PackagePlus ในหน้าแก้ไขแบบชุด,
//  แบรนด์เป็น Award บ้าง BadgePlus บ้าง) จนดูเหมือนคนละระบบ
//
// กติกาเพิ่มไอคอนใหม่:
//  1. ตั้งชื่อตาม "ความหมาย" ไม่ใช่ชื่อรูป  — CouponIcon ไม่ใช่ TicketIcon
//  2. ความหมายใหม่ที่ยังไม่มีในนี้ → เพิ่มในหมวดที่ตรง แล้วใช้ชื่อนั้นทุกที่
//  3. ไอคอนที่ใช้ครั้งเดียวจริง ๆ (ภาพประกอบเฉพาะหน้า) import จาก lucide ตรงได้
//     แต่ถ้ามันแทน "ของ" ที่มีอยู่ในระบบอยู่แล้ว ต้องมาอยู่ในนี้เสมอ

import {
  AlertCircle,
  Ban,
  Banknote,
  AlertTriangle,
  ArrowDownToLine,
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Award,
  BarChart3,
  Bell,
  Box,
  Building2,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Clock,
  Copy,
  CreditCard,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  DollarSign,
  Factory,
  FileSpreadsheet,
  FileText,
  Filter,
  Gift,
  Globe,
  Handshake,
  Home,
  Image as ImageGlyph,
  ImagePlus,
  Info,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  MapPin,
  Megaphone,
  Mail,
  Menu,
  MessageCircle,
  MessageSquareText,
  Minus,
  Monitor,
  Moon,
  MoreVertical,
  Package,
  Pencil,
  Percent,
  Phone,
  Plus,
  Printer,
  Receipt,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  QrCode,
  Save,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Star,
  Store,
  Sun,
  Tag,
  Target,
  TrendingUp,
  Ticket,
  Trash2,
  Truck,
  Undo2,
  Upload,
  UserCircle,
  UserCog,
  User,
  UserPlus,
  Users,
  Warehouse,
  Zap,
  X,
  XCircle,
} from 'lucide-react';

export type { LucideIcon } from 'lucide-react';

/* ══ สินค้า & ข้อมูลหลัก ══════════════════════════════════════════════ */

/** สินค้า (ตัวสินค้าในระบบ) — คนละตัวกับ ParcelIcon ที่แปลว่า "หีบห่อที่จะส่ง" */
export const ProductIcon = Package;
/** หมวดหมู่สินค้า */
export const CategoryIcon = Tag;
/** แบรนด์ */
export const BrandIcon = Award;
/** สินค้าคงคลัง / สต๊อก */
export const InventoryIcon = Warehouse;
/** คลังสินค้า (ตัวคลังเอง) */
export const WarehouseIcon = Warehouse;
/** ซัพพลายเออร์ */
export const SupplierIcon = Factory;

/* ══ ขาย & ออเดอร์ ════════════════════════════════════════════════════ */

/** คำสั่งซื้อ */
export const OrderIcon = ShoppingCart;
/** หีบห่อ/พัสดุที่จะส่ง — ปุ่มกดรับ กดส่ง แยกพัสดุ ใบปะหน้า */
export const ParcelIcon = Box;
/** ขนส่ง / การจัดส่ง */
export const ShippingIcon = Truck;
/** ใบส่งสินค้า */
export const DeliveryNoteIcon = Truck;
/** พื้นที่/โซนจัดส่ง */
export const DeliveryZoneIcon = MapPin;
/** ช่องทางชำระเงิน */
export const PaymentIcon = CreditCard;
/** Cashier (POS) */
export const PosIcon = Monitor;
/** ร้าน / หน้าร้าน / ช่องทางการขาย / หน้าขาย PC */
export const StoreIcon = Store;
/** หน้าร้านออนไลน์ */
export const StorefrontIcon = Store;
/** ขายขาด (ตัวแทนขายขาด / ห้างขายขาด) */
export const WholesaleIcon = ShoppingBag;

/* ══ ลูกค้า & คู่ค้า ══════════════════════════════════════════════════ */

/** ลูกค้า (ทุกประเภท รวมลูกค้าตัวแทน/ลูกค้าห้าง) */
export const CustomerIcon = UserCircle;
/** ตัวแทนฝากขาย */
export const DealerIcon = Store;
/** ห้างฝากขาย */
export const DeptStoreIcon = Building2;
/** บริษัท (ตัวบริษัทของผู้ใช้เอง) */
export const CompanyIcon = Building2;
/** สมาชิก/ผู้ใช้ในทีม */
export const MemberIcon = UserCog;
/** กลุ่มคน (หลายคน) */
export const PeopleIcon = Users;

/* ══ การตลาด ═════════════════════════════════════════════════════════ */

/** โปรโมชั่น (ลดอัตโนมัติตามเงื่อนไข) */
export const PromotionIcon = Percent;
/** คูปองส่วนลด (ลูกค้ากรอกโค้ด) */
export const CouponIcon = Ticket;
/** บรอดแคสต์ */
export const BroadcastIcon = Megaphone;
/** บัญชีโฆษณา */
export const AdAccountIcon = Megaphone;
/** กลุ่มเป้าหมาย */
export const AudienceIcon = Target;
/** แชท */
export const ChatIcon = MessageCircle;
/** ข้อความสำเร็จรูป (Saved Reply) */
export const SavedReplyIcon = MessageSquareText;

/* ══ เอกสาร ══════════════════════════════════════════════════════════ */

/** เอกสารทั่วไป */
export const DocumentIcon = FileText;
/** ใบกำกับภาษี */
export const TaxInvoiceIcon = FileText;
/** ใบแจ้งหนี้ */
export const InvoiceIcon = FileText;
/** ใบกำกับอย่างย่อ */
export const AbbreviatedInvoiceIcon = ReceiptText;
/** ใบเสร็จรับเงิน */
export const ReceiptIcon = Receipt;
/** ใบลดหนี้ */
export const CreditNoteIcon = ReceiptText;
/** ใบรับคืน */
export const ReturnNoteIcon = RotateCcw;
/** ใบวางบิล */
export const StatementIcon = ClipboardList;
/** ใบสั่งซื้อ (PO) */
export const PurchaseOrderIcon = ClipboardList;
/** รายงานยอดขาย (ตัวเอกสาร/รายการ) */
export const SalesRecordIcon = ClipboardList;

/* ══ สต๊อก (เอกสารเคลื่อนไหว) ════════════════════════════════════════ */

/** รับสินค้าเข้าคลัง */
export const StockReceiveIcon = ArrowDownToLine;
/** เบิกสินค้าออก */
export const StockIssueIcon = ArrowUpFromLine;
/** โอนย้ายระหว่างคลัง */
export const StockTransferIcon = ArrowLeftRight;
/** คืนของให้ซัพพลายเออร์ */
export const SupplierReturnIcon = Undo2;

/* ══ ระบบ ════════════════════════════════════════════════════════════ */

export const DashboardIcon = Home;
export const ReportIcon = BarChart3;
export const SettingsIcon = Settings;
export const FeatureIcon = Handshake;
export const LogoutIcon = LogOut;
export const NotificationIcon = Bell;

/* ══ กริยา (ปุ่ม/การกระทำ) ═══════════════════════════════════════════ */

export const AddIcon = Plus;
export const EditIcon = Pencil;
export const DeleteIcon = Trash2;
export const SaveIcon = Save;
export const SearchIcon = Search;
export const FilterIcon = Filter;
export const RefreshIcon = RefreshCw;
export const CloseIcon = X;
export const ConfirmIcon = Check;
export const CancelIcon = X;
export const DownloadIcon = Download;
export const UploadIcon = Upload;
export const PrintIcon = Printer;
export const SendIcon = Send;
export const CopyIcon = Copy;
export const ViewIcon = Eye;
export const HideIcon = EyeOff;
export const BackIcon = ArrowLeft;
export const ForwardIcon = ArrowRight;
export const MoreIcon = MoreVertical;
export const LinkIcon = Link2;
export const CameraIcon = Camera;
export const ImageIcon = ImageGlyph;
export const CalendarIcon = Calendar;
export const TimeIcon = Clock;
export const LoadingIcon = Loader2;
export const UndoIcon = RotateCcw;

/* ══ ทิศทาง / สถานะ ══════════════════════════════════════════════════ */

export const ChevronDownIcon = ChevronDown;
export const ChevronUpIcon = ChevronUp;
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRightIcon = ChevronRight;

export const SuccessIcon = CheckCircle2;
export const WarningIcon = AlertTriangle;
export const ErrorIcon = XCircle;
export const InfoIcon = Info;
export const AlertIcon = AlertCircle;

/* ══ เบ็ดเตล็ด ═══════════════════════════════════════════════════════ */

/** ป้ายกำกับ/แท็กทั่วไป (ประเภทตัวเลือกสินค้า, แท็กลูกค้า ฯลฯ) */
export const TagIcon = Tag;
/** ส่วนลด (ป้ายลดราคา) */
export const DiscountIcon = Tag;
/** ตะกร้าสินค้า (หน้าร้านออนไลน์) */
export const CartIcon = ShoppingBag;
/** ย้อนรายการ/กลับรายการที่ทำไปแล้ว */
export const ReverseIcon = Undo2;
/** ธนาคาร */
export const BankIcon = Building2;
/** แพ็กเกจ/แผนสมาชิก (superadmin) */
export const SubscriptionIcon = Package;
/** ดีล/ข้อตกลงกับคู่ค้า (เงื่อนไขซัพพลายเออร์, ฝากขาย) */
export const DealIcon = Handshake;
/** ฝากขาย */
export const ConsignmentIcon = Handshake;
/** สถานที่/ที่อยู่ */
export const LocationIcon = MapPin;
/** เอกสารแบบใบเสร็จย่อ/ใบลดหนี้ */
export const ReceiptTextIcon = ReceiptText;
/** รายการตรวจ/เอกสารรายการ (ใบวางบิล, PO, รายงานยอดขาย) */
export const ChecklistIcon = ClipboardList;
/** ข้อความ/ข้อความสำเร็จรูป */
export const MessageIcon = MessageSquareText;
/** ลิงก์ออกนอกระบบ */
export const ExternalLinkIcon = ExternalLink;

/* ══ เพิ่มเติม (ใช้ซ้ำหลายหน้า) ══════════════════════════════════════ */

/** ผู้ใช้/บุคคลทั่วไป — ลูกค้าใช้ CustomerIcon */
export const UserIcon = User;
/** เพิ่มผู้ใช้/เชิญสมาชิก */
export const UserAddIcon = UserPlus;
/** เงิน/ยอดเงิน */
export const MoneyIcon = Banknote;
/** ราคา */
export const PriceIcon = DollarSign;
/** ของแถม/ของขวัญ */
export const GiftIcon = Gift;
/** โทรศัพท์ */
export const PhoneIcon = Phone;
/** อีเมล */
export const EmailIcon = Mail;
/** เว็บไซต์/ภาษา */
export const WebIcon = Globe;
/** QR code */
export const QrIcon = QrCode;
/** ล็อก/สิทธิ์ */
export const SecurityIcon = ShieldCheck;
/** รหัสผ่าน */
export const PasswordIcon = KeyRound;
/** ไฟล์ Excel */
export const ExcelIcon = FileSpreadsheet;
/** เพิ่มรูป */
export const ImageAddIcon = ImagePlus;
/** ลบออกทีละชิ้น/ลดจำนวน */
export const RemoveIcon = Minus;
/** ห้าม/ปิดการใช้งาน */
export const BanIcon = Ban;
/** แนวโน้มขึ้น (รายงาน) */
export const TrendUpIcon = TrendingUp;
/** เร็ว/อัตโนมัติ */
export const FastIcon = Zap;
/** รายการโปรด/ค่าตั้งต้น */
export const StarIcon = Star;
/** เมนู (มือถือ) */
export const MenuIcon = Menu;
/** รีเซ็ต/ลองใหม่ */
export const ResetIcon = RotateCcw;
/** ธีมสว่าง / ธีมมืด */
export const LightThemeIcon = Sun;
export const DarkThemeIcon = Moon;

/* ══ ชนิดโปรโมชั่น (ไอคอนประจำแต่ละแบบ) ═════════════════════════════ */

/** เซ็ตรวม */
export const PromoBundleIcon = Package;
/** ซื้อ X แถม Y ฟรี */
export const PromoFreeGiftIcon = Gift;
/** ซื้อ X ได้ Y ราคาพิเศษ */
export const PromoSpecialPriceIcon = Tag;
/** ซื้อเยอะลดเยอะ */
export const PromoQtyIcon = Percent;
/** เครื่องหมายเปอร์เซ็นต์ (หน่วยของส่วนลด ไม่ใช่ตัวโปรโมชั่น) */
export const PercentIcon = Percent;
