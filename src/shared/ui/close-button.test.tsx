import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CloseButton, OVERLAY_CLOSE_BOX, OVERLAY_CLOSE_ICON_SIZE } from './close-button';
import { ICON_SIZE } from './icon-size';

const CONSUMERS = [
  'src/widgets/app-settings-menu/ui/AppSettingsMenu.tsx',
  'src/widgets/search-palette/ui/SearchPalette.tsx',
  'src/widgets/global-search/ui/GlobalSearch.tsx',
  'src/widgets/shortcut-sheet/ui/ShortcutSheet.tsx',
  'src/widgets/ontology-map/ui/OntologyMapDetailPanel.tsx',
  'src/widgets/ontology-map/ui/OntologyMapEdgePanel.tsx',
  'src/widgets/vault-agent-panel/ui/VaultAgentPanel.tsx',
  'src/widgets/analysis-workbench/ui/AnalysisWorkbench.tsx',
  'src/widgets/acp-chat-panel/ui/AcpDockHeader.tsx',
  'src/widgets/full-detail-a1/ui/FullDetailA1.tsx',
  'src/widgets/project-drawer/ui/ProjectDrawer.tsx',
  'src/widgets/library-import/ui/LibraryImportDialog.tsx',
  'src/widgets/library-graph/ui/LibraryMarkPopover.tsx',
  'src/views/architecture/ui/ArchitectureWorkbench.tsx',
  'src/views/docs-vault/ui/parts/DocsVaultAuditModal.tsx',
  'src/views/library/ui/parts/LibraryHomePopover.tsx',
  'src/views/home/ui/TopologyBlockingOverlays.tsx',
  'src/features/project-quick-edit/ui/ProjectQuickEditPanel.tsx',
  'src/features/library/ui/FindDocumentsDialog.tsx',
  'src/features/mcp-connectors/ui/AddConnectorDialog.tsx',
  'src/features/mcp-connectors/ui/ConnectorsPanel.tsx',
  'src/features/vault-ontology/ui/RecentChangesNeedsVaultDialog.tsx',
  'src/features/docs-vault-local/ui/VaultOpenGuideSheet.tsx',
  'src/features/ontology-meaning-editor/ui/MeaningEditorPanel.tsx',
  'src/features/gray-area/ui/GrayAreaInspector.tsx',
  'src/features/ontology-blocks/ui/BlockImportModule.tsx',
] as const;

const read = (relative: string) => readFileSync(join(process.cwd(), relative), 'utf8');

describe('CloseButton', () => {
  it('is an icon control in the overlay close box with the medium glyph', () => {
    render(<CloseButton label="Close" />);
    const button = screen.getByRole('button', { name: 'Close' });
    expect(button.getAttribute('data-control')).toBe('icon');
    expect(button.className).toContain(OVERLAY_CLOSE_BOX);
    expect(button.className).not.toMatch(/(?:^|\s)[hw]-[678](?:\s|$)/);
    expect(button.querySelector('svg')?.getAttribute('width')).toBe(String(ICON_SIZE.md));
    expect(OVERLAY_CLOSE_ICON_SIZE).toBe(ICON_SIZE.md);
  });

  it('keeps a placement class and forwards data attributes', () => {
    render(<CloseButton label="Close" className="ml-auto" data-testid="sheet-close" />);
    const button = screen.getByTestId('sheet-close');
    expect(button.className).toContain('ml-auto');
    expect(button.className).toContain(OVERLAY_CLOSE_BOX);
  });

  it('every overlay close in the shared slice is this control, and the toast reads its box', () => {
    for (const file of CONSUMERS) {
      const source = read(file);
      expect(source, `${file} does not draw CloseButton`).toContain('<CloseButton');
      expect(source, `${file} sizes a close button by hand`).not.toContain('--overlay-close-size');
    }
    const toast = read('src/shared/ui/toast.tsx');
    expect(toast).toContain('OVERLAY_CLOSE_BOX');
    expect(toast).toContain('OVERLAY_CLOSE_ICON_SIZE');
  });
});
