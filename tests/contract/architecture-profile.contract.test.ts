import { describe, expect, it } from 'vitest';

import {
  AMBIGUOUS_PROFILE_FRONTMATTER,
  FSD_PROFILE_FRONTMATTER,
  HEXAGONAL_PROFILE_FRONTMATTER,
} from '../fixtures/architecture-profile-cases.mjs';
import { parseArchitectureProfile as parseWebProfile } from '@/entities/architecture-profile';
import { parseArchitectureProfile as parseMcpProfile } from '../../mcp/src/architecture-profile.mjs';

describe('architecture-profile/v1 cross-surface contract', () => {
  it.each([
    ['fsd', FSD_PROFILE_FRONTMATTER],
    ['hexagonal', HEXAGONAL_PROFILE_FRONTMATTER],
    ['ambiguous', AMBIGUOUS_PROFILE_FRONTMATTER],
  ])('%s profile parses identically in web and MCP', (_name, frontmatter) => {
    const web = parseWebProfile(frontmatter);
    const mcp = parseMcpProfile(frontmatter);
    expect(web).toEqual({
      ...mcp,
      allows: Object.fromEntries(mcp.allows),
    });
  });
});
