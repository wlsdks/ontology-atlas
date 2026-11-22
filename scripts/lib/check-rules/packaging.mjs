/** Package manifests and release contracts. */

export const rules = [
  {
    order: 1290,
    command: 'pnpm test:mcp:package',
    reason: 'package or release contract changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/pnpm-lock\.yaml$/,
      /^cli\/package\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/packaging\/check-package-contracts\.(?:mjs|test\.mjs)$/,
    ],
  },
];

export const escalations = [
  {
    order: 10,
    command: 'pnpm package:check',
    reason: 'package manifests, docs contracts, or release scripts changed',
    matches: [
      /^package\.json$/,
      /^pnpm-lock\.yaml$/,
      /^mcp\/package\.json$/,
      /^mcp\/pnpm-lock\.yaml$/,
      /^cli\/package\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/packaging\/check-package-contracts\.(?:mjs|test\.mjs)$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/packaging/check-package-contracts.mjs', 'scripts/packaging/check-package-contracts.test.mjs'],
    ['scripts/packaging/check-package-contracts.test.mjs', 'scripts/packaging/check-package-contracts.test.mjs'],
  ],
};
