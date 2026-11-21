/**
 * The hint under a connection trouble. A usage limit has no way out when this is the only tool, so it
 * gets its own sentence.
 */
export function troubleHintKeyOf(trouble: { kind: string } | null, canChooseAnotherTool: boolean): string {
  return trouble?.kind === 'limit' && !canChooseAnotherTool
    ? 'trouble.limit.hintOnlyTool'
    : `trouble.${trouble?.kind ?? 'unknown'}.hint`;
}
