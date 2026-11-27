/**
 * TypeScript copy of the discovery rules Rust walks with (`src-tauri/src/library/discovery_rules.rs`).
 * The installed app never runs it: only the faked app runtime answers the discovery call from it
 * (`desktop-rail-arrival-harness.ts`), and `source-discovery-rules.contract.test.ts` holds it equal
 * to Rust. Metadata only; secrets never reach the list (`.claude/rules/local-first.md`): an
 * extension allow-list, not a deny-list, so an unforeseen name stays hidden, plus a name deny-list
 * for secrets in document formats.
 */

import {
  discoveryExtension,
  isMarkdownName,
  type DiscoverySkipReason,
} from '../../src/entities/docs-vault/lib/library/source-candidate';

/** Allow-list; must equal Rust `DISCOVERY_DOCUMENT_EXTENSIONS`. `log` is absent: logs are output. */
export const DISCOVERY_DOCUMENT_EXTENSIONS = [
  'pdf',
  'docx',
  'doc',
  'xlsx',
  'xls',
  'csv',
  'tsv',
  'pptx',
  'ppt',
  'txt',
  'rtf',
  'odt',
  'ods',
  'odp',
  'epub',
  'md',
  'markdown',
  'html',
  'htm',
] as const;

/** Must equal Rust `DISCOVERY_GUIDE_STEMS`: repository guides, refused as Markdown. */
export const DISCOVERY_GUIDE_STEMS = [
  'readme',
  'agents',
  'claude',
  'gemini',
  'contributing',
  'code_of_conduct',
  'security',
] as const;

/** Must equal Rust `DISCOVERY_VAULT_OWNED_DIRS`: what Atlas keeps in the open folder. */
export const DISCOVERY_VAULT_OWNED_DIRS = ['sources', 'wiki'] as const;

/**
 * Must equal Rust `DISCOVERY_PRUNE_DIR_NAMES`, compared lowercased; dot directories are refused
 * separately. Generated, published and test-data folders hold files no one wrote as a document.
 */
export const DISCOVERY_PRUNE_DIR_NAMES = [
  'node_modules',
  'target',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  'pods',
  'deriveddata',
  '__pycache__',
  'venv',
  'public',
  'static',
  'output',
  'outputs',
  'generated',
  'gen',
  'tmp',
  'temp',
  'cache',
  'logs',
  'third_party',
  'third-party',
  'licenses',
  'licences',
  'fixtures',
  '__fixtures__',
  'testdata',
  'test-results',
  'playwright-report',
] as const;

/** Must equal Rust `DISCOVERY_PRUNE_DIR_PATHS`; matched as whole trailing segments. */
export const DISCOVERY_PRUNE_DIR_PATHS = ['src/test/resources', 'tests/data'] as const;

/** Must equal Rust `DISCOVERY_NOTICE_STEMS`: legal and project notices in any format. */
export const DISCOVERY_NOTICE_STEMS = [
  'license',
  'licence',
  'copying',
  'notice',
  'third-party',
  'thirdparty',
  'third_party',
  'authors',
  'contributors',
  'changelog',
  'patents',
] as const;

/**
 * Must equal Rust `DISCOVERY_NOTICE_SUFFIXES`: a bundled library's licence, `x-1.0.LICENSE.txt`.
 * A hyphen is absent so `driver-license.pdf` stays a document.
 */
export const DISCOVERY_NOTICE_SUFFIXES = ['.license', '_license', '.licence', '_licence'] as const;

/** Must equal Rust `DISCOVERY_BUILD_FILE_NAMES`; `requirements-*.txt` is matched by prefix. */
export const DISCOVERY_BUILD_FILE_NAMES = ['cmakelists.txt', 'requirements.txt', 'robots.txt'] as const;
const REQUIREMENTS_VARIANT_PREFIX = 'requirements-';

/** Must equal Rust `DISCOVERY_MIN_FILE_BYTES`; smaller files are empty or placeholders. */
export const DISCOVERY_MIN_FILE_BYTES = 64;

