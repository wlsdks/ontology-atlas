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
  // The latin-eyebrow verdict reads the screen's language.
  useLocale: () => "ko",
  useTranslations: () => (key: string) => key,
}));

describe('FirstRunReadout', () => {
  beforeEach(() => {
    mocks.visible = true;
  });

  it('names how many concepts are drawn, not how many projects the vault has', () => {
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} />);

    expect(screen.getByTestId('first-run-readout')).toBeInTheDocument();
    expect(screen.getByText('36')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByTestId('first-run-readout')).toHaveAttribute('data-drawn-concepts', '36');
  });

  /*
   * The Cone view draws every concept at every zoom, so "Domains only · zoom in to
   * reveal elements" stood under 125 visible dots and was simply false (measured
   * 2026-09-05). The count decides, so a view never has to remember to opt out.
   */
  it('drops the tier label and the zoom hint once every concept is already drawn', () => {
    render(<FirstRunReadout conceptCount={125} totalConceptCount={125} domainCount={9} />);

    expect(screen.getByText('125')).toBeInTheDocument();
    expect(screen.queryByTestId('first-run-readout-tier')).not.toBeInTheDocument();
    expect(screen.queryByTestId('first-run-readout-zoom-hint')).not.toBeInTheDocument();
  });

  it('keeps them in plain mode too when nothing is left to reveal', () => {
    render(
      <FirstRunReadout conceptCount={125} totalConceptCount={125} domainCount={9} audiencePlain />,
    );
    expect(screen.queryByTestId('first-run-readout-zoom-hint')).not.toBeInTheDocument();
  });

  it('M-5: defaults to the spine tier label and shows the "zoom in to see elements" hint', () => {
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} />);
    // translations are mocked to echo the key
    expect(screen.getByTestId('first-run-readout-tier')).toHaveTextContent('tier_spine');
    expect(screen.getByTestId('first-run-readout-zoom-hint')).toHaveTextContent('zoomHint');
    expect(screen.getByTestId('first-run-readout')).toHaveAttribute('data-zoom-tier', 'spine');
  });

  it('M-5: at the circuit tier the label updates but the zoom hint still shows (elements not yet revealed)', () => {
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} tier="circuit" />);
    expect(screen.getByTestId('first-run-readout-tier')).toHaveTextContent('tier_circuit');
    expect(screen.getByTestId('first-run-readout-zoom-hint')).toBeInTheDocument();
  });

  it('M-5: at the element tier the label switches to ELEMENT and the "zoom in to see elements" hint is dropped (no orientation lie)', () => {
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} tier="element" />);
    expect(screen.getByTestId('first-run-readout-tier')).toHaveTextContent('tier_element');
    expect(screen.queryByTestId('first-run-readout-zoom-hint')).not.toBeInTheDocument();
    expect(screen.getByTestId('first-run-readout')).toHaveAttribute('data-zoom-tier', 'element');
  });

  it('renders nothing once a vault is active (sample mode not settled to static)', () => {
    mocks.visible = false;
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} />);

    expect(screen.queryByTestId('first-run-readout')).not.toBeInTheDocument();
  });

  it('does not depend on the starter module dismiss state (stays visible after dismiss)', () => {
    // useFirstRunSampleModeSettled has no knowledge of the module's own
    // sessionStorage dismiss flag — this test documents that boundary.
    mocks.visible = true;
    render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} />);
    expect(screen.getByTestId('first-run-readout')).toBeInTheDocument();
  });

  // In plain (non-developer) mode the element tier is unreachable
  // (`PLAIN_TIER_REVEAL`), so "zoom in to see elements" stays false forever. Plain mode
  // always shows the click-based wording regardless of tier.
  describe('audiencePlain (P1 결함①b)', () => {
    it('shows the plain click-based hint instead of the zoom hint, regardless of tier', () => {
      render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} tier="circuit" audiencePlain />);
      expect(screen.getByTestId('first-run-readout-zoom-hint')).toHaveTextContent('zoomHintPlain');
    });

    it('never drops the plain hint even at the element tier (zoom cannot reveal elements in plain mode)', () => {
      render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} tier="element" audiencePlain />);
      expect(screen.getByTestId('first-run-readout-zoom-hint')).toHaveTextContent('zoomHintPlain');
    });

    it('leaves the developer-mode zoom hint untouched when audiencePlain is false/omitted', () => {
      render(<FirstRunReadout conceptCount={36} totalConceptCount={125} domainCount={6} tier="spine" />);
      expect(screen.getByTestId('first-run-readout-zoom-hint')).toHaveTextContent('zoomHint');
    });
  });
});
