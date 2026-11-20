'use client';

import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import type { TurnRun, TurnRunLine } from '../model/turn-run';
import type { MoruState } from './WorkRunMoru';
import type { SeatTint } from './use-scheduled-run-copy';
import { displayPageName, type WorkRunMarks } from './use-work-run-copy';

/** The card's column holds one name, so a long path keeps its start and its ending. */
const CARD_NAME_MAX = 34;

/** A typed request is named by its first line, cut at its end. */
const REQUEST_LINE_MAX = 60;

export interface TurnRunCopy {
  title: string;
  /** What the agent is doing or asks now; the result's sentence once it has ended. */
  detail: ReactNode;
  /** Files written and elapsed time while it runs. */
  figures: ReactNode | null;
  tint: SeatTint;
  moru: MoruState;
}

function requestLine(text: string): string {
  const first = text.normalize('NFC').split('\n').find((line) => line.trim() !== '')?.trim() ?? '';
  const chars = [...first];
  return chars.length <= REQUEST_LINE_MAX ? first : `${chars.slice(0, REQUEST_LINE_MAX - 1).join('')}…`;
}

const fileName = (path: string) => displayPageName(path.replace(/\.md$/, ''), CARD_NAME_MAX);

export function turnTint(run: TurnRun): SeatTint {
  if (run.phase === 'written' || run.phase === 'answered') return 'success';
  if (run.phase === 'stopped' || run.phase === 'ended' || run.phase === 'switched') return 'amber';
  return 'running';
}

/** Moru's rows: his work rows while it runs, the held pose while it waits or stops, then the result. */
function turnMoru(run: TurnRun): MoruState {
  switch (run.phase) {
    case 'running':
      return { phase: 'running', line: { kind: lineKind(run.line) } };
    case 'asking':
    case 'stopping':
      return { phase: 'asking', line: { kind: lineKind(run.line) } };
    case 'written':
    case 'answered':
      return { phase: 'clean', line: { kind: 'writing' } };
    default:
      return { phase: 'failed', line: { kind: 'writing' } };
  }
}

function lineKind(line: TurnRunLine): MoruState['line']['kind'] {
  switch (line.kind) {
    case 'connecting':
      return 'connecting';
    case 'reading':
      return 'reading';
    case 'tool':
      return 'tool';
    default:
      return 'writing';
  }
}

/** What a Library turn says on the card and in the runs list. */
export function useTurnRunCopy(run: TurnRun, elapsed: string | null, waited: string | null, marks: WorkRunMarks): TurnRunCopy {
  const t = useTranslations('workCard.turn');
  const tLibrary = useTranslations('library');
  const tChat = useTranslations('acpChat');
  const agent = run.agent;
  const written = run.written.length;
  const tint = turnTint(run);
  const moru = turnMoru(run);
  const doorName = run.door === 'typed'
    ? requestLine(run.request)
    : run.door === 'compile'
      ? tLibrary('stage.compile.title')
      : run.door === 'fix'
        ? tLibrary('wiki.fixWithAgent')
        : run.door === 'import'
          ? tLibrary('sources.import')
          : tLibrary('wiki.propose');
  const figures = t.rich('figures', { written, elapsed: elapsed ?? '', count: () => marks.count(written) });
  const lineText = (line: TurnRunLine): ReactNode => {
    switch (line.kind) {
      case 'connecting':
        return tChat('status.starting');
      case 'reading':
        return marks.page(fileName(line.page));
      case 'writingFile':
        return t.rich('writingFile', { file: fileName(line.file), name: (chunks) => marks.page(chunks) });
      case 'answering':
        return t('answering');
      case 'tool': {
        const { kind, text } = line.label;
        return kind === 'known'
          ? tChat(`tool.${text}` as Parameters<typeof tChat>[0])
          : kind === 'kind'
            ? tChat(`toolKind.${text}` as Parameters<typeof tChat>[0])
            : text;
      }
    }
  };
  const firstName = run.written[0] ? fileName(run.written[0]) : '';
  const endNote = run.partial.length > 0
    ? t('partial', { file: fileName(run.partial[0]!) })
    : run.beyond ? t('beyond', { agent }) : null;
  switch (run.phase) {
    case 'running':
      return { title: doorName, detail: lineText(run.line), figures, tint, moru };
    case 'asking': {
      const ask = run.ask;
      const target = ask?.target ? fileName(ask.target) : tChat('permission.unknownTarget');
      const detail = t.rich(`ask.${ask?.action ?? 'unknown'}`, { agent, target, name: (chunks) => marks.page(chunks) });
      return { title: t('waitingTitle', { elapsed: waited ?? '' }), detail, figures, tint, moru };
    }
    case 'stopping':
      return { title: t('stoppingTitle', { agent }), detail: t('stoppingBody', { agent }), figures: null, tint, moru };
    case 'written':
      return {
        title: t('writtenTitle', { count: written }),
        detail: written === 1 ? t('wroteOne', { agent, file: firstName }) : t('wroteMany', { agent, file: firstName, more: written - 1 }),
        figures: null,
        tint,
        moru,
      };
    case 'answered':
      return { title: t('answeredTitle'), detail: run.beyond ? t('beyond', { agent }) : t('answeredBody', { agent }), figures: null, tint, moru };
    case 'stopped':
      return { title: t('stoppedTitle', { count: written }), detail: endNote ?? t('stoppedBody'), figures: null, tint, moru };
    case 'ended':
      return { title: t('endedTitle', { agent }), detail: endNote ?? t('endedBody', { written }), figures: null, tint, moru };
    case 'switched':
      return { title: t('switchedTitle'), detail: t('switchedBody', { agent, folder: run.folderName, written }), figures: null, tint, moru };
  }
}
