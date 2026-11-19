'use client';

import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Folder, FolderOpen, GitCommitHorizontal } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { ICON_SIZE } from '@/shared/ui/tokens/icon-size';

import { linkingRelation, namingIndex, type BuildState } from '../lib/build-play';
import {
  BUILD_CHANGE,
  BUILD_CONCEPTS,
  BUILD_FILES,
  BUILD_RELATIONS,
  BUILD_REPO,
  fileNameOf,
  filesOf,
  type BuildConceptId,
} from '../model/build-cast';

/** Files of the concept being named stack this far apart, in percent of the stage height. */
const STACK_STEP = 12;
const FOLDER_AT = { x: 50, y: 48 };

const at = (point: { x: number; y: number }, extra?: CSSProperties) => ({ '--x': point.x, '--y': point.y, ...extra }) as CSSProperties;

/**
 * The sample map: the folder, its files, the concepts they become, the relations the person
 * draws and the commit that lands on one concept. Everything is placed in percent of the stage,
 * and every move is one transition per input.
 */
export function BuildStage({
  state,
  nameOf,
  onTap,
}: {
  state: BuildState;
  nameOf: (concept: BuildConceptId) => string;
  onTap: (concept: BuildConceptId) => void;
}) {
  const t = useTranslations('download.build');
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const node = stage.current;
    if (!node) return;
    const measure = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const { phase } = state;
  const opened = phase !== 'closed';
  const grouped = !['closed', 'reading'].includes(phase);
  const naming = namingIndex(state);
  const relation = linkingRelation(state);
  const committed = ['impact', 'inspect', 'done'].includes(phase);
  const commitShown = ['commit', 'impact', 'inspect', 'done'].includes(phase);
  const point = (id: BuildConceptId) => BUILD_CONCEPTS.find((concept) => concept.id === id)!.at;
  const px = (p: { x: number; y: number }) => ({ x: (p.x / 100) * size.width, y: (p.y / 100) * size.height });

  const target = (id: BuildConceptId) => {
    if (relation) return state.pick === null ? id === relation.from : id === relation.to;
    return phase === 'impact' && id === BUILD_CHANGE.concept;
  };

  return (
    <div
      role="group"
      aria-label={t('stageLabel')}
      data-testid="build-stage"
      data-build-phase={phase}
      className="build-stage flex min-h-0 w-full flex-1 items-start overflow-hidden"
    >
      <div ref={stage} className="build-map relative w-full">
        {/* Relations, measured in pixels so each line draws from one end to the other. */}
        <svg aria-hidden className="pointer-events-none absolute inset-0 size-full" viewBox={`0 0 ${size.width || 1} ${size.height || 1}`}>
          {BUILD_RELATIONS.map((rel, index) => {
            const a = px(point(rel.from));
            const b = px(point(rel.to));
            const drawn = state.links > index || phase === 'commit' || committed;
            const hot = committed && phase !== 'done' && (rel.from === BUILD_CHANGE.concept || rel.to === BUILD_CHANGE.concept);
            return (
              <line
                key={rel.label}
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                pathLength={1}
                data-drawn={drawn || undefined}
                data-hot={hot || undefined}
                className="build-edge"
              />
            );
          })}
        </svg>

        {/* The folder, closed until it is opened, then left behind as its files fly out. */}
        <div className="build-at" data-shown={!opened || undefined} style={at(FOLDER_AT)}>
          <div className="build-center build-folder flex flex-col items-center gap-2 text-center">
            <span className="build-folder-icon relative grid size-16 place-items-center rounded-card">
              {opened ? <FolderOpen size={ICON_SIZE.lg} aria-hidden className="size-8" /> : <Folder size={ICON_SIZE.lg} aria-hidden className="size-8" />}
            </span>
            <span className="font-mono text-body leading-body text-[color:var(--color-text-primary)]">{BUILD_REPO}/</span>
            <span className="text-label leading-label text-[color:var(--color-text-tertiary)]">{t('files', { count: BUILD_FILES.length })}</span>
          </div>
        </div>

        {BUILD_FILES.map((file, order) => {
          const conceptOrder = BUILD_CONCEPTS.findIndex((concept) => concept.id === file.concept);
          const siblings = filesOf(file.concept);
          const slot = siblings.indexOf(file);
          const anchor = point(file.concept);
          const absorbed = state.names[conceptOrder] !== null;
          const place = !opened
            ? FOLDER_AT
            : !grouped
              ? file.loose
              : absorbed
                ? anchor
                : { x: anchor.x, y: anchor.y + (slot - (siblings.length - 1) / 2) * STACK_STEP };
          const presence = !opened || absorbed ? 'gone' : grouped && naming !== conceptOrder ? 'waiting' : 'live';
          return (
            <div
              key={file.path}
              className="build-at build-file-at"
              data-file={presence}
              style={at(place, { '--delay': `calc(var(--motion-stagger) * ${opened && !grouped ? order : slot})` } as CSSProperties)}
            >
              <span className="build-center build-file inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 font-mono text-label leading-label @min-[40rem]:px-3 @min-[40rem]:py-1.5 @min-[40rem]:text-body @min-[40rem]:leading-body">
                <span aria-hidden className="build-file-dot size-1.5 shrink-0 rounded-full" />
                {fileNameOf(file.path)}
              </span>
            </div>
          );
        })}

        {/* The changed file, carried from the commit card into the concept that holds it. */}
        <div
          aria-hidden
          className="build-at build-carry-at"
          data-carry={phase === 'commit' ? 'card' : committed ? 'landed' : 'none'}
          style={at(committed ? point(BUILD_CHANGE.concept) : { x: 78, y: 12 })}
        >
          <span className="build-center build-carry inline-flex items-center gap-1.5 whitespace-nowrap rounded-chip px-2.5 py-1 font-mono text-label leading-label">
            {fileNameOf(BUILD_CHANGE.file)}
          </span>
        </div>

        {BUILD_RELATIONS.map((rel, index) => {
          const a = point(rel.from);
          const b = point(rel.to);
          const shown = state.links > index || commitShown;
          return (
            <div key={rel.label} aria-hidden className="build-at build-edge-label-at" data-shown={shown || undefined} style={at({ x: a.x + (b.x - a.x) * rel.labelAt, y: a.y + (b.y - a.y) * rel.labelAt })}>
              <span className="build-center build-edge-label whitespace-nowrap rounded-chip px-2 py-0.5 text-label leading-label @min-[40rem]:px-2.5 @min-[40rem]:text-body @min-[40rem]:leading-body">
                {t(`relations.${rel.label}`)}
              </span>
            </div>
          );
        })}

        {BUILD_CONCEPTS.map((concept, order) => {
          const named = state.names[order] !== null;
          const name = named ? nameOf(concept.id) : '';
          const tappable = named && (relation !== null || phase === 'impact' || phase === 'inspect');
          const changed = committed && concept.id === BUILD_CHANGE.concept;
          return (
            <div key={concept.id} className="build-at build-node-at" data-shown={named || undefined} style={at(concept.at)}>
              <button
                type="button"
                data-testid={`build-node-${concept.id}`}
                data-target={(named && target(concept.id)) || undefined}
                data-picked={state.pick === concept.id || undefined}
                data-changed={changed || undefined}
                data-checked={(phase === 'done' && changed) || undefined}
                disabled={!tappable}
                tabIndex={named ? undefined : -1}
                aria-label={named ? t('nodeLabel', { name, count: filesOf(concept.id).length }) : undefined}
                aria-pressed={relation ? state.pick === concept.id : undefined}
                onClick={() => onTap(concept.id)}
                className="build-node-anchor build-node group relative flex flex-col items-center gap-2 rounded-card px-3 pb-1.5 pt-3 outline-offset-2 disabled:cursor-default"
              >
                <span aria-hidden className="build-node-mark relative grid place-items-center">
                  <span className="build-node-glow absolute rounded-full" />
                  <span className="build-node-ring absolute inset-0 rounded-full" />
                  <span className="build-node-dot relative rounded-full" />
                </span>
                <span className="build-node-name whitespace-nowrap text-body-lg leading-body-lg font-[var(--font-weight-strong)] @min-[40rem]:text-title @min-[40rem]:leading-title">{name}</span>
                <span className="whitespace-nowrap text-label leading-label text-[color:var(--color-text-tertiary)]">
                  {t('files', { count: filesOf(concept.id).length })}
                </span>
              </button>
            </div>
          );
        })}

        {/* The agent's commit, pinned to the stage's top edge from the moment it arrives. */}
        <div
          data-testid="build-commit"
          data-shown={commitShown || undefined}
          className="build-commit absolute right-3 top-3 flex max-w-[calc(100%-1.5rem)] items-start gap-2.5 rounded-card px-3 py-2.5"
        >
          <GitCommitHorizontal size={ICON_SIZE.md} aria-hidden className="mt-0.5 shrink-0 text-[color:var(--map-recent-change)]" />
          <span className="min-w-0">
            <span className="block truncate font-mono text-label leading-label text-[color:var(--color-text-primary)]">
              {BUILD_CHANGE.sha} · {t('commitMessage')}
            </span>
            <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-tertiary)]">{t('commitAuthor')}</span>
          </span>
        </div>

      </div>
    </div>
  );
}
