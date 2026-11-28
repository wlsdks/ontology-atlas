import {
  Bold,
  CheckSquare,
  Code as CodeIcon,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Quote,
} from 'lucide-react';
import { useTranslations } from 'use-intl';
import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';
import { ToolbarButton } from './ToolbarButton';

interface Props {
  onWrapSelection: (wrapper: string) => void;
  onPrefixLine: (prefix: string) => void;
  onInsertLink: () => void;
}

export function EditorToolbar({ onWrapSelection, onPrefixLine, onInsertLink }: Props) {
  const t = useTranslations('vaultWidgets.editor');
  return (
    <div className="flex flex-none items-center gap-0.5 border-b border-[color:var(--color-overlay-2)] bg-[color:var(--color-elevated)] px-3 py-1 text-[color:var(--color-text-tertiary)]">
      <ToolbarButton
        icon={<Bold size={ICON_SIZE.sm} />}
        label={t('tbBold')}
        onClick={() => onWrapSelection('**')}
      />
      <ToolbarButton
        icon={<Italic size={ICON_SIZE.sm} />}
        label={t('tbItalic')}
        onClick={() => onWrapSelection('*')}
      />
      <ToolbarButton
        icon={<CodeIcon size={ICON_SIZE.sm} />}
        label={t('tbCode')}
        onClick={() => onWrapSelection('`')}
      />
      <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
      <ToolbarButton
        icon={<Heading1 size={ICON_SIZE.sm} />}
        label={t('tbH1')}
        onClick={() => onPrefixLine('# ')}
      />
      <ToolbarButton
        icon={<Heading2 size={ICON_SIZE.sm} />}
        label={t('tbH2')}
        onClick={() => onPrefixLine('## ')}
      />
      <ToolbarButton
        icon={<Heading3 size={ICON_SIZE.sm} />}
        label={t('tbH3')}
        onClick={() => onPrefixLine('### ')}
      />
      <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
      <ToolbarButton
        icon={<List size={ICON_SIZE.sm} />}
        label={t('tbBullet')}
        onClick={() => onPrefixLine('- ')}
      />
      <ToolbarButton
        icon={<ListOrdered size={ICON_SIZE.sm} />}
        label={t('tbNumbered')}
        onClick={() => onPrefixLine('1. ')}
      />
      <ToolbarButton
        icon={<CheckSquare size={ICON_SIZE.sm} />}
        label={t('tbCheckbox')}
        onClick={() => onPrefixLine('- [ ] ')}
      />
      <ToolbarButton
        icon={<Quote size={ICON_SIZE.sm} />}
        label={t('tbQuote')}
        onClick={() => onPrefixLine('> ')}
      />
      <span className="mx-1 h-4 w-px bg-[color:var(--color-divider)]" />
      <ToolbarButton
        icon={<LinkIcon size={ICON_SIZE.sm} />}
        label={t('tbLink')}
        onClick={onInsertLink}
      />
    </div>
  );
}
