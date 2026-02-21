This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

==================
-- Path: database/schema.sql

-- ============================================
-- SECTION 1: ลบตารางเก่าทั้งหมด (ถ้ามี)
-- ============================================

-- ลบ Foreign Key Constraints ก่อน
ALTER TABLE IF EXISTS sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_order_id_fkey;
ALTER TABLE IF EXISTS sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_product_id_fkey;
ALTER TABLE IF EXISTS sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_bottle_type_id_fkey;

ALTER TABLE IF EXISTS sales_orders DROP CONSTRAINT IF EXISTS sales_orders_customer_id_fkey;
ALTER TABLE IF EXISTS sales_orders DROP CONSTRAINT IF EXISTS sales_orders_created_by_fkey;

ALTER TABLE IF EXISTS production_batches DROP CONSTRAINT IF EXISTS production_batches_product_id_fkey;
ALTER TABLE IF EXISTS production_batches DROP CONSTRAINT IF EXISTS production_batches_created_by_fkey;

ALTER TABLE IF EXISTS inventory_batches DROP CONSTRAINT IF EXISTS inventory_batches_raw_material_id_fkey;
ALTER TABLE IF EXISTS inventory_batches DROP CONSTRAINT IF EXISTS inventory_batches_supplier_id_fkey;

ALTER TABLE IF EXISTS quality_tests DROP CONSTRAINT IF EXISTS quality_tests_batch_id_fkey;
ALTER TABLE IF EXISTS quality_tests DROP CONSTRAINT IF EXISTS quality_tests_tested_by_fkey;

ALTER TABLE IF EXISTS customer_activities DROP CONSTRAINT IF EXISTS customer_activities_customer_id_fkey;
ALTER TABLE IF EXISTS customer_activities DROP CONSTRAINT IF EXISTS customer_activities_created_by_fkey;

ALTER TABLE IF EXISTS line_users DROP CONSTRAINT IF EXISTS line_users_customer_id_fkey;
ALTER TABLE IF EXISTS line_groups DROP CONSTRAINT IF EXISTS line_groups_customer_id_fkey;

-- ลบตารางทั้งหมด
DROP TABLE IF EXISTS line_message_templates CASCADE;
DROP TABLE IF EXISTS line_webhook_events CASCADE;
DROP TABLE IF EXISTS line_group_members CASCADE;
DROP TABLE IF EXISTS line_groups CASCADE;
DROP TABLE IF EXISTS line_users CASCADE;
DROP TABLE IF EXISTS customer_activities CASCADE;
DROP TABLE IF EXISTS quality_tests CASCADE;
DROP TABLE IF EXISTS production_raw_materials CASCADE;
DROP TABLE IF EXISTS production_batches CASCADE;
DROP TABLE IF EXISTS inventory_batches CASCADE;
DROP TABLE IF EXISTS supplier_ratings CASCADE;
DROP TABLE IF EXISTS supplier_materials CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS sales_order_items CASCADE;
DROP TABLE IF EXISTS sales_orders CASCADE;
DROP TABLE IF EXISTS price_lists CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS bottle_types CASCADE;
DROP TABLE IF EXISTS raw_materials CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS user_profiles CASCADE;

-- ลบ Types และ Enums เก่า
DROP TYPE IF EXISTS user_role CASCADE;
DROP TYPE IF EXISTS customer_type CASCADE;
DROP TYPE IF EXISTS customer_status CASCADE;
DROP TYPE IF EXISTS churn_risk CASCADE;
DROP TYPE IF EXISTS order_status CASCADE;
DROP TYPE IF EXISTS payment_method CASCADE;
DROP TYPE IF EXISTS payment_status CASCADE;
DROP TYPE IF EXISTS production_status CASCADE;
DROP TYPE IF EXISTS supplier_status CASCADE;

