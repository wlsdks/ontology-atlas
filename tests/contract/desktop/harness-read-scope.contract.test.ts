import { describe, expect, it } from 'vitest';

import {
  harnessListClass,
  harnessReadClass,
} from '../../../src/entities/agent-files/model/harness-read-scope';
import table from '../../fixtures/harness-read-scope-cases.json';

describe('harness read scope table', () => {
  it.each(table.cases)('classifies "$path" the way the native commands do', (row) => {
    expect(harnessReadClass(row.path)).toBe(row.read);
    expect(harnessListClass(row.path)).toBe(row.list);
  });
});
