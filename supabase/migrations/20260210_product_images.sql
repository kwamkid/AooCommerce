-- Create product_images table for storing multiple images per product/variation
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sellable_product_id UUID REFERENCES sellable_products(id) ON DELETE CASCADE,
  variation_id UUID REFERENCES sellable_product_variations(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT product_images_owner_check CHECK (
    sellable_product_id IS NOT NULL OR variation_id IS NOT NULL
  )
);

CREATE INDEX idx_product_images_product ON product_images(sellable_product_id);
CREATE INDEX idx_product_images_variation ON product_images(variation_id);
