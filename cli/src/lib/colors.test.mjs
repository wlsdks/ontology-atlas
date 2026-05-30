import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { COLORS } from './colors.mjs';

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
