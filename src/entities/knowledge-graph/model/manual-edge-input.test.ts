import { describe, expect, it } from 'vitest';
import {
  composeManualEdgeId,
  validateManualKnowledgeEdgeInput,
  type AddManualKnowledgeEdgeInput,
} from './manual-edge-input';

function baseInput(
  overrides: Partial<AddManualKnowledgeEdgeInput> = {},
): AddManualKnowledgeEdgeInput {
  return {
    accountId: 'acc_123',
    from: 'capability.foo',
    to: 'capability.bar',
    type: 'depends_on',
    ...overrides,
  };
}

describe('validateManualKnowledgeEdgeInput', () => {
  it('accepts a fully formed input', () => {
    expect(validateManualKnowledgeEdgeInput(baseInput())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects empty accountId / from / to', () => {
    expect(
      validateManualKnowledgeEdgeInput(baseInput({ accountId: '' })).errors,
    ).toContain('account_id_required');
    expect(
      validateManualKnowledgeEdgeInput(baseInput({ from: '' })).errors,
    ).toContain('from_required');
    expect(
      validateManualKnowledgeEdgeInput(baseInput({ to: '' })).errors,
    ).toContain('to_required');
  });

  it('rejects self-loop (from === to)', () => {
    expect(
      validateManualKnowledgeEdgeInput(
        baseInput({ from: 'capability.foo', to: 'capability.foo' }),
      ).errors,
    ).toContain('self_loop');
  });

  it('does not flag self-loop when from is empty (different error class)', () => {
    const result = validateManualKnowledgeEdgeInput(
      baseInput({ from: '', to: '' }),
    );
    expect(result.errors).toContain('from_required');
    expect(result.errors).toContain('to_required');
    expect(result.errors).not.toContain('self_loop');
  });

  it('rejects unknown edge type', () => {
    expect(
      validateManualKnowledgeEdgeInput(
        baseInput({ type: 'refers_to' as never }),
      ).errors,
    ).toContain('type_invalid');
  });

  it('accepts each canonical edge type (TBox 7종)', () => {
    const types = [
      'contains',
      'belongs_to',
      'depends_on',
      'implements',
      'uses',
      'describes',
      'related_to',
    ] as const;
    for (const type of types) {
      expect(
        validateManualKnowledgeEdgeInput(baseInput({ type })).ok,
      ).toBe(true);
    }
  });

  it('aggregates multiple errors at once', () => {
    const result = validateManualKnowledgeEdgeInput({
      accountId: '',
      from: 'x',
      to: 'x',
      type: 'invalid' as never,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'account_id_required',
        'self_loop',
        'type_invalid',
      ]),
    );
  });
});

describe('composeManualEdgeId', () => {
  it('produces the canonical `<type>:<from>-><to>` shape', () => {
    expect(composeManualEdgeId('depends_on', 'capability.a', 'capability.b'))
      .toBe('depends_on:capability.a->capability.b');
  });

  it('is deterministic and direction-sensitive', () => {
    const a = composeManualEdgeId('uses', 'x', 'y');
    const b = composeManualEdgeId('uses', 'y', 'x');
    expect(a).not.toBe(b);
  });
});
