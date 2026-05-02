export type {
  Category,
  CategoryInput,
  CategoryPosition,
  CategorySize,
  BorderStyle,
} from './model';
export { DEFAULT_CATEGORIES, hasRegisteredCategoryRegions } from './model';
// API 함수는 `@/entities/category/api` 로 분리 — firebase 정적 leak 차단.
