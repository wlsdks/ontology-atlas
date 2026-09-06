import { describe, expect, it } from 'vitest';

import { buildOntologyChangeSet, type OntologyChangeSet } from '@/entities/knowledge-graph';

import {
  conceptName,
  fieldNameKey,
  ontologyChangeHeadline,
  sentenceMap,
  sentenceMapChange,
  stringList,
} from './change-summary';

const TOOL = (name: string) => `mcp__atlas-vault__${name}`;

/**
 * The headline is the one line a person reads before answering, so every branch of it has to come
 * from a fact the request actually carried. These cases are the request shapes the ACP adapter
 * sends, built through the same `buildOntologyChangeSet` the card uses — not hand-written change
 * sets, which would prove only that the sentence table is spelled correctly.
 */
describe('the headline is derived from the request, never guessed', () => {
  it('names the field and how many values it carries — the owner`s measured case', () => {
    const notes = Object.fromEntries(
      Array.from({ length: 8 }, (_, index) => [`domains/d${index}`, `reason ${index}`]),
    );
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('patch_concept'), {
        slug: 'projects/ontology-atlas',
        frontmatter: { relation_notes: notes },
      }),
    );

    expect(headline).toEqual({
      key: 'updateEntries',
      values: { name: 'ontology-atlas', count: 8 },
      fieldKey: 'relation_notes',
    });
  });

  it('names both ends of a connection', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('add_relation'), {
        from: 'capabilities/contextual-editing',
        to: 'domains/graph-modeling',
        type: 'depends_on',
      }),
    );

    expect(headline.key).toBe('relate');
    expect(headline.values).toEqual({ from: 'contextual-editing', to: 'graph-modeling' });
  });

  it('prefers the title being written over the slug when a concept is created', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('add_concept'), {
        slug: 'capabilities/contextual-editing',
        kind: 'capability',
        title: 'Contextual Meaning Editing',
      }),
    );

    expect(headline).toEqual({
      key: 'createNamed',
      values: { name: 'Contextual Meaning Editing' },
    });
  });

  it('counts the rows of a batch rather than describing the first one', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('add_relations'), {
        relations: [
          { from: 'a/one', to: 'b/two', type: 'relates' },
          { from: 'a/three', to: 'b/four', type: 'relates' },
        ],
      }),
    );

    expect(headline).toEqual({ key: 'relateBatch', values: { count: 2 } });
  });

  it('counts fields when several change at once', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('patch_concept'), {
        slug: 'elements/cart-session',
        frontmatter: { title: 'Cart session', description: 'One basket per visitor.' },
      }),
    );

    expect(headline).toEqual({ key: 'updateFields', values: { name: 'cart-session', count: 2 } });
  });

  /**
   * ⚠️ The branch that matters most. A card that invents a subject is worse than one that admits it
   * cannot read one: a person would approve a write against a document they were never shown.
   */
  it('says only what it knows when the request carries no target', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('patch_concept'), {
        frontmatter: { description: 'No slug arrived with this request.' },
      }),
    );

    expect(headline.key).toBe('updateFieldNoTarget');
    expect(headline.values).toEqual({});
    expect(headline.fieldKey).toBe('description');
  });

  it('falls back to the plainest sentence when neither target nor field arrived', () => {
    const empty: OntologyChangeSet = {
      ...buildOntologyChangeSet(TOOL('patch_concept'), {}),
      operation: 'update',
    };
    expect(ontologyChangeHeadline(empty)).toEqual({ key: 'updateNoTarget', values: {} });
  });

  it('keeps a destructive operation in its own words', () => {
    const headline = ontologyChangeHeadline(
      buildOntologyChangeSet(TOOL('remove_relation'), {
        slug: 'elements/cart-session',
        type: 'depends_on',
        to: 'domains/checkout',
      }),
    );
    expect(headline.key).toBe('removeNamed');
    expect(headline.values).toEqual({ name: 'cart-session' });
  });
});

describe('the shapes the rows are built from', () => {
  it('reads a map of strings as one entry per key and refuses anything else', () => {
    expect(sentenceMap({ 'a/b': 'why' })).toEqual([{ target: 'a/b', text: 'why' }]);
    expect(sentenceMap({ 'a/b': ['why'] })).toBeNull();
    expect(sentenceMap({})).toBeNull();
    expect(sentenceMap(['a', 'b'])).toBeNull();
    expect(sentenceMap('why')).toBeNull();
  });

  it('carries a previous sentence only where one existed and actually differs', () => {
    const entries = sentenceMapChange(
      { 'a/b': 'new reason', 'c/d': 'same reason', 'e/f': 'fresh target' },
      { 'a/b': 'old reason', 'c/d': 'same reason' },
    );

    expect(entries).toEqual([
      { target: 'a/b', text: 'new reason', before: 'old reason' },
      { target: 'c/d', text: 'same reason' },
      { target: 'e/f', text: 'fresh target' },
    ]);
  });

  it('never invents a previous sentence when the change set holds none', () => {
    expect(sentenceMapChange({ 'a/b': 'reason' }, undefined)).toEqual([
      { target: 'a/b', text: 'reason' },
    ]);
  });

  it('reads a list of slugs as a list and leaves mixed values alone', () => {
    expect(stringList(['a', 'b'])).toEqual(['a', 'b']);
    expect(stringList([])).toBeNull();
    expect(stringList(['a', 3])).toBeNull();
  });

  it('takes the readable end of a slug and nothing when there is none', () => {
    expect(conceptName('projects/ontology-atlas')).toBe('ontology-atlas');
    expect(conceptName('ontology-atlas')).toBe('ontology-atlas');
    expect(conceptName(null)).toBeNull();
    expect(conceptName('   ')).toBeNull();
  });

  it('offers a plain name only for keys this product can name', () => {
    expect(fieldNameKey('relation_notes')).toBe('fieldName.relation_notes');
    expect(fieldNameKey('x_custom_key')).toBeNull();
  });
});
