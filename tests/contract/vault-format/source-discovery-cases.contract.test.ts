import { describe, expect, it } from 'vitest';

import {
  DISCOVERY_MIN_FILE_BYTES,
  discoveryAcceptsDirectory,
  discoveryAcceptsFile,
} from '../../e2e/source-discovery-rules';
import { discoveryExtension } from '@/entities/docs-vault/lib/library/source-candidate';
import discoveryCases from '../../fixtures/source-discovery-cases.json';

/** The TypeScript rules judge the shared table as the Rust walk does (`tests.rs` under `src-tauri/src/library/`). */
describe('discovery never proposes what local-first forbids reading', () => {
  it.each([
    '.env',
    '.env.local',
    'id_rsa',
    'id_ed25519',
    'credentials.json',
    'credentials.csv',
    'server.pem',
    'api_key.txt',
    'client secrets.xlsx',
    'db_password.txt',
    'store.p12',
  ])('refuses %s', (name) => {
    expect(discoveryAcceptsFile(name)).toBe(false);
  });

  it('refuses every dotfile whatever its extension', () => {
    expect(discoveryAcceptsFile('.hidden-plan.pdf')).toBe(false);
  });
});

describe('discovery proposes ordinary project documents', () => {
  it.each(['Requirements.pdf', 'quarter plan.docx', 'numbers.xlsx', 'deck.pptx', 'notes.txt'])(
    'accepts %s',
    (name) => {
      expect(discoveryAcceptsFile(name)).toBe(true);
    },
  );

  it('refuses code and repository guides', () => {
    for (const name of ['index.ts', 'README.md', 'README.ko.md', 'CLAUDE.md', 'Cargo.toml', 'data.json', 'server.log']) {
      expect(discoveryAcceptsFile(name)).toBe(false);
    }
  });

  it('accepts notes and pages a person keeps', () => {
    for (const name of ['weekly.md', 'ideas.markdown', 'export.html', 'page.htm', 'table.tsv', 'security-review.md']) {
      expect(discoveryAcceptsFile(name)).toBe(true);
    }
  });

  it('reads the extension case-insensitively', () => {
    expect(discoveryExtension('Plan.PDF')).toBe('pdf');
    expect(discoveryExtension('LICENSE')).toBe('');
    expect(discoveryAcceptsFile('Plan.PDF')).toBe(true);
  });
});

describe('the walk skips dependency and build directories', () => {
  it.each(['node_modules', 'target', 'dist', 'build', 'out', 'coverage', '.git'])(
    'never descends into %s',
    (name) => {
      expect(discoveryAcceptsDirectory(name)).toBe(false);
    },
  );

  it('descends into ordinary folders', () => {
    expect(discoveryAcceptsDirectory('specs')).toBe(true);
  });
});

describe('the shared discovery table (tests/fixtures/source-discovery-cases.json)', () => {
  it.each(discoveryCases.directories)(
    'judges the folder $path the same with either separator',
    ({ path, descends }) => {
      expect(discoveryAcceptsDirectory(path)).toBe(descends);
    },
  );

  /** What the walk offers: every folder on the way accepted, the name accepted, and big enough. */
  const offeredByTheRules = (row: { path: string; bytes: number }) => {
    const parts = row.path.split('/');
    const foldersAccepted = parts
      .slice(0, -1)
      .every((_, at) => discoveryAcceptsDirectory(parts.slice(0, at + 1).join('/')));
    return foldersAccepted && discoveryAcceptsFile(parts[parts.length - 1]!) && row.bytes >= DISCOVERY_MIN_FILE_BYTES;
  };

  it('offers exactly the rows the table keeps', () => {
    for (const row of discoveryCases.files) {
      expect(offeredByTheRules(row), row.path).toBe(row.offered);
    }
  });

  it("offers none of the owner's three junk files", () => {
    for (const row of discoveryCases.ownerReport) {
      expect(offeredByTheRules(row), row.path).toBe(false);
    }
  });
});
