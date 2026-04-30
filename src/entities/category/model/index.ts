export type {
  Category,
  CategoryInput,
  CategoryPosition,
  CategorySize,
  BorderStyle,
} from './types';
export { fromFirestore, toFirestore } from './mapper';
export { DEFAULT_CATEGORIES } from './defaults';
export { hasRegisteredCategoryRegions } from './presence';
