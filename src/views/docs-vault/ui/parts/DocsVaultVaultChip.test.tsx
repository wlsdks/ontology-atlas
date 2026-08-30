import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocsVaultVaultChip } from './DocsVaultVaultChip';

const t = ((key: string) => key) as never;

describe('DocsVaultVaultChip — installed app source boundary', () => {
  it('omits the sample source choice when the installed shell forbids bundled vaults', () => {
    render(
      <DocsVaultVaultChip
        label="atlas"
        docCount={12}
        folderCount={4}
        path="atlas"
        isLocalSourceLoaded
        open
        onToggle={vi.fn()}
        onSwap={vi.fn()}
        isSample={false}
        onUseSample={vi.fn()}
        allowSample={false}
        onOpenAudit={vi.fn()}
        menuRef={createRef<HTMLDivElement>()}
        t={t}
      />,
    );

    expect(screen.queryByTestId('vault-chip-use-sample')).not.toBeInTheDocument();
    expect(screen.getByTestId('vault-chip-use-local')).toHaveAttribute('role', 'menuitem');
  });
});