/** Name fragments that disqualify any extension (e.g. `credentials.csv`); must equal Rust. */
export const DISCOVERY_DENIED_NAME_FRAGMENTS = [
  'credential',
  'secret',
  'password',
  'passwd',
  'token',
  'apikey',
  'api-key',
  'api_key',
  'id_rsa',
  'id_ed25519',
  'id_dsa',
  'id_ecdsa',
  '.env',
  '.pem',
  '.key',
  '.p12',
  '.pfx',
  '.keystore',
  '.jks',
  '.htpasswd',
] as const;

/** How deep one granted root is walked. **Must equal** Rust `DISCOVERY_MAX_DEPTH`. */
export const DISCOVERY_MAX_DEPTH = 8;
/** How many candidates one run returns. **Must equal** Rust `DISCOVERY_MAX_CANDIDATES`. */
export const DISCOVERY_MAX_CANDIDATES = 500;

function namesANotice(stem: string): boolean {
  const startsWithANotice = DISCOVERY_NOTICE_STEMS.some((notice) => {
    if (!stem.startsWith(notice)) return false;
    const next = stem.charAt(notice.length);
    return next === '' || next === '-' || next === '_' || next === '.';
  });
  return startsWithANotice || DISCOVERY_NOTICE_SUFFIXES.some((suffix) => stem.endsWith(suffix));
}

function namesABuildFile(lowered: string): boolean {
  return (
    (DISCOVERY_BUILD_FILE_NAMES as readonly string[]).includes(lowered) ||
    (lowered.startsWith(REQUIREMENTS_VARIANT_PREFIX) && lowered.endsWith('.txt'))
  );
}

const HEX_STEM = /^[0-9a-f]+$/;
const UUID_STEM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** A digits-only stem shorter than 32 is a date or scanner counter, so it stays a document. */
function looksLikeAHash(stem: string): boolean {
  if (HEX_STEM.test(stem)) {
    const hasLetter = /[a-f]/.test(stem);
    return (stem.length >= 16 && hasLetter) || [32, 40, 64].includes(stem.length);
  }
  return UUID_STEM.test(stem);
}

function stemOf(lowered: string, extension: string): string {
  return extension ? lowered.slice(0, lowered.length - extension.length - 1) : lowered;
}

/** The name rules every folder walk applies; repository guides are discovery's alone. */
export function discoverySkipReason(name: string): DiscoverySkipReason | null {
  const lowered = name.toLowerCase();
  if (DISCOVERY_DENIED_NAME_FRAGMENTS.some((fragment) => lowered.includes(fragment))) {
    return 'secretName';
  }
  const extension = discoveryExtension(lowered);
  const stem = stemOf(lowered, extension);
  if (namesANotice(stem)) return 'licence';
  if (
    !(DISCOVERY_DOCUMENT_EXTENSIONS as readonly string[]).includes(extension) ||
    namesABuildFile(lowered) ||
    looksLikeAHash(stem)
  ) {
    return 'notDocument';
  }
  return null;
}

function namesARepositoryGuide(lowered: string): boolean {
  if (!isMarkdownName(lowered)) return false;
  const stem = stemOf(lowered, discoveryExtension(lowered));
  return DISCOVERY_GUIDE_STEMS.some(
    (guide) => stem === guide || stem.startsWith(`${guide}.`),
  );
}

/** The one judgement both walks make about a file name. */
export function discoveryAcceptsFile(name: string): boolean {
  if (name.startsWith('.')) return false;
  return discoverySkipReason(name) === null && !namesARepositoryGuide(name.toLowerCase());
}

/** Takes the path relative to the walked root, with either separator, so Windows matches too. */
export function discoveryAcceptsDirectory(relativePath: string): boolean {
  const normalized = relativePath.replaceAll('\\', '/').toLowerCase().replace(/\/+$/, '');
  const name = normalized.slice(normalized.lastIndexOf('/') + 1);
  if (name.startsWith('.')) return false;
  if ((DISCOVERY_PRUNE_DIR_NAMES as readonly string[]).includes(name)) return false;
  return !DISCOVERY_PRUNE_DIR_PATHS.some(
    (path) => normalized === path || normalized.endsWith(`/${path}`),
  );
}
