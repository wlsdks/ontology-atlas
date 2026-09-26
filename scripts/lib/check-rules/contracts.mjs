/** Cross-package contracts: the architecture profile and the contract suite that scans UI files from disk. */

export const rules = [
  {
    order: 410,
    command: 'pnpm test:architecture',
    reason: 'architecture profile, conformance, agent packet, and cross-surface parity changed',
    matches: [
      /^docs\/ontology\/architecture\//,
      /^mcp\/src\/architecture-profile\.(?:mjs|test\.mjs)$/,
      /^cli\/src\/(?:commands\/architecture|lib\/architecture-results)\.mjs$/,
      /^src\/entities\/architecture-profile\//,
      /^src\/views\/architecture\//,
      /^tests\/contract\/architecture-profile\.contract\.test\.ts$/,
      /^tests\/fixtures\/architecture-profile-cases\.mjs$/,
    ],
  },
  {
    order: 440,
    command: 'pnpm test:contracts',
    reason:
      'cross-package parser/schema contract, or a UI file the design-system and a11y contracts scan from disk',
    matches: [
      // 2026-08-04 — for a new `.tsx` view and a new route this advisor suggested
      // nothing beyond tsc and i18n. But several gates in `tests/contract/` **read the
      // file system directly**: ramp coverage, the named-utility ratchet, the control
      // adoption ratchet, forbidden classes, inline hex, surface motion, label
      // decoration, and `audited-route-coverage`, which classifies routes. A newly
      // created UI file is their input, not somebody else's business.
      /^(?:src|app)\/.*\.tsx$/,
      /^tests\/contract\//,
      /^tests\/fixtures\/(?:frontmatter|frontmatter-writer|validate-vault|vault-schema)-cases\.mjs$/,
      /^mcp\/src\/(?:parser|schema|validate)\.mjs$/,
      /^cli\/src\/lib\/(?:parse-frontmatter|schema|validate)\.mjs$/,
      /^cli\/src\/commands\/validate\.mjs$/,
      /^scripts\/lib\/parse-frontmatter\.mjs$/,
      /^src\/shared\/lib\/(?:parse-frontmatter|validate-vault-document)\.ts$/,
      /^scripts\/migrate-vault\.mjs$/,
      /^scripts\/migrations\/[^/]+\.mjs$/,
    ],
  },
];
