import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { COLORS, KIND_COLORS } from './colors.mjs';

describe('COLORS shared palette', () => {
  it('exposes the exact ANSI codes', () => {
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
  it('gives each kind its own colour (element green, capability cyan, document dim)', () => {
    // element must not share capability's cyan, and document is dim, not white.
    assert.equal(KIND_COLORS.project, COLORS.magenta);
    assert.equal(KIND_COLORS.domain, COLORS.blue);
    assert.equal(KIND_COLORS.capability, COLORS.cyan);
    assert.equal(KIND_COLORS.element, COLORS.green);
    assert.notEqual(KIND_COLORS.element, KIND_COLORS.capability);
    assert.equal(KIND_COLORS.document, COLORS.dim);
    assert.equal(KIND_COLORS['vault-readme'], COLORS.dim);
  });
});
