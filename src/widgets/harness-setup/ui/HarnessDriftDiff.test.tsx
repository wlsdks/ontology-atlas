import { render } from '@testing-library/react';
import { IntlProvider, useTranslations } from 'use-intl';
import { describe, expect, it } from 'vitest';

import koMessages from '../../../../messages/ko.json';

import { HarnessDriftDiff } from './HarnessDriftDiff';

function Diff({ showVendorMarks }: { showVendorMarks?: boolean }) {
  const t = useTranslations('harness');
  return (
    <HarnessDriftDiff
      paths={['.claude/agents/reviewer.md', '.agents/agents/reviewer.md']}
      texts={['name: reviewer\ntools: Read\n', 'name: reviewer\ntools: Bash\n']}
      current
      showVendorMarks={showVendorMarks}
      t={t}
    />
  );
}

function renderDiff(showVendorMarks?: boolean) {
  return render(
    <IntlProvider locale="ko" messages={koMessages}>
      <Diff showVendorMarks={showVendorMarks} />
    </IntlProvider>,
  );
}

describe('HarnessDriftDiff', () => {
  it('heads each copy with its tool’s mark and name', () => {
    const { container } = renderDiff();
    expect(container.querySelectorAll('[data-vendor-mark]')).toHaveLength(2);
    expect(container.textContent).toContain('Claude Code');
    expect(container.textContent).toContain('Codex');
  });

  it('without vendor marks keeps the tool names and draws no logo', () => {
    const { container } = renderDiff(false);
    expect(container.querySelectorAll('[data-vendor-mark], img')).toHaveLength(0);
    expect(container.textContent).toContain('Claude Code');
    expect(container.textContent).toContain('Codex');
  });
});
