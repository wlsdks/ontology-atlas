import type { VectorProbe, VectorSource } from '@/shared/lib/vault-folder/tauri-vault-vectors';

/** What the built-in model holds on this computer: all of it, part of a download, or nothing. */
export type BuiltinHolding = 'ready' | 'partial' | 'none';

export type ModelChoice =
  | { id: 'builtin'; kind: 'builtin'; holding: BuiltinHolding; inUse: boolean }
  | { id: string; kind: 'runner'; model: string; baseUrl: string; reachable: boolean; inUse: boolean };

/** The built-in model's name, as its maker publishes it; a name, not copy. */
export const BUILTIN_MODEL_NAME = 'bge-m3';

/** Models the spec's model table never offers (`docs/specs/2026-11-19-search-by-meaning.md`, licence column). */
const NEVER_OFFERED = ['embeddinggemma', 'jina-embeddings-v3'];
const PREFERRED_RUNNER_MODEL = BUILTIN_MODEL_NAME;

const baseName = (model: string) => model.split(':')[0]!.split('/').pop()!.toLowerCase();

export const runnerChoiceId = (model: string) => `runner:${model}`;

export function builtinHolding(probe: VectorProbe): BuiltinHolding {
  if (probe.builtin.onDisk) return 'ready';
  return probe.builtin.modelBytes > 0 ? 'partial' : 'none';
}

/** Ollama's embedding models the dialog may offer, bge-m3 under any tag first. */
export function offeredRunnerModels(probe: VectorProbe): string[] {
  const runner = probe.runner;
  if (runner?.state !== 'reachable') return [];
  const allowed = runner.models.filter((model) => !NEVER_OFFERED.some((name) => baseName(model).startsWith(name)));
  return [
    ...allowed.filter((model) => baseName(model) === PREFERRED_RUNNER_MODEL),
    ...allowed.filter((model) => baseName(model) !== PREFERRED_RUNNER_MODEL),
  ];
}

/**
 * Every model the folder can search with, the built-in one first. The folder's own runner model
 * stays listed while Ollama is off, so the person still sees what the folder uses.
 */
export function modelChoices(probe: VectorProbe, current: VectorSource | null): ModelChoice[] {
  const usesRunner = current?.kind === 'runner' ? current : null;
  const baseUrl = probe.runner?.address ?? usesRunner?.baseUrl ?? '';
  const offered = offeredRunnerModels(probe);
  const runnerModels = usesRunner && !offered.includes(usesRunner.model) ? [...offered, usesRunner.model] : offered;
  return [
    { id: 'builtin', kind: 'builtin', holding: builtinHolding(probe), inUse: current?.kind === 'builtin' },
    ...runnerModels.map((model): ModelChoice => ({
      id: runnerChoiceId(model),
      kind: 'runner',
      model,
      baseUrl: usesRunner?.model === model ? usesRunner.baseUrl : baseUrl,
      reachable: offered.includes(model),
      inUse: usesRunner?.model === model,
    })),
  ];
}

export function choiceIdOf(source: VectorSource | null): string {
  return source?.kind === 'runner' ? runnerChoiceId(source.model) : 'builtin';
}

/**
 * The choice the dialog marks and opens on for a folder without one: Ollama's bge-m3 while the
 * built-in model is not downloaded, since it needs no download; otherwise the built-in model.
 */
export function recommendedChoiceId(choices: ModelChoice[]): string {
  const builtin = choices.find((choice) => choice.kind === 'builtin');
  // A download begun is the person's choice already; Ollama would make them start over.
  if (builtin?.kind === 'builtin' && builtin.holding !== 'none') return builtin.id;
  const runner = choices.find((choice) => choice.kind === 'runner' && choice.reachable && baseName(choice.model) === PREFERRED_RUNNER_MODEL);
  return runner?.id ?? 'builtin';
}

/** The folder searches with this choice now: its model is here and answering. */
export function isLive(choice: ModelChoice): boolean {
  return choice.inUse && (choice.kind === 'builtin' ? choice.holding === 'ready' : choice.reachable);
}
