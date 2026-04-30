import type { Category, CategoryInput, BorderStyle } from '@/entities/category';

const DEFAULT_DRAFT_WIDTH = 800;
const DEFAULT_DRAFT_HEIGHT = 1000;
const DEFAULT_DRAFT_RADIUS = 320;
const DEFAULT_DRAFT_GAP = 240;

export const DRAFT_CATEGORY_ID = '__draft__';

export type CategoryDraft = {
  id: string;
  label: string;
  labelEn: string;
  order: string;
  positionX: string;
  positionY: string;
  width: string;
  height: string;
  radius: string;
  borderStyle: BorderStyle;
  sideLabelText: string;
};

export const BORDER_STYLE_OPTIONS: Array<{ value: BorderStyle; label: string }> = [
  { value: 'underline', label: 'Underline' },
  { value: 'dashed', label: 'Dashed' },
  { value: 'sideLabel', label: 'Side label' },
  { value: 'solid', label: 'Solid' },
];

function readNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildSuggestedPosition(categories: Category[]) {
  if (categories.length === 0) {
    return { x: 0, y: 0 };
  }

  const maxRight = Math.max(
    ...categories.map((category) => category.position.x + category.size.width / 2),
  );

  return {
    x: Math.round(maxRight + DEFAULT_DRAFT_GAP + DEFAULT_DRAFT_WIDTH / 2),
    y: 0,
  };
}

export function createEmptyDraft(nextOrder: number, categories: Category[] = []): CategoryDraft {
  const suggested = buildSuggestedPosition(categories);
  return {
    id: '',
    label: '',
    labelEn: '',
    order: String(nextOrder),
    positionX: String(suggested.x),
    positionY: String(suggested.y),
    width: String(DEFAULT_DRAFT_WIDTH),
    height: String(DEFAULT_DRAFT_HEIGHT),
    radius: String(DEFAULT_DRAFT_RADIUS),
    borderStyle: 'solid',
    sideLabelText: '',
  };
}

export function toDraft(category: Category): CategoryDraft {
  return {
    id: category.id,
    label: category.label,
    labelEn: category.labelEn ?? '',
    order: String(category.order),
    positionX: String(category.position.x),
    positionY: String(category.position.y),
    width: String(category.size.width),
    height: String(category.size.height),
    radius: String(category.radius),
    borderStyle: category.borderStyle,
    sideLabelText: category.sideLabelText ?? '',
  };
}

export function toInput(draft: CategoryDraft): CategoryInput {
  return {
    id: draft.id.trim(),
    label: draft.label.trim(),
    labelEn: draft.labelEn.trim() || undefined,
    order: Number(draft.order),
    position: {
      x: Number(draft.positionX),
      y: Number(draft.positionY),
    },
    size: {
      width: Number(draft.width),
      height: Number(draft.height),
    },
    radius: Number(draft.radius),
    borderStyle: draft.borderStyle,
    sideLabelText:
      draft.borderStyle === 'sideLabel' && draft.sideLabelText.trim()
        ? draft.sideLabelText.trim()
        : undefined,
  };
}

export function getNextOrder(categories: Category[]) {
  return categories.length === 0 ? 0 : Math.max(...categories.map((category) => category.order)) + 1;
}

export function validateDraft(
  draft: CategoryDraft,
  editingId: string | null,
  categories: Category[],
): string | null {
  const id = draft.id.trim();
  if (editingId && id !== editingId) {
    return '기존 카테고리 ID는 변경할 수 없습니다.';
  }
  if (!/^[a-z0-9-]+$/.test(id)) {
    return 'ID는 소문자, 숫자, 하이픈만 사용할 수 있습니다.';
  }
  if (!draft.label.trim()) return '라벨을 입력하세요.';
  const numericFields = [
    draft.order,
    draft.positionX,
    draft.positionY,
    draft.width,
    draft.height,
    draft.radius,
  ];
  if (numericFields.some((value) => value.trim() === '' || Number.isNaN(Number(value)))) {
    return '숫자 필드를 확인하세요.';
  }
  const duplicated = categories.find((category) => category.id === id);
  if (duplicated && duplicated.id !== editingId) {
    return '같은 ID의 카테고리가 이미 있습니다.';
  }
  return null;
}

export function applyDraftToCategories(
  categories: Category[],
  selectedId: string | null,
  draft: CategoryDraft,
) {
  const preview = toPreviewCategory(draft);
  if (!preview) return categories;

  if (!selectedId) {
    if (categories.some((category) => category.id === preview.id)) {
      return categories;
    }
    return [...categories, preview];
  }

  return categories.map((category) => (category.id === selectedId ? preview : category));
}

function toPreviewCategory(draft: CategoryDraft): Category | null {
  const order = readNumber(draft.order, 0);
  const positionX = readNumber(draft.positionX, 0);
  const positionY = readNumber(draft.positionY, 0);
  const width = Math.max(DEFAULT_DRAFT_WIDTH / 2, readNumber(draft.width, DEFAULT_DRAFT_WIDTH));
  const height = Math.max(DEFAULT_DRAFT_HEIGHT / 2, readNumber(draft.height, DEFAULT_DRAFT_HEIGHT));
  const radius = Math.max(160, readNumber(draft.radius, DEFAULT_DRAFT_RADIUS));

  return {
    id: draft.id.trim() || DRAFT_CATEGORY_ID,
    label: draft.label.trim() || '새 카테고리',
    labelEn: draft.labelEn.trim() || 'New Category',
    order,
    position: { x: positionX, y: positionY },
    size: { width, height },
    radius,
    borderStyle: draft.borderStyle,
    sideLabelText:
      draft.borderStyle === 'sideLabel' && draft.sideLabelText.trim()
        ? draft.sideLabelText.trim()
        : undefined,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}
