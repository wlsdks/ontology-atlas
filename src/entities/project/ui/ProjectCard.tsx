import { motion } from 'framer-motion';
import { badgeClass } from "@/shared/ui/badge-class";
import { cn } from '@/shared/lib/cn';
import { MOTION, OVERLAY_RISE, STAGGER } from '@/shared/motion';
import type { Project } from '../model/types';

/** The category facts a card needs; callers map `Category` → `CardCategoryMeta`. */
export interface CardCategoryMeta {
  borderStyle: 'underline' | 'dashed' | 'sideLabel' | 'solid';
  /** Vertical text on the left, for the `sideLabel` style. */
  sideLabelText?: string;
}

/** Same set as `StatusDotColor` in entities/status. */
export type CardStatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';
type ProjectCardViewMode = 'card' | 'compact';

interface Props {
  project: Project;
  /** Defaults to `solid`. */
  category?: CardCategoryMeta;
  /** Defaults to `neutral`. */
  statusDotColor?: CardStatusDotColor;
  /** Dimmed against the topology background. */
  dimmed?: boolean;
  selected?: boolean;
  /** Shown when the project depends on two or more hubs. */
  shared?: boolean;
  /** Whether this is directly connected to the selected project. */
  related?: boolean;
  /** Staggers the initial fade-in. */
  index?: number;
  /** Lowers information density on large graphs. */
  dense?: boolean;
  /** No pointer cursor or motion. */
  preview?: boolean;
  /** Translated eyebrow when `isHub`; defaults to 'Core hub'. */
  hubEyebrow?: string;
  /** Defaults to 'Shared system'. */
  sharedEyebrow?: string;
  /** Defaults to 'No description'. */
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
    /* Plain border: the category is stated by the side label and list marks, not an underline. */
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

/** Renderer-independent card visuals; category and status meta come from the caller. */
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
  // A missing `isHub` reads as false.
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
        initial={preview ? false : OVERLAY_RISE}
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
      initial={preview ? false : OVERLAY_RISE}
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
        /* Fixed size on the map; preview fills the rail but keeps the 11:7 ratio its caption claims. */
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
          {/* Styled as H3 but not a heading: many nodes would flood the screen-reader outline. */}
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
              // An empty name shows the slug so the project stays identifiable.
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
              // Keeps card height; the caller passes the placeholder in the screen's language.
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
          /* No duration: hover and selection report settled state, so the default fast transition applies. */
          'pointer-events-none absolute inset-0 rounded-sheet border border-[color:var(--color-indigo-accent)] transition-opacity md:rounded-sheet',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
        )}
        aria-hidden
      />
    </motion.div>
  );
}
