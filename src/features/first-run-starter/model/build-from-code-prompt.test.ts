import { describe, expect, it } from 'vitest';

import { buildFromCodePrompt } from './build-from-code-prompt';

/**
 * The door's prompt is the person's first turn, so its order is the build order: breadth, depth,
 * the outline, then every write in the same run.
 */
describe('build-from-code prompt', () => {
  const prompt = buildFromCodePrompt('/Users/dana/my-product', null);
  // The prompt is wrapped for the transcript, so the sentence is asserted, not where it wraps.
  const flat = prompt.replace(/\s+/g, ' ');

  it('orders breadth, depth, outline and writing', () => {
    const steps = ['1. Breadth.', '2. Depth.', '3. Tell me the outline', '4. Write all of it'].map(
      (step) => prompt.indexOf(step),
    );
    expect(steps.every((index) => index > -1)).toBe(true);
    expect([...steps].sort((a, b) => a - b)).toEqual(steps);
  });

  it('places every ability before reading any in depth', () => {
    expect(flat).toContain('outline the main file of every unit it lists');
    expect(flat).toContain('Every ability it lists ends up as its own capability, named inside the node that covers it, or excluded with a reason');
    expect(flat).toContain('cut depth on the abilities beyond the must-have set, never breadth');
  });

  // Agents asked to follow callees rarely did; the symbol read now returns the deciding code itself.
  it('reads each capability by symbol and cites the lines that hold its rule', () => {
    expect(flat).toContain('Read every capability by symbol');
    expect(flat).toContain('the guard around each call in its callers, the constructor\'s defaults and the callees that decide it');
    expect(flat).toContain('When a read says the deciding condition is in a caller, read that caller too');
    expect(flat).toContain('followed by the cite of the read lines that hold its condition');
  });

  // Count targets made agents pad to a number; the tools report coverage instead.
  it('sets no count target and points at the coverage the writes report', () => {
    expect(flat).not.toMatch(/fewer than ten|15 to 30|5 to 15|per 1,000/);
    expect(flat).toContain('lists what no node places yet, which entry files were never read and which rules cite no read lines');
  });

  it('states dependency direction from consumer to provider and asks for ability conditions', () => {
    expect(flat).toContain('consumer to provider');
    expect(flat).toContain('or on its default implementation when the interface has no node of its own');
    expect(flat).toContain('an interface never depends on an implementation');
    expect(flat).toContain('For every ability, ask which other ability must have run, be configured or be present first');
    expect(flat).toContain('Never write both directions between one pair');
  });

  it('writes in the same run, carrying a default instead of waiting', () => {
    expect(flat).toContain('say what you will do by default, and carry on with that default without waiting for me');
    expect(prompt).not.toMatch(/After I say yes|wait for my|before I review/i);
    for (const tool of ['`validate_vault`', '`connect_project_source`', '`finalize_project_meaning`']) {
      expect(flat).toContain(tool);
    }
  });

  it('asks for names a person says, never an identifier', () => {
    expect(flat).toContain('the way a teammate would say it aloud');
    expect(flat).toContain('no file path, camelCase, snake_case, file extension or class suffix in a title');
    expect(flat).toContain('a first sentence of 25 words or fewer');
    expect(flat).toContain('no branch ladders or status codes');
  });

  it('does not send the agent to the bulk evaluator route', () => {
    expect(prompt).not.toMatch(/canWrite|writePlan|qualification/);
  });

  it('inspects the project that contains the vault rather than the vault', () => {
    expect(prompt).toContain('/Users/dana/my-product (the vault sits inside it, at /Users/dana/my-product/atlas)');
  });
});
