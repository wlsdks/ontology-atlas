import { motion } from 'framer-motion';
import { badgeClass } from "@/shared/ui/badge-class";
import { cn } from '@/shared/lib/cn';
import { MOTION, STAGGER } from '@/shared/motion';
import type { Project } from '../model/types';

/**
 * The category facts a card needs, so `ProjectCard` never has to know the whole
 * `Category` entity. Callers map `Category` → `CardCategoryMeta`.
 */
export interface CardCategoryMeta {
  borderStyle: 'underline' | 'dashed' | 'sideLabel' | 'solid';
  /** Vertical text on the left, for the `sideLabel` style. */
  sideLabelText?: string;
}

/** Preset status-dot colour — same set as `StatusDotColor` in entities/status. */
export type CardStatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';
export type ProjectCardViewMode = 'card' | 'compact';

interface Props {
  project: Project;
  /** Category meta; defaults to `solid` when absent. */
  category?: CardCategoryMeta;
  /** Status dot colour; defaults to `neutral`. */
  statusDotColor?: CardStatusDotColor;
  /** Dimmed against the topology background. Unused in preview. */
  dimmed?: boolean;
  /** Selection marker — an indigo outline. */
  selected?: boolean;
  /** SHARED badge, shown when the project depends on two or more hubs. */
  shared?: boolean;
  /** Whether this is directly connected to the selected project. */
  related?: boolean;
  /** Index used for the initial staggered fade-in delay. Zero in preview. */
  index?: number;
  /** Lowers information density on large graphs. */
  dense?: boolean;
  /** Preview mode: no pointer cursor, motion transitions skipped. */
  preview?: boolean;
  /** Eyebrow above the card when `isHub`. The caller passes the translated string;
   *  absent falls back to English 'Core hub', the primitive default. */
  hubEyebrow?: string;
  /** Eyebrow when `shared`. Absent falls back to English 'Shared system'. */
  sharedEyebrow?: string;
  /** Placeholder when the description is empty. Absent falls back to 'No description'. */
  descriptionEmptyLabel?: string;
  /** How the public map renders this card. */
  viewMode?: ProjectCardViewMode;
}

function statusDotClass(color: CardStatusDotColor): string {
  switch (color) {
    case 'success':
      return 'bg-[color:var(--color-status-success)]';
    case 'warning':
      return 'bg-[color:var(--color-status-warning)]';
    case 'paused':
      return 'bg-[color:var(--color-status-paused)]';
    case 'neutral':
    default:
      return 'bg-[color:var(--color-text-quaternary)]';
  }
}

function borderClass(borderStyle: CardCategoryMeta['borderStyle'], isHub: boolean): string {
  if (isHub) {
    return 'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a12)]';
  }
  switch (borderStyle) {
    /*
     * **The category underline is gone** (owner instruction, 2026-08-17).
     *
     * This case used to mark the "in progress" category with a 2px indigo
     * underline (the charter's "categories are told by border shape, not colour").
     * It was softened and re-reviewed, and the verdict held — *"drop the blue line at the bottom entirely"* (drop the blue line at the bottom entirely).
     *
     * So it falls back to the same plain border as every other category. The
     * category is still stated by the card's side label and by the category marks
     * in the list and detail views — the fact does not disappear, one of the places
     * that state it does.
     */
    case 'underline':
      return 'border border-[color:var(--color-border-soft)]';
    case 'dashed':
      return 'border border-dashed border-[color:var(--color-border-strong)]';
    case 'sideLabel':
      return 'border border-[color:var(--color-border-soft)]';
    case 'solid':
    default:
      return 'border border-[color:var(--color-divider)]';
  }
}

/**
 * The project card's pure visuals, independent of any graph renderer, so the
 * admin preview and the card rendering share one implementation. Category and
 * status meta are looked up by the caller and injected as props.
 */
