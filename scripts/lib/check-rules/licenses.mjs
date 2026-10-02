/** Third-party licenses: the allow-list over every shipped dependency tree, and the notices generated from those trees. */

const SHIPPED_TREES = [
  /^(?:mcp\/)?(?:package\.json|pnpm-lock\.yaml)$/,
  /^src-tauri\/Cargo\.(?:toml|lock)$/,
];

const POLICY = [
  /^scripts\/check-licenses\.mjs$/,
  /^scripts\/lib\/(?:license-policy|third-party-inventory|attribution-marker)(?:\.test)?\.mjs$/,
  /^scripts\/data\/license-exceptions\.json$/,
];

const GENERATOR = [
  /^scripts\/build-notice(?:\.test)?\.mjs$/,
  /^scripts\/lib\/(?:third-party-inventory|third-party-licenses|attribution-marker)\.mjs$/,
  /^NOTICE\.md$/,
  /^public\/third-party-licenses\.txt$/,
];

export const rules = [
  {
    order: 1295,
    command: 'pnpm licenses:check',
    reason: 'a shipped dependency tree or the license policy changed: every package must stay on the allow-list',
    matches: [...SHIPPED_TREES, ...POLICY],
  },
  {
    order: 1296,
    command: 'pnpm notice:check',
    reason: 'a shipped dependency tree or the notice generator changed: NOTICE.md and the license texts must be regenerated',
    matches: [...SHIPPED_TREES, ...GENERATOR],
  },
];

export const directTests = {
  script: [
    ['scripts/check-licenses.mjs', 'scripts/lib/license-policy.test.mjs'],
    ['scripts/lib/license-policy.mjs', 'scripts/lib/license-policy.test.mjs'],
    ['scripts/lib/license-policy.test.mjs', 'scripts/lib/license-policy.test.mjs'],
    ['scripts/lib/attribution-marker.mjs', 'scripts/lib/license-policy.test.mjs'],
    ['scripts/build-notice.mjs', 'scripts/build-notice.test.mjs'],
    ['scripts/build-notice.test.mjs', 'scripts/build-notice.test.mjs'],
    ['scripts/lib/third-party-licenses.mjs', 'scripts/build-notice.test.mjs'],
    ['scripts/lib/third-party-inventory.mjs', 'scripts/build-notice.test.mjs'],
  ],
};
