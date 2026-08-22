import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { GithubMark } from './github-mark';

/**
 * What this test protects is not whether the mark looks good but **the premise the charter
 * decision rested on**.
 *
 * The mark is permitted because it is GitHub's own mark, unmodified, used to point at GitHub.
 * So two regressions would destroy that premise: ① the coordinates no longer being the
 * original, and ② the mark bringing its own colour (against the greyscale-plus-one-indigo
 * charter).
 */
describe('GithubMark', () => {
  it('renders the unmodified Octicons mark-github-16 geometry', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16');

    const path = container.querySelector('path[data-mark-part="octicon"]');
    // Start and end of the original path — scaling, simplifying or retouching trips this.
    expect(path?.getAttribute('d')).toMatch(/^M8 0c4\.42 0 8 3\.58 8 8/);
    expect(path?.getAttribute('d')).toMatch(/0-4\.42 3\.58-8 8-8Z$/);
  });

  it('inherits the caller colour instead of shipping a brand colour', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('fill', 'currentColor');
    expect(container.innerHTML).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it('is decorative by default and sizes to the optical default', () => {
    const { container } = render(<GithubMark />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('width', '14');
    expect(svg).toHaveAttribute('height', '14');
  });

  it('forwards size and extra svg props', () => {
    const { container } = render(<GithubMark size={20} className="my-mark" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '20');
    expect(svg).toHaveClass('my-mark');
  });
});
