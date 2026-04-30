import { DEFAULT_CATEGORIES } from './defaults';
import type { Category } from './types';

function normalizeCategorySignature(category: Pick<
  Category,
  | 'id'
  | 'label'
  | 'labelEn'
  | 'order'
  | 'position'
  | 'size'
  | 'radius'
  | 'borderStyle'
  | 'sideLabelText'
>) {
  return {
    id: category.id,
    label: category.label,
    labelEn: category.labelEn ?? null,
    order: category.order,
    position: category.position,
    size: category.size,
    radius: category.radius,
    borderStyle: category.borderStyle,
    sideLabelText: category.sideLabelText ?? null,
  };
}

/**
 * 카테고리가 "초기 기본값 그대로"인지 판별한다.
 * 공개 홈에서는 이 상태를 "영역을 따로 등록하지 않은 상태"로 보고
 * 큰 클러스터 배경과 영역 네비게이터를 숨긴다.
 */
export function hasRegisteredCategoryRegions(categories: Category[]): boolean {
  if (categories.length !== DEFAULT_CATEGORIES.length) {
    return true;
  }

  const defaultMap = new Map(
    DEFAULT_CATEGORIES.map((category) => [category.id, normalizeCategorySignature(category)]),
  );

  return categories.some((category) => {
    const baseline = defaultMap.get(category.id);
    if (!baseline) {
      return true;
    }

    return (
      JSON.stringify(normalizeCategorySignature(category)) !== JSON.stringify(baseline)
    );
  });
}
