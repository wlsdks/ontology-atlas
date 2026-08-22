/**
 * Makes a value safe as a POSIX shell argument — wraps it in single quotes and
 * escapes any single quotes inside. Prevents argument injection when assembling
 * CLI command strings an agent will copy and run.
 *
 * `cli/` and `mcp/` carry the same implementation, but those are physically
 * separate packages, so that duplication is deliberate and covered by a
 * contract. This unifies only the two copies that lived inside `src/`.
 */
export function shellArg(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}
