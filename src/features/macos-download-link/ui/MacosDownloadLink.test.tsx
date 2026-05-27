import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  GITHUB_RELEASES_URL,
  MacosDownloadLink,
} from './MacosDownloadLink';

describe('MacosDownloadLink', () => {
  it('links to the GitHub Releases page without depending on a latest-release URL', () => {
    render(<MacosDownloadLink>Download</MacosDownloadLink>);

    expect(screen.getByRole('link', { name: 'Download' })).toHaveAttribute(
      'href',
      GITHUB_RELEASES_URL,
    );
  });
});
