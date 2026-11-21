import { beforeEach, describe, expect, it } from 'vitest';
import { openingTab, readStoredTab, writeStoredTab } from './inbox-tab';

describe('openingTab', () => {
  const counts = (todo: number, results: number, history: number) => ({ todo, results, history });

  it('opens a waiting request before anything remembered', () => {
    expect(openingTab(counts(1, 4, 9), 'history')).toBe('todo');
  });

  it('keeps the remembered tab while it has content', () => {
    expect(openingTab(counts(0, 4, 9), 'history')).toBe('history');
  });

  it('falls to the first tab with content when the remembered one is empty', () => {
    expect(openingTab(counts(0, 0, 9), 'results')).toBe('history');
    expect(openingTab(counts(0, 2, 9), null)).toBe('results');
  });

  it('keeps the remembered tab, or todo, when everything is empty', () => {
    expect(openingTab(counts(0, 0, 0), 'history')).toBe('history');
    expect(openingTab(counts(0, 0, 0), null)).toBe('todo');
  });
});

describe('stored tab', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a known tab and ignores an unknown value', () => {
    expect(readStoredTab()).toBeNull();
    writeStoredTab('results');
    expect(readStoredTab()).toBe('results');
    window.localStorage.setItem('atlas.agentActivity.tab', 'elsewhere');
    expect(readStoredTab()).toBeNull();
  });
});
