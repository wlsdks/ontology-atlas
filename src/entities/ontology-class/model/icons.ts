import {
  Box,
  Cog,
  FileText,
  Folder,
  HelpCircle,
  Layers,
  type LucideIcon,
} from 'lucide-react';

/**
 * ontology kind → lucide icon.
 *
 * kind 별 *직관적 metaphor* 를 시각으로 노출. 색은 단일 인디고 + 무채색
 * 헌장 유지 — icon 은 `currentColor` 로 받아 호출자가 색을 결정. 매핑은
 * *모양* 만 정의.
 *
 * unknown / stub 또는 legacy / 알 수 없는 kind 는 fallback HelpCircle.
 */
const KIND_ICON: Record<string, LucideIcon> = {
  project: Folder,
  domain: Layers,
  capability: Cog,
  element: Box,
  document: FileText,
  unknown: HelpCircle,
};

/**
 * kind 의 대표 lucide 아이콘 컴포넌트. 미지정/legacy kind 는 HelpCircle.
 */
export function getOntologyKindIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? HelpCircle;
}
