// Path: src/types/index.ts

// Company & Multi-Tenant Types
export type CompanyRole = 'owner' | 'admin' | 'manager' | 'account' | 'warehouse' | 'sales' | 'cashier';

// UserRole is an alias for CompanyRole (single source of truth)
export type UserRole = CompanyRole;

export interface Company {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  description?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxId?: string;
  taxCompanyName?: string;
  taxBranch?: string;
  website?: string;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyMembership {
  companyId: string;
  role: CompanyRole;
  company: Company;
}

export interface CompanyInvitation {
  id: string;
  companyId: string;
  email: string;
  role: CompanyRole;
  token: string;
  status: 'pending' | 'accepted' | 'expired' | 'cancelled';
  invitedBy: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface Package {
  id: string;
  name: string;
  slug: string;
  maxCompanies: number | null;
  maxMembersPerCompany: number | null;
  priceMonthly: number;
  priceYearly: number;
  features: Record<string, unknown>;
  isActive: boolean;
  sortOrder: number;
}

export interface UserSubscription {
  id: string;
  userId: string;
  packageId: string;
  package?: Package;
  status: 'active' | 'cancelled' | 'expired';
  startedAt: Date;
  expiresAt?: Date;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: CompanyRole;
  lineUserId?: string;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Customer Types
export type CustomerType = 'retail' | 'wholesale' | 'distributor';
export type CustomerStatus = 'active' | 'inactive' | 'lost';
export type ChurnRisk = 'low' | 'medium' | 'high';

export interface Customer {
  id: string;
  businessName: string;
  contactName: string;
  phone: string;
  email?: string;
  address: string;
  district: string;
  province: string;
  postalCode: string;
  type: CustomerType;
  status: CustomerStatus;
  creditLimit: number;
  creditTerm: number; // days (0 = cash)
  priceLevel: 'standard' | 'wholesale' | 'special';
  lineUserId?: string;
  lineGroupId?: string;
  churnRisk: ChurnRisk;
  firstOrderDate?: Date;
  lastOrderDate?: Date;
  totalOrders: number;
  totalRevenue: number;
  averageOrderValue: number;
  daysSinceLastOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

// Variation Type (managed in Settings, stored in DB)
export interface VariationType {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at?: string;
}

// Helper: Build display name from variation attributes
export function buildVariationDisplayName(attributes: Record<string, string> | null | undefined): string {
  if (!attributes) return '';
  const parts: string[] = [];
  for (const value of Object.values(attributes)) {
    if (value && value.trim()) parts.push(value.trim());
  }
  return parts.join(' / ') || '';
}

// Product Types
export interface Product {
  id: string;
  code: string;
  name: string;
  description?: string;
  category: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Raw Material Types
export interface RawMaterial {
  id: string;
  name: string;
  unit: string; // kg, liter
  currentStock: number;
  minStock: number;
  averagePrice: number;
  image?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Supplier Types
export interface Supplier {
  id: string;
  name: string;
  phone: string;
  email?: string;
  address: string;
  lineId?: string;
  rating: number; // 1-5
  averagePrice: number;
  status: 'active' | 'banned';
  rawMaterials: string[]; // array of raw material ids
  createdAt: Date;
  updatedAt: Date;
}

// Inventory Batch (FIFO)
export interface InventoryBatch {
  id: string;
  batchNumber: string; // INV240125001
  rawMaterialId: string;
  supplierId: string;
  quantity: number;
  remainingQuantity: number;
  pricePerUnit: number;
  totalPrice: number;
  receiptImage?: string;
  purchaseDate: Date;
  expiryDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Production Types
export interface ProductionBatch {
  id: string;
  batchNumber: string; // OJ250724001
  productId: string;
  status: 'planned' | 'in_production' | 'completed' | 'cancelled';
  plannedQuantity: {
    [variationLabel: string]: number;
  };
  actualQuantity?: {
    [variationLabel: string]: number;
  };
  rawMaterialsUsed?: {
    materialId: string;
    plannedQty: number;
    actualQty: number;
  }[];
  totalCost?: number;
  startDate?: Date;
  completedDate?: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Sales Order Types
export type OrderStatus = 'draft' | 'confirmed' | 'in_production' | 'ready' | 'delivered' | 'cancelled';
export type PaymentMethod = 'cash' | 'credit';
export type PaymentStatus = 'pending' | 'paid';

export interface SalesOrder {
  id: string;
  orderNumber: string; // SO241107001
  customerId: string;
  lineSource?: 'user' | 'group';
  lineSourceId?: string;
  orderDate: Date;
  deliveryDate: Date;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountType: 'amount' | 'percent';
  deliveryFee: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  paidAmount: number;
  dueDate?: Date;
  paidDate?: Date;
  deliveryType: 'pickup' | 'delivery';
  deliveryAddress?: string;
  notes?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrderItem {
  id: string;
  productId: string;
  variationLabel: string;
  quantity: number;
  pricePerUnit: number;
  total: number;
}

// Quality Control Types
export interface QualityTest {
  id: string;
  batchId: string;
  testType: 'before_mixing' | 'after_mixing';
  brixValue?: number;
  brixImage?: string;
  acidityValue?: number;
  acidityImage?: string;
  productImage?: string;
  notes?: string;
  testedBy: string;
  testedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// LINE Integration Types
export interface LineUser {
  id: string;
  userId: string;
  displayName: string;
  pictureUrl?: string;
  customerId?: string;
  messageCount: number;
  lastMessageAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface LineGroup {
  id: string;
  groupId: string;
  groupName: string;
  pictureUrl?: string;
  memberCount: number;
  customerId?: string;
  messageCount: number;
  orderCount: number;
  isActive: boolean;
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Dashboard Stats Types
export interface DashboardStats {
  // Production Stats
  todayProduction?: number;
  pendingQC?: number;
  lowStockItems?: number;
  
  // Sales Stats
  todaySales?: number;
  todayOrders?: number;
  newCustomers?: number;
  atRiskCustomers?: number;
  
  // Payment Stats
  overduePayments?: number;
  overdueAmount?: number;
  upcomingPayments?: number;
  upcomingAmount?: number;
}