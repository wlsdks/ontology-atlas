import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { isValidVaultTitle, validateVaultDocument } from './validate.mjs';

const TEST_UID = '00000000-0000-4000-8000-000000000001';

describe('isValidVaultTitle', () => {
  it('비-string 은 false', () => {
    assert.equal(isValidVaultTitle(undefined), false);
    assert.equal(isValidVaultTitle(null), false);
    assert.equal(isValidVaultTitle(0), false);
    assert.equal(isValidVaultTitle(123), false);
    assert.equal(isValidVaultTitle(true), false);
    assert.equal(isValidVaultTitle({}), false);
    assert.equal(isValidVaultTitle([]), false);
  });

  it('빈 문자열 / 공백-only 는 false', () => {
    assert.equal(isValidVaultTitle(''), false);
    assert.equal(isValidVaultTitle('   '), false);
    assert.equal(isValidVaultTitle('\t\n'), false);
  });

  it('비-empty trimmed string 은 true', () => {
    assert.equal(isValidVaultTitle('Auth Platform'), true);
    assert.equal(isValidVaultTitle('한글 제목'), true);
    assert.equal(isValidVaultTitle('  Trimmed  '), true);
    assert.equal(isValidVaultTitle('A'), true);
  });
});

describe('validateVaultDocument (R11 #23)', () => {
  it('frontmatter 없으면 ok', () => {
    const r = validateVaultDocument('# just a doc');
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
  });

  it('정상 frontmatter ok', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: project\ntitle: Foo\n---\nbody`,
    );
    assert.equal(r.ok, true);
    assert.equal(r.issues.length, 0);
  });

  it('닫는 --- 빠지면 unclosed-frontmatter error', () => {
    const r = validateVaultDocument('---\nkind: project\n# unclosed');
    assert.equal(r.ok, false);
    assert.equal(r.issues[0].code, 'unclosed-frontmatter');
    assert.equal(r.issues[0].severity, 'error');
  });

  it('빈 kind 는 empty-kind error', () => {
    const r = validateVaultDocument('---\nkind:\n---\n');
    assert.equal(r.ok, false);
    assert.equal(r.issues.some((i) => i.code === 'empty-kind'), true);
  });

  it('kind 없으면 missing-kind warning (ok=true)', () => {
    const r = validateVaultDocument('---\ntitle: Foo\n---\n');
    assert.equal(r.ok, true);
    assert.equal(r.issues.some((i) => i.code === 'missing-kind'), true);
  });

  it('non-canonical kind 는 unknown-kind warning', () => {
    const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: weird\n---\n`);
    assert.equal(r.ok, true);
    assert.equal(r.issues.some((i) => i.code === 'unknown-kind'), true);
  });

  it('canonical kind 6 종 모두 인식 (capability/element 는 domain 채워야 clean)', () => {
    // R14 — capability/element 는 domain 누락 시 missing-expected-field warn.
    // canonical kind 가 인식 자체는 되는지 보는 테스트라 domain 까지 박아 clean.
    const cases = [
      { k: 'project' },
      { k: 'domain' },
      { k: 'capability', extra: 'domain: domains/auth' },
      { k: 'element', extra: 'domain: domains/auth' },
      { k: 'document' },
      { k: 'vault-readme' },
    ];
    for (const { k, extra } of cases) {
      const extraLine = extra ? `\n${extra}` : '';
      const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: ${k}${extraLine}\n---\n`);
      assert.equal(r.ok, true, `kind=${k}`);
      assert.equal(r.issues.length, 0, `kind=${k}`);
    }
  });

  it('R14 — capability without domain → missing-expected-field warning', () => {
    const r = validateVaultDocument(`---\nuid: ${TEST_UID}\nkind: capability\ntitle: X\n---\n`);
    assert.equal(r.ok, true);
    assert.equal(
      r.issues.some((i) => i.code === 'missing-expected-field'),
      true,
    );
  });

  it('graph 배열 중복/비정렬이면 non-canonical-graph-array warning', () => {
    const r = validateVaultDocument(
      `---\nuid: ${TEST_UID}\nkind: project\ntitle: X\ndependencies: [z, a, z]\n---\n`,
    );
    assert.equal(r.ok, true);
    assert.equal(
      r.issues.some((i) => i.code === 'non-canonical-graph-array'),
      true,
    );
  });
});
