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
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
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
      /^mcp\/package-lock\.json$/,
      /^cli\/package\.json$/,
      /^cli\/package-lock\.json$/,
      /^\.github\/workflows\/release-macos\.yml$/,
      /^\.github\/PULL_REQUEST_TEMPLATE\.md$/,
      /^scripts\/check-package-contracts\.(?:mjs|test\.mjs)$/,
      /^scripts\/smoke-packed-cli\.mjs$/,
    ],
  },
];

export const directTests = {
  script: [
    ['scripts/check-package-contracts.mjs', 'scripts/check-package-contracts.test.mjs'],
    ['scripts/check-package-contracts.test.mjs', 'scripts/check-package-contracts.test.mjs'],
  ],
};
