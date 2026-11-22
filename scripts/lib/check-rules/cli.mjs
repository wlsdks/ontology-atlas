/** `cli/`: the init command, its helpers and its entry. */

export const rules = [
  {
    order: 1160,
    command: 'pnpm test:cli',
    reason: 'the init command, its entry, or a helper it uses changed',
    matches: [/^cli\/src\//, /^cli\/package\.json$/],
  },
];

export const directTests = {
  cli: [
    ['cli/src/main.mjs', 'cli/src/main.test.mjs'],
    ['cli/src/lib/cli-args.mjs', 'cli/src/lib/cli-args.test.mjs'],
    ['cli/src/lib/colors.mjs', 'cli/src/lib/colors.test.mjs'],
    ['cli/src/lib/init/client-config.mjs', 'cli/src/lib/init/client-config.test.mjs'],
    ['cli/src/lib/init/mcp-server-command.mjs', 'cli/src/lib/init/mcp-server-command.test.mjs'],
    ['cli/src/lib/init/parse-args.mjs', 'cli/src/lib/init/parse-args.test.mjs'],
    ['cli/src/lib/init/template-copy.mjs', 'cli/src/lib/init/template-copy.test.mjs'],
    ['cli/src/lib/init/run-init.mjs', 'cli/src/main.test.mjs'],
    ['cli/src/lib/init/next-steps.mjs', 'cli/src/main.test.mjs'],
    ['cli/src/lib/agent-setup/agent-config.mjs', 'cli/src/lib/agent-setup/agent-config.test.mjs'],
    ['cli/src/lib/agent-setup/cwd-binding-scope.mjs', 'cli/src/lib/agent-setup/cwd-binding-scope.test.mjs'],
    ['cli/src/lib/vault-files/atomic-write.mjs', 'cli/src/lib/vault-files/atomic-write.test.mjs'],
  ],
};
