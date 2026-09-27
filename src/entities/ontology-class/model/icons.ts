import {
  Box,
  Cog,
  FileText,
  Folder,
  HelpCircle,
  Layers,
  type LucideIcon,
} from 'lucide-react';

/** Kind → lucide icon. Shape only: icons use `currentColor`. Others fall back to HelpCircle. */
const KIND_ICON: Record<string, LucideIcon> = {
  project: Folder,
  domain: Layers,
  capability: Cog,
  element: Box,
  document: FileText,
  unknown: HelpCircle,
};

/** Unknown and legacy kinds get HelpCircle. */
export function getOntologyKindIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? HelpCircle;
}
