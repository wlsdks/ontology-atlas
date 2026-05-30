import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { COLORS, KIND_COLORS } from './colors.mjs';

describe('COLORS shared palette', () => {
  it('정확한 ANSI 코드를 노출 (인라인 정의에서 통합 — 회귀 가드)', () => {
    assert.deepEqual(COLORS, {
      reset: '\x1b[0m',
      bold: '\x1b[1m',
      dim: '\x1b[2m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      magenta: '\x1b[35m',
      cyan: '\x1b[36m',
    });
  });
});

describe('KIND_COLORS shared kind palette', () => {
  it('각 kind 가 고유 색 — element 는 green(≠ capability cyan), document 는 dim', () => {
    // pattern-walk 의 element=cyan(capability 와 충돌) drift + find/orphans/list 의
    // document=white drift 회귀 가드.
    assert.equal(KIND_COLORS.project, COLORS.magenta);
    assert.equal(KIND_COLORS.domain, COLORS.blue);
    assert.equal(KIND_COLORS.capability, COLORS.cyan);
    assert.equal(KIND_COLORS.element, COLORS.green);
    assert.notEqual(KIND_COLORS.element, KIND_COLORS.capability);
    assert.equal(KIND_COLORS.document, COLORS.dim);
    assert.equal(KIND_COLORS['vault-readme'], COLORS.dim);
  });
});
