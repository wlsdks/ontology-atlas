import { describe, expect, it } from 'vitest';
import { ONTOLOGY_EXPORT_VERSION } from '@/shared/lib/ontology-export';
import { parseOntologyImportV1 } from './parse';

const VALID_PAYLOAD = {
  version: ONTOLOGY_EXPORT_VERSION,
  exportedAt: '2026-04-28T12:00:00.000Z',
  exportedBy: 'uid-1',
  accountId: 'acc-1',
  tboxVersionId: 'v1',
  tbox: { classes: [], relations: [] },
  nodes: [],
  edges: [],
};

describe('parseOntologyImportV1', () => {
  it('정상 payload — ok=true + payload 그대로', () => {
    const r = parseOntologyImportV1(JSON.stringify(VALID_PAYLOAD));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.version).toBe(ONTOLOGY_EXPORT_VERSION);
      expect(r.payload.accountId).toBe('acc-1');
    }
  });

  it('JSON parse 실패 — error message 포함', () => {
    const r = parseOntologyImportV1('{not json');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('JSON 파싱 실패');
  });

  it('객체 아님 (배열) — error', () => {
    const r = parseOntologyImportV1(JSON.stringify([]));
    expect(r.ok).toBe(false);
  });

  it('version 미일치 — unsupported version', () => {
    const r = parseOntologyImportV1(
      JSON.stringify({ ...VALID_PAYLOAD, version: 'ontology-export-v2' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('지원하지 않는 version');
  });

  it('accountId 누락 — error', () => {
    const r = parseOntologyImportV1(
      JSON.stringify({ ...VALID_PAYLOAD, accountId: '' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('accountId');
  });

  it('nodes 가 배열 아님 — error', () => {
    const r = parseOntologyImportV1(
      JSON.stringify({ ...VALID_PAYLOAD, nodes: 'oops' }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('nodes');
  });

  it('tbox 형식 어긋남 — error', () => {
    const r = parseOntologyImportV1(
      JSON.stringify({ ...VALID_PAYLOAD, tbox: { classes: [] } }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('tbox');
  });
});
