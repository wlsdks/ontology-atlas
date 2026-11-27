import { createRef } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DocsVaultVaultChip } from './DocsVaultVaultChip';

const t = ((key: string) => key) as never;

describe('DocsVaultVaultChip menu', () => {
  it('offers one switch-folder action and no choice of document source', () => {
    const onSwap = vi.fn();
    render(
      <DocsVaultVaultChip
        label="atlas"
        docCount={12}
        folderCount={4}
        path="atlas"
        isLocalSourceLoaded
        open
        onToggle={vi.fn()}
        onSwap={onSwap}
        onOpenAudit={vi.fn()}
        menuRef={createRef<HTMLDivElement>()}
        t={t}
      />,
    );

    expect(screen.queryByTestId('vault-chip-use-sample')).not.toBeInTheDocument();
    const swap = screen.getByTestId('vault-chip-use-local');
    expect(swap).toHaveAttribute('role', 'menuitem');
    fireEvent.click(swap);
    expect(onSwap).toHaveBeenCalledOnce();
  });
});
