import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FirstRunReadout } from './FirstRunReadout';

const mocks = vi.hoisted(() => ({
  visible: true,
}));

vi.mock('../model/use-first-run-sample-mode-settled', () => ({
  useFirstRunSampleModeSettled: () => mocks.visible,
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('FirstRunReadout', () => {
  beforeEach(() => {
    mocks.visible = true;
  });

  it('renders the real project/domain counts when sample mode has settled', () => {
    render(<FirstRunReadout projectCount={1} domainCount={6} />);

    expect(screen.getByTestId('first-run-readout')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('renders nothing once a vault is active (sample mode not settled to static)', () => {
    mocks.visible = false;
    render(<FirstRunReadout projectCount={1} domainCount={6} />);

    expect(screen.queryByTestId('first-run-readout')).not.toBeInTheDocument();
  });

  it('does not depend on the starter module dismiss state (stays visible after dismiss)', () => {
    // useFirstRunSampleModeSettled has no knowledge of the module's own
    // sessionStorage dismiss flag — this test documents that boundary.
    mocks.visible = true;
    render(<FirstRunReadout projectCount={1} domainCount={6} />);
    expect(screen.getByTestId('first-run-readout')).toBeInTheDocument();
  });
});
