import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { judgeLicenses } from '../check-licenses.mjs';
import { parseAttributionMarker } from './attribution-marker.mjs';
import { electLicense, evaluateLicensePolicy, refusalReason } from './license-policy.mjs';

const NO_EXCEPTIONS = { version: 1, exceptions: [] };

function pkg(name, license, ecosystem = 'npm') {
  return { ecosystem, name, version: '1.0.0', license };
}

describe('electLicense', () => {
  it('uses a dual-licensed package under its most permissive permitted option', () => {
    assert.deepEqual(electLicense('MIT OR Apache-2.0').licenses, ['MIT']);
    assert.deepEqual(electLicense('MIT/Apache-2.0').licenses, ['MIT']);
    assert.deepEqual(electLicense('(MPL-2.0 OR Apache-2.0)').licenses, ['Apache-2.0']);
    assert.deepEqual(electLicense('MIT OR Apache-2.0 OR LGPL-2.1-or-later').licenses, ['MIT']);
  });

  it('requires every part of a conjunction', () => {
    assert.deepEqual(electLicense('(MIT OR Apache-2.0) AND Unicode-3.0').licenses, ['MIT', 'Unicode-3.0']);
    assert.equal(electLicense('MIT AND CC-BY-NC-4.0').licenses, null);
  });

  it('permits the documented boundary licenses and the LLVM exception, in any letter case', () => {
    for (const license of ['MPL-2.0', 'LGPL-2.1', 'lgpl-3.0-or-later', 'OFL-1.1', 'Apache-2.0 WITH LLVM-exception']) {
      assert.ok(electLicense(license).licenses, license);
    }
  });

  it('refuses an expression it cannot parse instead of guessing', () => {
    for (const license of ['SEE LICENSE IN LICENSE', 'MIT OR', '(MIT', 'MIT WITH']) {
      assert.equal(electLicense(license).licenses, null, license);
    }
  });
});

describe('refusalReason', () => {
  it('names the term a reviewer must not ship', () => {
    assert.equal(refusalReason('CC-BY-NC-4.0'), 'non-commercial');
    assert.equal(refusalReason('CC-BY-NC-SA-4.0'), 'non-commercial');
    assert.equal(refusalReason('CC-BY-SA-4.0'), 'share-alike');
    assert.equal(refusalReason('Prosperity-3.0.0'), 'Prosperity: non-commercial use only');
    assert.equal(refusalReason('GPL-3.0-only'), 'GPL/AGPL copyleft');
    assert.equal(refusalReason('AGPL-3.0-or-later'), 'GPL/AGPL copyleft');
    assert.equal(refusalReason('Unknown'), 'no license declared');
    assert.equal(refusalReason('UNLICENSED'), 'proprietary (UNLICENSED)');
    assert.equal(refusalReason('EPL-2.0'), 'not on the allow-list');
  });
});

describe('evaluateLicensePolicy', () => {
  it('refuses non-commercial, share-alike, Prosperity, GPL, AGPL and unknown licenses', () => {
    const packages = ['CC-BY-NC-4.0', 'CC-BY-SA-4.0', 'Prosperity-3.0.0', 'GPL-2.0-only', 'AGPL-3.0-only', 'UNKNOWN'].map((license) =>
      pkg(`fake-${license}`, license),
    );
    const { violations } = evaluateLicensePolicy({ packages, exceptions: NO_EXCEPTIONS });
    assert.deepEqual(violations.map((violation) => violation.license), packages.map((entry) => entry.license));
  });

  it('passes the allow-list and refuses nothing it allows', () => {
    const allowed = ['MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'Apache-2.0', 'Zlib', 'Unlicense', '0BSD', 'CC0-1.0', 'BlueOak-1.0.0', 'Python-2.0'];
    const { violations, problems } = evaluateLicensePolicy({ packages: allowed.map((license) => pkg(license, license)), exceptions: NO_EXCEPTIONS });
    assert.deepEqual([violations, problems], [[], []]);
  });

  it('excuses a package only while it declares the license its exception names', () => {
    const exceptions = { version: 1, exceptions: [{ ecosystem: 'npm', package: 'data', license: 'CC-BY-4.0', reason: 'attribution-only data' }] };
    assert.deepEqual(evaluateLicensePolicy({ packages: [pkg('data', 'CC-BY-4.0')], exceptions }), { violations: [], problems: [] });
    const relicensed = evaluateLicensePolicy({ packages: [pkg('data', 'CC-BY-SA-4.0')], exceptions });
    assert.equal(relicensed.violations.length, 1);
    assert.match(relicensed.problems.join('\n'), /excuses no package/);
  });

  it('keeps an exception for a tree this machine could not read', () => {
    const exceptions = { version: 1, exceptions: [{ ecosystem: 'cargo', package: 'data', license: 'CC-BY-4.0', reason: 'attribution-only data' }] };
    assert.deepEqual(evaluateLicensePolicy({ packages: [], exceptions, judged: ['npm'] }).problems, []);
    assert.equal(evaluateLicensePolicy({ packages: [], exceptions, judged: ['npm', 'cargo'] }).problems.length, 1);
  });

  it('refuses an exception without a reason', () => {
    const exceptions = { version: 1, exceptions: [{ ecosystem: 'cargo', package: 'data', license: 'CC-BY-4.0', reason: ' ' }] };
    const { violations, problems } = evaluateLicensePolicy({ packages: [pkg('data', 'CC-BY-4.0', 'cargo')], exceptions });
    assert.equal(violations.length, 1);
    assert.match(problems.join('\n'), /needs a nonblank reason/);
  });
});

describe('attribution markers', () => {
  it('reads the source, license and holder from the one accepted shape', () => {
    assert.deepEqual(parseAttributionMarker('// Adapted from https://example.com/x.js (MIT, © Example Holder)'), {
      url: 'https://example.com/x.js',
      license: 'MIT',
      holder: 'Example Holder',
    });
    assert.equal(parseAttributionMarker('// Adapted from https://example.com/x.js'), null);
  });

  it('refuses a malformed marker and a source license outside the snippet list', () => {
    const { problems } = judgeLicenses({
      packages: [],
      exceptions: NO_EXCEPTIONS,
      markers: [
        { path: 'src/a.ts', malformed: '// Adapted from somewhere' },
        { path: 'src/b.ts', url: 'https://example.com/b', license: 'CC0-1.0', holder: 'Someone' },
        { path: 'src/c.ts', url: 'https://example.com/c', license: 'BSD-3-Clause', holder: 'Someone' },
      ],
    });
    assert.equal(problems.length, 2);
    assert.match(problems[0], /src\/a\.ts/);
    assert.match(problems[1], /src\/b\.ts: adapted under CC0-1\.0/);
  });
});
