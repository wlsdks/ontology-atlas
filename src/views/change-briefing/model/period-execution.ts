import { overviewPacket, type OverviewSelection, type PeriodPlan } from './period-run';
import type { Narrative, NarrativePacket } from './narrative';

export type Delivery = 'pending' | 'uncertain' | 'confirmed';
export interface PeriodFailure { code: string; detail: string; response?: string; delivery?: Delivery }
export interface PeriodExecution {
  accepted: Narrative[]; delivery: Delivery[];
  status: 'paused' | 'reading' | 'overview' | 'failed' | 'stale' | 'finished';
  overviewSelection?: OverviewSelection; overview?: Narrative;
  failure?: PeriodFailure & { stage: 'part' | 'overview'; index: number };
}
export const freshExecution = (plan: PeriodPlan): PeriodExecution => ({ accepted: [], delivery: plan.parts.map(() => 'pending'), status: 'paused' });

/** Sequential checkpointed work. A caller owns the abort controller and immutable run identity. */
export async function executePeriod(plan: PeriodPlan, initial: PeriodExecution, signal: AbortSignal,
  analyse: (packet: NarrativePacket) => Promise<Narrative>, checkpoint: (state: PeriodExecution) => void): Promise<void> {
  let state: PeriodExecution = { ...initial, failure: undefined };
  const save = (next: Partial<PeriodExecution>) => { state = { ...state, ...next }; checkpoint(state); };
  let stage: 'part' | 'overview' = 'part';
  let index = state.accepted.length;
  try {
    for (; index < plan.parts.length; index++) {
      if (signal.aborted) { save({ status: 'paused' }); return; }
      const prior = state.delivery[index];
      save({ status: 'reading', delivery: state.delivery.map((value, i) => i === index && value !== 'confirmed' ? 'uncertain' : value) });
      let narrative: Narrative;
      try { narrative = await analyse(plan.parts[index]); }
      catch (error) {
        const failure = error as PeriodFailure;
        const delivery = failure.delivery === 'confirmed' || prior === 'confirmed' ? 'confirmed' : failure.delivery === 'pending' ? prior : 'uncertain';
        save({ delivery: state.delivery.map((value, i) => i === index ? delivery : value) });
        throw error;
      }
      save({ delivery: state.delivery.map((value, i) => i === index ? 'confirmed' : value) });
      if (signal.aborted) { save({ status: 'paused' }); return; }
      save({ accepted: [...state.accepted, narrative] });
    }
    if (signal.aborted) { save({ status: 'paused' }); return; }
    if (plan.parts.length === 1) { save({ status: 'finished', overview: state.accepted[0] }); return; }
    stage = 'overview';
    const selection = state.overviewSelection ?? overviewPacket(plan, state.accepted);
    save({ overviewSelection: selection });
    if (!selection.packet) { save({ status: 'finished' }); return; }
    if (!state.overview) {
      save({ status: 'overview' });
      const overview = await analyse(selection.packet);
      if (signal.aborted) { save({ status: 'paused' }); return; }
      save({ overview });
    }
    save({ status: 'finished' });
  } catch (error) {
    if (signal.aborted) { save({ status: 'paused' }); return; }
    const failure = error as PeriodFailure;
    save({ status: failure.code === 'stale' ? 'stale' : 'failed', failure: { code: failure.code ?? 'analysisFailed', detail: failure.detail ?? String(error), response: failure.response, stage, index } });
  }
}

export function executionCoverage(plan: PeriodPlan, state: PeriodExecution) {
  const sent = new Set<string>(); const uncertain = new Set<string>(); const linked = new Set<string>();
  state.delivery.forEach((delivery, index) => plan.parts[index].sources.forEach(source => { if (delivery === 'confirmed') sent.add(source.id); else if (delivery === 'uncertain') uncertain.add(source.id); }));
  state.accepted.forEach((narrative, index) => {
    const unlinked = new Set(narrative.unexplained.map(source => source.id));
    plan.parts[index].sources.forEach(source => { if (!unlinked.has(source.id)) linked.add(source.id); });
  });
  return { sent, uncertain, linked, unsent: plan.sources.length - sent.size - uncertain.size, unexplained: sent.size - linked.size };
}
