// Re-export from new modular structure
// ไฟล์นี้เก็บไว้เพื่อ backward compatibility — import เดิมไม่พัง
export {
  allocateBundlePrice,
  calculateQtyDiscount,
  getPromotionComponents,
} from './promotions';

export type {
  PromotionComponent,
  PromotionItem,
  PromotionTier,
  PromotionHeader,
  PromotionType,
} from './promotions';
