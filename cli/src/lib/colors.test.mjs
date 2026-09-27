import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { COLORS, KIND_COLORS } from './colors.mjs';

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
