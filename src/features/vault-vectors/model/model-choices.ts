import type { VectorProbe, VectorSource } from '@/shared/lib/vault-folder/tauri-vault-vectors';

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

export function offeredRunnerModels(probe: VectorProbe): string[] {
  const runner = probe.runner;
  if (runner?.state !== 'reachable') return [];
  const allowed = runner.models.filter((model) => !NEVER_OFFERED.some((name) => baseName(model).startsWith(name)));
  return [
    ...allowed.filter((model) => baseName(model) === PREFERRED_RUNNER_MODEL),
    ...allowed.filter((model) => baseName(model) !== PREFERRED_RUNNER_MODEL),
  ];
}

/** The folder's own runner model stays listed while Ollama is off, so the person still sees what the folder uses. */
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

/** Ollama's bge-m3 while the built-in model is not downloaded, since it needs no download; otherwise the built-in model. */
export function recommendedChoiceId(choices: ModelChoice[]): string {
  const builtin = choices.find((choice) => choice.kind === 'builtin');
  // A download begun is the person's choice already; Ollama would make them start over.
  if (builtin?.kind === 'builtin' && builtin.holding !== 'none') return builtin.id;
  const runner = choices.find((choice) => choice.kind === 'runner' && choice.reachable && baseName(choice.model) === PREFERRED_RUNNER_MODEL);
  return runner?.id ?? 'builtin';
}

export function isLive(choice: ModelChoice): boolean {
  return choice.inUse && (choice.kind === 'builtin' ? choice.holding === 'ready' : choice.reachable);
}

export type ChoiceTag = 'tagWorking' | 'tagInUse' | 'tagRunner' | 'tagRunnerOff' | 'tagReady' | 'tagPartial' | 'tagNone';

export function choiceTag(choice: ModelChoice, working: boolean): ChoiceTag {
  if (choice.inUse && working) return 'tagWorking';
  if (isLive(choice)) return 'tagInUse';
  if (choice.kind === 'runner') return choice.reachable ? 'tagRunner' : 'tagRunnerOff';
  return choice.holding === 'ready' ? 'tagReady' : choice.holding === 'partial' ? 'tagPartial' : 'tagNone';
}

export function isDiskShort(probe: VectorProbe): boolean {
  return probe.builtin.freeBytes < probe.builtin.neededFreeBytes;
}

export function isSwitching(choice: ModelChoice, current: VectorSource | null, working: boolean): boolean {
  return current !== null && !choice.inUse && !working;
}

export function isDeletable(choice: ModelChoice, current: VectorSource | null, working: boolean): boolean {
  return choice.kind === 'builtin' && choice.holding !== 'none' && !(working && current?.kind === 'builtin');
}

export type PrimaryPress = { label: 'prepare' | 'resumeDownload' | 'downloadAndPrepare'; disabled: boolean };

export function primaryPress(choice: ModelChoice, working: boolean, diskShort: boolean): PrimaryPress | null {
  if (working || isLive(choice)) return null;
  if (choice.kind === 'runner') return { label: 'prepare', disabled: !choice.reachable };
  const label = choice.holding === 'ready' ? 'prepare' : choice.holding === 'partial' ? 'resumeDownload' : 'downloadAndPrepare';
  return { label, disabled: diskShort };
}
