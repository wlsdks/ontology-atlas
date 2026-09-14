// Cross-runtime bridge. MCP remains the canonical parser and formatter; the WebView previews the
// exact same bytes without gaining filesystem access or write authority.
export { previewDocumentPatch } from '../../../mcp/src/document-patch.mjs';
