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
 * Gives each kind an intuitive visual metaphor. The charter's single-indigo palette
 * is preserved: the icon takes `currentColor`, so the caller decides the colour and
 * this map defines *shape* only.
 *
 * unknown, stub, and legacy kinds fall back to HelpCircle.
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
 * The representative lucide icon for a kind. Unknown and legacy kinds get HelpCircle.
 */
export function getOntologyKindIcon(kind: string): LucideIcon {
  return KIND_ICON[kind] ?? HelpCircle;
}
