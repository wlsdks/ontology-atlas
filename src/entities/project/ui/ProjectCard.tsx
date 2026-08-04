import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/cn';
import { MOTION, STAGGER } from '@/shared/motion';
import type { Project } from '../model/types';

/**
 * 동적 카테고리 메타 — ProjectCard는 Category 엔티티 전체를 몰라도 되도록
 * 필요한 정보만 별도 타입으로 받는다. 호출자가 Category → CardCategoryMeta로
 * 매핑해서 전달.
 */
export interface CardCategoryMeta {
  borderStyle: 'underline' | 'dashed' | 'sideLabel' | 'solid';
  /** sideLabel 스타일에서 좌측 세로 텍스트. */
  sideLabelText?: string;
}

/** 상태 dot preset 색. entities/status의 StatusDotColor와 동일. */
export type CardStatusDotColor = 'success' | 'warning' | 'paused' | 'neutral';
export type ProjectCardViewMode = 'card' | 'compact';

interface Props {
  project: Project;
  /** 카테고리 메타 — 미지정 시 solid 기본. */
  category?: CardCategoryMeta;
  /** 상태 dot 색 — 미지정 시 neutral. */
  statusDotColor?: CardStatusDotColor;
  /** 토폴로지 배경에서 어두워지는 상태. 프리뷰에서는 미사용. */
  dimmed?: boolean;
  /** 선택 표시 — 인디고 outline. */
  selected?: boolean;
  /** 두 허브 이상 의존 시 SHARED 배지. */
  shared?: boolean;
  /** 선택한 프로젝트와 직접 연결된 항목인지. */
  related?: boolean;
  /** 초기 staggered fade-in delay 계산용. 프리뷰에서는 0. */
  index?: number;
  /** 대형 그래프에서 정보 밀도를 낮춘다. */
  dense?: boolean;
  /** 프리뷰 모드: pointer cursor 제거, motion 전환 스킵. */
  preview?: boolean;
  /** isHub 가 true 일 때 카드 상단 eyebrow 텍스트. caller 가 i18n 결과를
   *  넘긴다. 미지정 시 영문 'Core hub' (primitive 영문 default 패턴). */
  hubEyebrow?: string;
  /** shared 가 true 일 때 eyebrow 텍스트. 미지정 시 영문 'Shared system'. */
  sharedEyebrow?: string;
  /** 설명이 비었을 때의 자리 표시 문구. 미지정 시 영문 'No description'. */
  descriptionEmptyLabel?: string;
  /** 공개 지도 보기 방식. */
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
    case 'underline':
      return 'border-t-[color:var(--color-border-soft)] border-x-[color:var(--color-border-soft)] border-b-[color:var(--color-indigo-brand)] border-t border-x border-b-2';
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
 * 프로젝트 카드의 순수 비주얼. 특정 그래프 렌더러에 의존하지 않는다.
 * admin 프리뷰와 카드형 표현이 동일한 렌더링을 공유하도록 분리됐다.
 * 카테고리·상태 메타는 외부에서 lookup해 props로 주입한다 (하드코딩 제거).
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
  // R15 — vault frontmatter isHub 명시 안 했으면 undefined → false 로 취급.
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
              selected || related ? 'text-[12px]' : dense ? 'text-[10px]' : 'text-[11px]',
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
        'group relative flex flex-col rounded-[16px] border bg-[color:var(--color-panel)] shadow-[var(--shadow-elevation-1)] md:rounded-[18px]',
        dense
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
        <span className="absolute -left-2 top-3 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] [writing-mode:vertical-rl]">
          {sideLabelText}
        </span>
      )}

      {isHub && (
        <span className="absolute -top-2 left-3 rounded-full bg-[color:var(--color-indigo-brand)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[color:var(--color-text-primary)] md:left-4 md:text-[9px]">
          허브
        </span>
      )}

      {!isHub && shared && (
        <span className="absolute -top-2 left-3 rounded-full border border-[color:var(--color-indigo-accent-a50)] bg-[color:var(--color-indigo-a26)] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-[color:var(--color-indigo-text-soft)] md:left-4 md:text-[9px]">
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
            className="mt-0.5 inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] text-[11px] md:h-5 md:w-5 md:text-[12px]"
            aria-hidden="true"
          >
            {project.icon}
          </span>
        )}
        <div className="min-w-0">
          {!dense && eyebrow && (
            <div className="mb-1 font-mono text-[8px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)] md:text-[9px]">
              {eyebrow}
            </div>
          )}
          {/*
            시각적으로는 H3 급이지만 실제 heading landmark 로는 쓰지 않는다.
            토폴로지 17개 노드가 페이지 H3 를 도배하면 스크린리더 사용자가
            문서 구조를 훑기 어려워짐. 노드 전체는 이미 클릭 가능한
            group 으로 라벨되므로 타이틀은 시각 styling 만 유지.
          */}
          <p
            className={cn(
              dense
                ? 'text-[13px] leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] md:text-body-lg'
                : 'text-body-lg leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-card)] md:text-[15px]',
              isHub
                ? 'text-[color:var(--color-indigo-accent)]'
                : 'text-[color:var(--color-text-primary)]',
            )}
          >
            {name || (
              // name이 비면 slug를 보여준다 — "이름 없음" 같은 placeholder 대신
              // 최소 한 번이라도 식별 정보가 있어 사용자가 어떤 프로젝트인지 알 수
              // 있도록.
              <span className="font-mono text-[color:var(--color-text-quaternary)]">
                {project.slug}
              </span>
            )}
          </p>
        </div>
      </div>

      {!dense ? (
        <div className="mt-2 flex-1" data-topology-card-detail="true">
          <p className="line-clamp-2 text-[10px] leading-label text-[color:var(--color-text-tertiary)] md:text-[11px]">
            {description || (
              // 카드 높이를 유지하되 placeholder 문장이 실제 설명으로 읽히지 않도록
              // 형식·톤을 약하게 해 "설명이 비었다" 는 상태임을 명시한다.
              // 문구는 호출자가 화면 언어로 넘긴다 (hubEyebrow 와 같은 계약).
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
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
                "font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] md:text-[9px]",
                index > 0 && "hidden md:inline",
              )}
            >
              {tag}
            </span>
          ))
        ) : (
          <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)] md:text-[9px]">
            {dense ? project.slug : fallbackMeta}
          </span>
        )}
      </div>

      <div
        className={cn(
          'pointer-events-none absolute inset-0 rounded-[16px] border border-[color:var(--color-indigo-accent)] transition-opacity duration-[var(--motion-base)] md:rounded-[18px]',
          selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
        )}
        aria-hidden
      />
    </motion.div>
  );
}
