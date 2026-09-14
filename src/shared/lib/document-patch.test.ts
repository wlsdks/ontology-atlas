import { describe, expect, it } from 'vitest';
import { previewDocumentPatch as browserPreview } from './document-patch.mjs';
import { previewDocumentPatch as mcpPreview } from '../../../mcp/src/document-patch.mjs';

describe('document patch cross-runtime bridge', () => {
  it('exposes the canonical MCP formatter without a second implementation', () => {
    expect(browserPreview).toBe(mcpPreview);
    const input = {
      rawBefore: '---\nuid: 00000000-0000-4000-8000-000000000001\nkind: capability\ntitle: 환불\nunknown: keep\n---\n\nbody',
      frontmatterPatch: { title: '환불 검토', unknown: undefined },
      body: '',
    };
    expect(browserPreview(input)).toEqual(mcpPreview(input));
  });
});
