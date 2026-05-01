import {
  Box,
  CheckSquare,
  Cog,
  FileText,
  Folder,
  HelpCircle,
  Layers,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

/**
 * ontology kind → lucide icon (Phase 4 / T35).
 *
 * 비개발자 청중을 위해 kind 별로 *직관적 metaphor* 를 시각적으로 노출.
 * 색은 단일 인디고 + 무채색 헌장 유지 — icon 은 `currentColor` 로 받아
 * 호출자가 색을 결정. 즉 이 매핑은 *모양* 만 정의, *색* 은 디자인 헌장
 * 그대로.
 *
 * unknown / stub 같은 미해결 kind 는 HelpCircle — "kind 미지정" 의미.
 *
 * legacy / 알 수 없는 kind 가 들어와도 fallback (HelpCircle) 으로 안전.
 */
const KIND_ICON: Record<string, LucideIcon> = {
  project: Folder,
  domain: Layers,
  capability: Cog,
  element: Box,
  document: FileText,
  decision: CheckSquare,
  workflow: Workflow,
  unknown: HelpCircle,
};

/**
 * kind 의 대표 lucide 아이콘 컴포넌트. 미지정/legacy kind 는 HelpCircle.
 */
export function getOntologyKindIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? HelpCircle;
}