export function ProjectCard({
  project,
  category,
  statusDotColor = 'neutral',
  dimmed = false,
  selected = false,
  shared = false,
  related = false,
  index = 0,
  dense = false,
  preview = false,
  viewMode = 'card',
  hubEyebrow = 'Core hub',
  sharedEyebrow = 'Shared system',
  descriptionEmptyLabel = 'No description',
}: Props) {
  const { name, description, owner, tags } = project;
  // A vault whose frontmatter omits `isHub` yields undefined — read that as false.
  const isHub = Boolean(project.isHub);
  const borderStyle = category?.borderStyle ?? 'solid';
  const sideLabelText = category?.sideLabelText;
  const visibleTags = tags.slice(0, 3);
  const eyebrow = isHub ? hubEyebrow : shared ? sharedEyebrow : null;
  const fallbackMeta = owner ?? project.slug;
  if (viewMode === 'compact') {
    return (
      <motion.div
        data-testid={`topology-project-${project.slug}`}
        data-view-mode="compact"
        initial={preview ? false : { opacity: 0, y: 8 }}
        animate={preview ? undefined : { opacity: dimmed ? 0.14 : 1, y: 0 }}
        transition={
          preview
            ? undefined
            : {
                opacity: { ...MOTION.base, delay: index * STAGGER },
                y: { ...MOTION.base, delay: index * STAGGER },
              }
        }
        className={cn(
          'group relative flex items-start justify-center',
          preview ? '' : 'cursor-pointer active:cursor-grabbing',
          dense ? 'w-[84px]' : 'w-[108px]',
        )}
      >
        <div
          className={cn(
            'relative flex items-center justify-center rounded-full border shadow-[var(--shadow-elevation-1)] transition-[transform,background-color,border-color,box-shadow] duration-[var(--motion-fast)] group-hover:-translate-y-0.5 group-hover:shadow-[var(--shadow-elevation-1)]',
            isHub
              ? 'border-[color:var(--color-indigo-brand)] bg-[color:var(--color-indigo-a18)] text-[color:var(--color-indigo-text-soft)]'
              : 'border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] text-[color:var(--color-text-primary)] group-hover:border-[color:var(--color-indigo-a26)] group-hover:bg-[color:var(--color-indigo-a08)]',
            selected
              ? 'h-11 w-11 text-body-lg ring-2 ring-[color:var(--color-indigo-a50)] ring-offset-2 ring-offset-[color:var(--color-canvas)] shadow-[var(--shadow-elevation-1)]'
              : related
                ? 'h-9 w-9 text-body border-[color:var(--color-indigo-a32)] shadow-[var(--shadow-elevation-1)]'
                : dense
                  ? 'h-7 w-7 text-label'
                  : 'h-8.5 w-8.5 text-body',
          )}
        >
          <span
            className={cn(
              'absolute rounded-full',
              dense ? 'right-0.5 top-0.5 h-1.5 w-1.5' : 'right-1 top-1 h-2 w-2',
              statusDotClass(statusDotColor),
            )}
            aria-hidden="true"
          />
          <span aria-hidden="true">{project.icon ?? (isHub ? '◎' : '•')}</span>
        </div>
        <div
          className={cn(
            'pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 text-center transition-opacity duration-[var(--motion-base)]',
            dense ? 'w-[92px]' : 'w-[112px]',
            dimmed && !selected && !related ? 'opacity-42' : 'opacity-100',
          )}
        >
          <p
            className={cn(
              'line-clamp-2 leading-caption font-[var(--font-weight-signature)] tracking-[var(--tracking-card)]',
              selected || related ? 'text-body' : dense ? 'text-caption' : 'text-label',
              isHub
                ? 'text-[color:var(--color-indigo-accent)]'
                : selected || related
                  ? 'text-[color:var(--color-text-primary)]'
                  : 'text-[color:var(--color-text-secondary)]',
            )}
          >
            {name}
          </p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      data-testid={`topology-project-${project.slug}`}
      data-view-mode="card"
      initial={preview ? false : { opacity: 0, y: 8 }}
      animate={preview ? undefined : { opacity: dimmed ? 0.09 : 1, y: 0 }}
      transition={
        preview
          ? undefined
          : {
              opacity: { ...MOTION.base, delay: index * STAGGER },
              y: { ...MOTION.base, delay: index * STAGGER },
            }
      }
      className={cn(
        'group relative flex flex-col rounded-sheet border bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-1)] md:rounded-sheet',
        /*
         * On the map a card has **fixed dimensions**, so the grid stays regular.
         *
         * Preview is the one exception (owner, 2026-08-17: *"The card has a lot of space on either side?"* — the card has a lot of space on either side). Measured: a
         * 220px card sat inside a 260px rail leaving 40px of slack, while the
         * completeness box directly beneath used the full 260 — so the card looked
         * shrunken.
         *
         * The width fills the rail but the **true ratio (220:140 = 11:7)** is kept.
         * The caption claims this is "how it is drawn on the real map", so changing
         * the ratio would make that caption false.
         */
        preview
          ? 'aspect-[11/7] w-full px-3.5 py-3 md:px-4 md:py-3.5'
          : dense
            ? 'h-[84px] w-[156px] px-3 py-2 md:h-[92px] md:w-[168px] md:px-3 md:py-2.5'
            : 'h-[120px] w-[192px] px-3.5 py-3 md:h-[140px] md:w-[220px] md:px-4 md:py-3.5',
        preview ? '' : 'cursor-pointer active:cursor-grabbing',
        borderClass(borderStyle, isHub),
        related && !selected ? 'border-[color:var(--color-indigo-a22)]' : '',
      )}
      style={{
        backgroundImage:
          'linear-gradient(180deg, var(--color-overlay-1) 0%, var(--color-overlay-1) 100%)',
      }}
    >
      {borderStyle === 'sideLabel' && !isHub && sideLabelText && (
        <span className="absolute -left-2 top-3 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)] [writing-mode:vertical-rl]">
          {sideLabelText}
        </span>
      )}

      {isHub && (
        <span className={badgeClass({ shape: "pill", className: "absolute -top-2 left-3 bg-[color:var(--color-indigo-brand)] font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-on-accent)] md:left-4 md:text-caption" })}>
          허브
        </span>
      )}

      {!isHub && shared && (
        <span className={badgeClass({ shape: "pill", className: "absolute -top-2 left-3 border border-[color:var(--color-indigo-accent-a50)] bg-[color:var(--color-indigo-a26)] font-mono uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-indigo-text-soft)] md:left-4 md:text-caption" })}>
          공유
        </span>
      )}

      <span
        className={cn(
          'absolute right-3 top-3 h-1.5 w-1.5 rounded-full',
          statusDotClass(statusDotColor),
        )}
        aria-hidden="true"
      />

      <div className="flex items-start gap-2.5 pr-4">
        {project.icon && (
          <span
            className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-label md:h-5 md:w-5 md:text-body"
            aria-hidden="true"
          >
            {project.icon}
          </span>
        )}
        <div className="min-w-0">
          {!dense && eyebrow && (
            <div className="mb-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)] md:text-caption">
              {eyebrow}
            </div>
          )}
          {/*
            Visually an H3, but deliberately not a heading landmark: 17 topology
            nodes stamping page-level H3s makes the document outline useless to a
            screen-reader user. The whole node is already a labelled clickable
            group, so the title keeps the styling only.
          */}
          <p
            className={cn(
              dense
                ? 'text-body leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] md:text-body-lg'
                : 'text-body-lg leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] md:text-body-lg',
              isHub
                ? 'text-[color:var(--color-indigo-accent)]'
                : 'text-[color:var(--color-text-primary)]',
            )}
          >
            {name || (
              // Show the slug when the name is empty, rather than a placeholder like
              // "untitled" — the user needs at least one identifying string to tell
              // which project this is.
              <span className="font-mono text-[color:var(--color-text-quaternary)]">
                {project.slug}
              </span>
            )}
          </p>
        </div>
      </div>

      {!dense ? (
        <div className="mt-2 flex-1" data-topology-card-detail="true">
          <p className="line-clamp-2 text-caption leading-label text-[color:var(--color-text-tertiary)] md:text-label">
            {description || (
              // Keeps the card height while making the placeholder read as a state
              // rather than as a real description. The caller passes the string in
              // the screen's language (same contract as `hubEyebrow`).
              <span className="font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
                {descriptionEmptyLabel}
              </span>
            )}
          </p>
        </div>
      ) : null}

      <div
        data-topology-card-detail="true"
        className={cn(
          'flex items-center border-t border-[color:var(--color-overlay-2)]',
          dense ? 'mt-auto min-h-[14px] gap-1 pt-1.5' : 'mt-2.5 min-h-[16px] gap-1.5 pt-1.5 md:mt-3 md:min-h-[18px] md:gap-2 md:pt-2',
        )}
      >
        {!dense && visibleTags.length > 0 ? (
          visibleTags.map((tag, index) => (
            <span
              key={tag}
              className={cn(
                "font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)] md:text-caption",
                index > 0 && "hidden md:inline",
              )}
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="font-mono text-caption text-[color:var(--color-text-quaternary)] md:text-caption">
            {dense ? project.slug : fallbackMeta}
          </span>
        )}
      </div>

      <div
        className={cn(
          /*
           * No duration here (2026-08-15). The previous `--motion-base` (180ms) is
           * the **movement** ramp, but both triggers for this ring report a state
           * that has already happened — hover (`group-hover:opacity-40`) and
           * `selected`. Both belong to the `--motion-fast` (120ms) budget, which is
           * what Tailwind's default transition already provides.
           */
          'pointer-events-none absolute inset-0 rounded-sheet border border-[color:var(--color-indigo-accent)] transition-opacity md:rounded-sheet',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
        )}
        aria-hidden
      />
    </motion.div>
  );
}
