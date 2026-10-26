'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { readArrivalMemory, writeArrivalMemory } from '@/shared/lib/navigation/route-arrival-memory-store';
import { analyseSourceBriefing, sourceModelCapacity, type SourceModelCapacity } from '@/shared/lib/llm-connection/source-briefing';
import type { LocalEndpointSettings } from '@/shared/lib/llm-connection/local-endpoint';
import type { ChangeBriefing } from '@/shared/lib/git/tauri-change-briefing';
import { narrativeResponse, type NarrativePacket, type NarrativeSource } from './narrative';
import { planPeriod, type PeriodPlan } from './period-run';
import { executePeriod, executionCoverage, freshExecution, type PeriodExecution, type PeriodFailure } from './period-execution';

const activeJobs = new Map<string, { controller: AbortController; done: Promise<void> }>();
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const notify = () => listeners.forEach(listener => listener());

export interface StoredPeriodRun {
  id: string; epoch: string; key: string; period: string; head: string; capacity: SourceModelCapacity;
  connection: LocalEndpointSettings; collectionPartial: boolean; locale: string; plan: PeriodPlan; execution: PeriodExecution; selection: 'overview' | number;
}
interface Preview { key: string; connection: LocalEndpointSettings; plan: PeriodPlan; capacity: SourceModelCapacity }
function failureFrom(error: unknown): PeriodFailure {
  const detail = String(error);
  return { detail, code: (detail.includes('audit-blocked:') || detail.includes('audit-log-')) ? 'auditFailed' : detail.includes('model-limit') ? 'modelLimit' : detail.includes('model-unavailable') ? 'modelUnavailable' : detail.includes('stale') || detail.includes('ungranted') ? 'stale' : 'analysisFailed' };
}

export function usePeriodNarrative({ data, period, sources, lookup, identity, connection, locale }: {
  data: ChangeBriefing; period: string; sources: NarrativeSource[]; lookup: PeriodPlan['lookup']; identity: string; connection: LocalEndpointSettings; locale: string;
}) {
  const memoryKey = `source-period-run:${data.sourceRoot}`;
  const [run, setRunState] = useState<StoredPeriodRun | null>(() => readArrivalMemory<StoredPeriodRun>(memoryKey) ?? null);
  const remember = (value: StoredPeriodRun) => { writeArrivalMemory(memoryKey, value); setRunState(value); };
  const unsettled = useSyncExternalStore(subscribe, () => activeJobs.has(memoryKey), () => false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<'preparing' | 'analyzing' | 'cancelling' | null>(null);
  const [preparationFailure, setPreparationFailure] = useState<{ key: string; value: PeriodFailure } | null>(null);
  const controller = useRef<AbortController | null>(null);
  const previewOpener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => () => controller.current?.abort(), [identity]);
  const stale = Boolean(run && (run.key !== identity || run.execution.status === 'stale'));
  async function prepare(opener?: HTMLButtonElement) {
    if (controller.current) return;
    const owned = new AbortController(); controller.current = owned;
    previewOpener.current = opener ?? (document.activeElement instanceof HTMLButtonElement ? document.activeElement : null);
    setBusy('preparing'); setPreparationFailure(null);
    try {
      const capacity = await sourceModelCapacity(connection.baseUrl, connection.model);
      if (owned.signal.aborted) return;
      if (!capacity) throw new Error('model-unavailable');
      setPreview({ key: identity, connection, capacity, plan: planPeriod(sources, period, capacity.inputByteLimit, lookup) });
    } catch (error) { setPreparationFailure({ key: identity, value: failureFrom(error) }); }
    finally { setBusy(null); if (controller.current === owned) controller.current = null; }
  }
  async function resume(target: StoredPeriodRun) {
    if (controller.current || target.key !== identity || target.execution.status === 'stale') return;
    const owned = new AbortController(); controller.current = owned;
    target = { ...target, epoch: crypto.randomUUID() };
    remember(target);
    setBusy('analyzing'); setPreparationFailure(null);
    const previous = activeJobs.get(memoryKey);
    let settle!: () => void;
    const job = { controller: owned, done: new Promise<void>(resolve => { settle = resolve; }) };
    activeJobs.set(memoryKey, job); notify();
    try {
      if (previous) { previous.controller.abort(); await previous.done; }
      if (owned.signal.aborted) return;
      await executePeriod(target.plan, target.execution, owned.signal, async (packet: NarrativePacket) => {
        let echo;
        try { echo = await analyseSourceBriefing({ sourcePath: data.sourceRoot, head: target.head, snapshot: data.snapshot, baseUrl: target.connection.baseUrl, model: target.connection.model, locale: target.locale, packet: packet.text, expectedCapacity: target.capacity }, owned.signal); }
        catch (error) { throw failureFrom(error); }
        if (echo.status !== 200) throw { code: 'analysisFailed', detail: `HTTP ${echo.status}`, delivery: 'confirmed' } satisfies PeriodFailure;
        try { return narrativeResponse(echo.body, packet, target.locale); }
        catch (error) {
          const detail = String(error);
          throw { code: detail.includes('model finish length') ? 'incompleteAnalysis' : detail.includes('language mismatch') ? 'languageMismatch' : 'invalidAnalysis', response: echo.body.slice(0, 65536), detail, delivery: 'confirmed' } satisfies PeriodFailure;
        }
      }, execution => {
        const latest = readArrivalMemory<StoredPeriodRun>(memoryKey);
        if (latest?.id === target.id && latest.epoch === target.epoch) remember({ ...latest, execution });
      });
    } finally {
      settle();
      if (activeJobs.get(memoryKey) === job) { activeJobs.delete(memoryKey); notify(); }
      setBusy(null); if (controller.current === owned) controller.current = null;
    }
  }
  function start() {
    if (!preview || preview.key !== identity || !preview.plan.parts.length || controller.current) return;
    const target: StoredPeriodRun = { id: crypto.randomUUID(), epoch: '', key: identity, period, head: data.head, connection, collectionPartial: data.status === 'partial', locale, capacity: preview.capacity, plan: preview.plan, execution: freshExecution(preview.plan), selection: 'overview' };
    remember(target); setPreview(null); void resume(target);
  }
  function stop() { if (controller.current) { setBusy('cancelling'); controller.current.abort(); } }
  const selected = run?.selection === 'overview' && run.execution.overview ? { packet: run.plan.parts.length === 1 ? run.plan.parts[0] : run.execution.overviewSelection!.packet!, narrative: run.execution.overview, overview: true, index: -1 }
    : run && run.execution.accepted.length ? (() => { const index = typeof run.selection === 'number' ? Math.min(run.selection, run.execution.accepted.length - 1) : 0; return { packet: run.plan.parts[index], narrative: run.execution.accepted[index], overview: false, index }; })() : null;
  const failure = preparationFailure?.key === identity ? preparationFailure.value : run?.execution.failure;
  return { run, preview: preview?.key === identity ? preview : null, closePreview: () => { setPreview(null); requestAnimationFrame(() => previewOpener.current?.focus({ preventScroll: true })); }, prepare, start, resume: () => { const latest = readArrivalMemory<StoredPeriodRun>(memoryKey); if (latest && !stale) void resume(latest); }, busy: busy ?? (unsettled ? 'cancelling' : null), stop, stale, failure,
    current: selected, coverage: run ? executionCoverage(run.plan, run.execution) : null,
    select: (selection: 'overview' | number) => { const latest = readArrivalMemory<StoredPeriodRun>(memoryKey); if (latest) remember({ ...latest, selection }); } };
}
