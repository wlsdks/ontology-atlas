import { describe, expect, it } from 'vitest';
import {
  MANUAL_NODE_KINDS,
  validateManualKnowledgeNodeInput,
  type AddManualKnowledgeNodeInput,
} from './manual-node-input';

function baseInput(
  overrides: Partial<AddManualKnowledgeNodeInput> = {},
): AddManualKnowledgeNodeInput {
  return {
    accountId: 'acc_123',
    id: 'capability.foo-bar',
    title: 'Foo Bar',
    kind: 'capability',
    ...overrides,
  };
}

describe('MANUAL_NODE_KINDS', () => {
  it('contains 5 TBox classes (unknown 제외)', () => {
    expect(MANUAL_NODE_KINDS).toHaveLength(5);
    expect(MANUAL_NODE_KINDS).toEqual([
      'project',
      'domain',
      'capability',
      'element',
      'document',
    ]);
  });
});

describe('validateManualKnowledgeNodeInput', () => {
  it('accepts a fully formed input', () => {
    expect(validateManualKnowledgeNodeInput(baseInput())).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects empty / whitespace accountId', () => {
    expect(
      validateManualKnowledgeNodeInput(baseInput({ accountId: '' })).errors,
    ).toContain('account_id_required');
    expect(
      validateManualKnowledgeNodeInput(baseInput({ accountId: '   ' })).errors,
    ).toContain('account_id_required');
  });

  it('rejects empty id', () => {
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: '' })).errors,
    ).toContain('id_required');
  });

  it('rejects ids with invalid characters', () => {
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: 'capa bility.x' }))
        .errors,
    ).toContain('id_invalid_format');
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: '/leading-slash' }))
        .errors,
    ).toContain('id_invalid_format');
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: '한글ID' })).errors,
    ).toContain('id_invalid_format');
  });

  it('accepts ids with the canonical `kind:slug` and `kind.slug` shapes', () => {
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: 'capability:foo-bar' }))
        .ok,
    ).toBe(true);
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: 'capability.foo-bar' }))
        .ok,
    ).toBe(true);
    expect(
      validateManualKnowledgeNodeInput(baseInput({ id: 'project_baz_2' })).ok,
    ).toBe(true);
  });

  it('rejects empty title', () => {
    expect(
      validateManualKnowledgeNodeInput(baseInput({ title: '' })).errors,
    ).toContain('title_required');
    expect(
      validateManualKnowledgeNodeInput(baseInput({ title: '   ' })).errors,
    ).toContain('title_required');
  });

  it('rejects unknown kinds (kind 화이트리스트는 5 종)', () => {
    expect(
      validateManualKnowledgeNodeInput(
        baseInput({ kind: 'unknown' as never }),
      ).errors,
    ).toContain('kind_invalid');
    expect(
      validateManualKnowledgeNodeInput(
        baseInput({ kind: 'workspace' as never }),
      ).errors,
    ).toContain('kind_invalid');
  });

  it('aggregates multiple errors at once', () => {
    const result = validateManualKnowledgeNodeInput({
      accountId: '',
      id: '',
      title: '',
      kind: 'unknown' as never,
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'account_id_required',
        'id_required',
        'title_required',
        'kind_invalid',
      ]),
    );
  });
});