-- ============================================
-- SECTION 2: สร้าง ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('admin', 'manager', 'operation', 'sales');
CREATE TYPE customer_type AS ENUM ('retail', 'wholesale', 'distributor');
CREATE TYPE customer_status AS ENUM ('active', 'inactive', 'lost');
CREATE TYPE churn_risk AS ENUM ('low', 'medium', 'high');
CREATE TYPE order_status AS ENUM ('draft', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled');
CREATE TYPE payment_method AS ENUM ('cash', 'credit');
CREATE TYPE payment_status AS ENUM ('pending', 'paid');
CREATE TYPE production_status AS ENUM ('planned', 'in_production', 'completed', 'cancelled');
CREATE TYPE supplier_status AS ENUM ('active', 'banned');

-- ============================================
-- SECTION 3: สร้างตารางหลัก
-- ============================================

-- 1. User Profiles (ผู้ใช้งานระบบ)
CREATE TABLE user_profiles (
id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
email TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
role user_role NOT NULL DEFAULT 'operation',
line_user_id TEXT UNIQUE,
phone TEXT,
avatar TEXT,
is_active BOOLEAN DEFAULT true,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Products (สินค้า)
CREATE TABLE products (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
code TEXT NOT NULL UNIQUE,
name TEXT NOT NULL,
description TEXT,
category TEXT NOT NULL,
is_active BOOLEAN DEFAULT true,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Bottle Types (ขนาดขวด)
CREATE TABLE bottle_types (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
size TEXT NOT NULL UNIQUE, -- 250ml, 350ml, 1L
price DECIMAL(10,2) NOT NULL,
stock INTEGER DEFAULT 0,
min_stock INTEGER DEFAULT 0,
image TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Raw Materials (วัตถุดิบ)
CREATE TABLE raw_materials (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
name TEXT NOT NULL UNIQUE,
unit TEXT NOT NULL, -- kg, liter
current_stock DECIMAL(10,2) DEFAULT 0,
min_stock DECIMAL(10,2) DEFAULT 0,
average_price DECIMAL(10,2) DEFAULT 0,
image TEXT,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Suppliers (ซัพพลายเออร์)
CREATE TABLE suppliers (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
name TEXT NOT NULL,
phone TEXT NOT NULL,
email TEXT,
address TEXT,
line_id TEXT,
rating DECIMAL(2,1) DEFAULT 0,
average_price DECIMAL(10,2) DEFAULT 0,
status supplier_status DEFAULT 'active',
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Supplier Materials (วัตถุดิบที่ซัพพลายเออร์ขาย)
CREATE TABLE supplier_materials (
supplier_id UUID REFERENCES suppliers(id) ON DELETE CASCADE,
raw_material_id UUID REFERENCES raw_materials(id) ON DELETE CASCADE,
price_per_unit DECIMAL(10,2),
PRIMARY KEY (supplier_id, raw_material_id)
);

-- 7. Inventory Batches (สต็อควัตถุดิบ - FIFO)
CREATE TABLE inventory_batches (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
batch_number TEXT NOT NULL UNIQUE,
raw_material_id UUID REFERENCES raw_materials(id),
supplier_id UUID REFERENCES suppliers(id),
quantity DECIMAL(10,2) NOT NULL,
remaining_quantity DECIMAL(10,2) NOT NULL,
price_per_unit DECIMAL(10,2) NOT NULL,
total_price DECIMAL(10,2) NOT NULL,
receipt_image TEXT,
purchase_date DATE NOT NULL,
expiry_date DATE,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Customers (ลูกค้า)
CREATE TABLE customers (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
business_name TEXT NOT NULL,
contact_name TEXT NOT NULL,
phone TEXT NOT NULL,
email TEXT,
address TEXT NOT NULL,
district TEXT NOT NULL,
province TEXT NOT NULL,
postal_code TEXT,
type customer_type NOT NULL DEFAULT 'retail',
status customer_status DEFAULT 'active',
credit_limit DECIMAL(10,2) DEFAULT 0,
credit_term INTEGER DEFAULT 0, -- days
price_level TEXT DEFAULT 'standard',
line_user_id TEXT,
line_group_id TEXT,
churn_risk churn_risk DEFAULT 'low',
first_order_date DATE,
last_order_date DATE,
total_orders INTEGER DEFAULT 0,
total_revenue DECIMAL(10,2) DEFAULT 0,
average_order_value DECIMAL(10,2) DEFAULT 0,
days_since_last_order INTEGER DEFAULT 0,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Production Batches (การผลิต)
CREATE TABLE production_batches (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
batch_number TEXT NOT NULL UNIQUE,
product_id UUID REFERENCES products(id),
status production_status DEFAULT 'planned',
planned_quantity JSONB NOT NULL, -- {"250ml": 100, "350ml": 50}
actual_quantity JSONB,
raw_materials_used JSONB, -- [{materialId, plannedQty, actualQty}]
total_cost DECIMAL(10,2),
start_date TIMESTAMPTZ,
completed_date TIMESTAMPTZ,
created_by UUID REFERENCES user_profiles(id),
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Quality Tests (การตรวจสอบคุณภาพ)
CREATE TABLE quality_tests (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
batch_id UUID REFERENCES production_batches(id),
test_type TEXT CHECK (test_type IN ('before_mixing', 'after_mixing')),
brix_value DECIMAL(5,2),
brix_image TEXT,
acidity_value DECIMAL(5,2),
acidity_image TEXT,
product_image TEXT,
notes TEXT,
tested_by UUID REFERENCES user_profiles(id),
tested_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Sales Orders (คำสั่งซื้อ)
CREATE TABLE sales_orders (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
order_number TEXT NOT NULL UNIQUE,
customer_id UUID REFERENCES customers(id),
line_source TEXT,
line_source_id TEXT,
order_date DATE NOT NULL,
delivery_date DATE NOT NULL,
status order_status DEFAULT 'draft',
subtotal DECIMAL(10,2) NOT NULL,
discount DECIMAL(10,2) DEFAULT 0,
discount_type TEXT DEFAULT 'amount',
delivery_fee DECIMAL(10,2) DEFAULT 0,
total DECIMAL(10,2) NOT NULL,
payment_method payment_method NOT NULL,
payment_status payment_status DEFAULT 'pending',
paid_amount DECIMAL(10,2) DEFAULT 0,
due_date DATE,
paid_date DATE,
delivery_type TEXT DEFAULT 'pickup',
delivery_address TEXT,
notes TEXT,
created_by UUID REFERENCES user_profiles(id),
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Sales Order Items (รายการในคำสั่งซื้อ)
CREATE TABLE sales_order_items (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
order_id UUID REFERENCES sales_orders(id) ON DELETE CASCADE,
product_id UUID REFERENCES products(id),
bottle_type_id UUID REFERENCES bottle_types(id),
quantity INTEGER NOT NULL,
price_per_unit DECIMAL(10,2) NOT NULL,
total DECIMAL(10,2) NOT NULL
);

-- 13. Customer Activities (กิจกรรมลูกค้า)
CREATE TABLE customer_activities (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
customer_id UUID REFERENCES customers(id),
activity_type TEXT NOT NULL,
description TEXT NOT NULL,
order_id UUID,
follow_up_date DATE,
created_by UUID REFERENCES user_profiles(id),
created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. LINE Users (ผู้ใช้ LINE)
CREATE TABLE line_users (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
user_id TEXT NOT NULL UNIQUE,
display_name TEXT NOT NULL,
picture_url TEXT,
customer_id UUID REFERENCES customers(id),
message_count INTEGER DEFAULT 0,
last_message_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. LINE Groups (กลุ่ม LINE)
CREATE TABLE line_groups (
id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
group_id TEXT NOT NULL UNIQUE,
group_name TEXT NOT NULL,
picture_url TEXT,
member_count INTEGER DEFAULT 0,
customer_id UUID REFERENCES customers(id),
message_count INTEGER DEFAULT 0,
order_count INTEGER DEFAULT 0,
is_active BOOLEAN DEFAULT true,
last_activity_at TIMESTAMPTZ,
created_at TIMESTAMPTZ DEFAULT NOW(),
updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- SECTION 4: สร้าง Indexes สำหรับ Performance
-- ============================================

CREATE INDEX idx_customers_status ON customers(status);
CREATE INDEX idx_customers_churn_risk ON customers(churn_risk);
CREATE INDEX idx_sales_orders_customer ON sales_orders(customer_id);
CREATE INDEX idx_sales_orders_status ON sales_orders(status);
CREATE INDEX idx_sales_orders_payment_status ON sales_orders(payment_status);
CREATE INDEX idx_inventory_batches_material ON inventory_batches(raw_material_id);
CREATE INDEX idx_inventory_batches_remaining ON inventory_batches(remaining_quantity);
CREATE INDEX idx_production_batches_status ON production_batches(status);

-- ============================================
-- SECTION 5: สร้าง Functions สำหรับ Updated_at
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = NOW();
RETURN NEW;
END;

$$
LANGUAGE plpgsql;

-- ============================================
-- SECTION 6: สร้าง Triggers
-- ============================================

CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON suppliers
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_raw_materials_updated_at BEFORE UPDATE ON raw_materials
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_inventory_batches_updated_at BEFORE UPDATE ON inventory_batches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_production_batches_updated_at BEFORE UPDATE ON production_batches
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON sales_orders
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- SECTION 7: Row Level Security (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;

-- Create policies (ตัวอย่าง - คุณอาจต้องปรับตามความต้องการ)
CREATE POLICY "Users can view their own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles" ON user_profiles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM user_profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================
-- SECTION 8: Insert Initial Data
-- ============================================

-- Insert sample products
INSERT INTO products (code, name, category) VALUES
    ('OJ001', 'น้ำส้มคั้นสด', 'juice'),
    ('LJ001', 'น้ำมะนาวคั้นสด', 'juice'),
    ('HB001', 'น้ำเก๊กฮวย', 'herbal'),
    ('BF001', 'น้ำอัญชัน-มะนาว', 'herbal');

-- Insert bottle types
INSERT INTO bottle_types (size, price) VALUES
    ('250ml', 5),
    ('350ml', 7),
    ('1L', 15);

-- Insert raw materials
INSERT INTO raw_materials (name, unit, min_stock) VALUES
    ('ส้มเขียวหวาน', 'kg', 50),
    ('มะนาว', 'kg', 30),
    ('น้ำตาล', 'kg', 20),
    ('เก๊กฮวย', 'kg', 10),
    ('ดอกอัญชัน', 'kg', 5);

-- ============================================
-- คำสั่งเสร็จสิ้น!
-- รัน SQL นี้ใน Supabase SQL Editor
-- ============================================
$$
# aoocommerce
