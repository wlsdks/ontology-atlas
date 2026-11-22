/**
 * Makes a value safe as a POSIX shell argument: single-quoted, inner single quotes escaped, so a
 * command string an agent copies and runs cannot be argument-injected. `cli/` and `mcp/` carry the
 * same implementation as separate packages; a contract covers the duplication.
 */
export function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
