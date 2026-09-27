import { describe, expect, it } from 'vitest';

import { buildFromCodePrompt } from './build-from-code-prompt';

/**
 * The door's prompt is the person's first turn, so its order is the build order. The write step
 * names the batch path that finishes in one app session, and asks for what could not be checked.
 */
describe('build-from-code prompt step order', () => {
  const prompt = buildFromCodePrompt('/Users/dana/my-product', null);
  // The prompt is wrapped for the transcript, so the sentence is asserted, not where it wraps.
  const flat = prompt.replace(/\s+/g, ' ');

  it('orders the three steps as inspect, propose in sentences, then write after approval', () => {
    const survey = prompt.indexOf('1. Survey the code');
    const propose = prompt.indexOf('2. Tell me, in plain sentences');
    const write = prompt.indexOf('3. After I say yes');
    expect(survey).toBeGreaterThan(-1);
    expect(propose).toBeGreaterThan(survey);
    expect(write).toBeGreaterThan(propose);
  });

  it('asks for a definition, boundary and evidence file per candidate in the propose step', () => {
    expect(flat).toContain('a single sentence defining it');
    expect(flat).toContain('what it includes and what it excludes');
    expect(flat).toContain('the file that proves it');
  });

  it('names small reviewed batches and the three follow-up calls in the write step', () => {
    expect(flat).toContain('small reviewed batches');
    // Each write still carries what makes it judgeable later.
    expect(flat).toContain('each node carrying its definition, its boundary and what you could not check in the body');
    expect(flat).toContain('each relation carrying a `why`');
    for (const tool of ['`validate_vault`', '`connect_project_source`', '`finalize_project_meaning`']) {
      expect(flat).toContain(tool);
    }
  });

  it('names only the needed inspection tools and not the bulk approval path', () => {
    expect(flat).toContain('`analyze_repo_structure`');
    expect(flat).toContain('`infer_imports`');
    // The bulk qualification lifecycle cannot complete in an app session.
    expect(prompt).not.toContain('canWrite');
    expect(prompt).not.toContain('writePlan');
    expect(prompt).not.toContain('qualification');
  });

  it('asks to choose evidence rather than count and to ask on overlap', () => {
    expect(flat).toContain('Prefer few, well-evidenced concepts over many thin ones.');
    expect(flat).toContain('ask me instead of making both');
  });

  it('inspects the project that contains the vault rather than the vault', () => {
    expect(prompt).toContain('/Users/dana/my-product (the vault sits inside it, at /Users/dana/my-product/atlas)');
  });
});
