import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { partitionReadmeOnlyDomains } from './bootstrap.mjs';

/**
 * README 전용 도메인 보류 — 판별 함수의 계약.
 *
 * 2026-08-08 실사용 검수: README 제목 11개가 전부 도메인으로 착지해 관계
 * 1종짜리 별 그래프가 됐다(attunegraph). 손으로 기운 금지어 체는 구조적으로
 * 지므로(새 README 마다 목록이 모르는 제목을 만든다), 체 대신 **확증**으로
 * 가른다 — 코드 evidence 거나, 코드에서 나온 후보가 부모로 지목한 도메인만
 * 자동으로 심는다.
 */
describe('partitionReadmeOnlyDomains', () => {
  const d = (slug, source) => ({ slug, title: slug, evidence: { source } });

  it('README 에서만 나온 도메인은 보류로 간다', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/quick-start-from-source', 'README.md')],
      capabilities: [],
      elements: [],
    });
    assert.equal(r.corroborated.length, 0);
    assert.equal(r.readmeOnly.length, 1);
  });

  it('코드 디렉터리 evidence 를 가진 도메인은 확증이다', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/auth', 'src/auth')],
      capabilities: [],
      elements: [],
    });
    assert.equal(r.corroborated.length, 1);
    assert.equal(r.readmeOnly.length, 0);
  });

  it('코드에서 나온 역량이 부모로 지목하면 README 도메인도 확증이 된다', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/typed-api', 'README.md')],
      capabilities: [
        { slug: 'capabilities/query', title: 'Query', domain: 'domains/typed-api', evidence: { source: 'src/query' } },
      ],
      elements: [],
    });
    assert.equal(r.corroborated.length, 1, 'README 출처라도 코드가 지목하면 심는다');
  });

  it('README 출처 역량의 지목은 확증이 아니다 — README 가 README 를 확증하면 순환이다', () => {
    const r = partitionReadmeOnlyDomains({
      domains: [d('domains/typed-api', 'README.md')],
      capabilities: [
        { slug: 'capabilities/query', title: 'Query', domain: 'domains/typed-api', evidence: { source: 'readme.md' } },
      ],
      elements: [],
    });
    assert.equal(r.readmeOnly.length, 1);
  });

  it('readme 변형(readme.md · README.rst · README)을 전부 README 출처로 본다', () => {
    for (const src of ['readme.md', 'README.rst', 'README']) {
      const r = partitionReadmeOnlyDomains({ domains: [d('domains/x', src)], capabilities: [], elements: [] });
      assert.equal(r.readmeOnly.length, 1, src);
    }
  });

  it('evidence 가 아예 없으면 보류하지 않는다 — 모르는 것을 잔재 취급하지 않는다', () => {
    const r = partitionReadmeOnlyDomains({ domains: [{ slug: 'domains/x', title: 'x' }], capabilities: [], elements: [] });
    assert.equal(r.corroborated.length, 1);
  });
});
