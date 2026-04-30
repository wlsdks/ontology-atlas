'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { INDIGO_ACCENT, INDIGO_HOVER } from '@/shared/config/indigo-tokens';
import type { Category } from '@/entities/category';
import type { Project } from '@/entities/project';
import type { CategoryDraft } from './category-draft';
import { applyDraftToCategories, DRAFT_CATEGORY_ID } from './category-draft';

type DragMode = 'move' | 'resize';

type DragState = {
  id: string;
  mode: DragMode;
  pointerId: number;
  offsetX: number;
  offsetY: number;
};

type ViewBox = {
  minX: number;
  minY: number;
  width: number;
  height: number;
};

interface Props {
  categories: Category[];
  draft: CategoryDraft;
  selectedId: string | null;
  projects: Project[];
  onSelectCategory: (id: string) => void;
  onDraftChange: (next: CategoryDraft) => void;
}

const WORLD_PADDING = 220;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;

function buildViewBox(categories: Category[]): ViewBox {
  if (categories.length === 0) {
    return { minX: -1200, minY: -900, width: 2400, height: 1800 };
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const category of categories) {
    minX = Math.min(minX, category.position.x - category.size.width / 2);
    minY = Math.min(minY, category.position.y - category.size.height / 2);
    maxX = Math.max(maxX, category.position.x + category.size.width / 2);
    maxY = Math.max(maxY, category.position.y + category.size.height / 2);
  }

  return {
    minX: minX - WORLD_PADDING,
    minY: minY - WORLD_PADDING,
    width: maxX - minX + WORLD_PADDING * 2,
    height: maxY - minY + WORLD_PADDING * 2,
  };
}

function projectDotColor(project: Project, selectedId: string | null) {
  if (project.category === selectedId) return INDIGO_HOVER;
  return project.isHub ? INDIGO_ACCENT : 'var(--color-text-quaternary)';
}

function readWorldPoint(svg: SVGSVGElement | null, viewBox: ViewBox, clientX: number, clientY: number) {
  if (!svg) return null;

  const rect = svg.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;

  return {
    x: viewBox.minX + ((clientX - rect.left) / rect.width) * viewBox.width,
    y: viewBox.minY + ((clientY - rect.top) / rect.height) * viewBox.height,
  };
}

export function CategoryCanvasEditor({
  categories,
  draft,
  selectedId,
  projects,
  onSelectCategory,
  onDraftChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const persistedIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);

  const previewCategories = useMemo(
    () => applyDraftToCategories(categories, selectedId, draft),
    [categories, draft, selectedId],
  );
  const activePreviewId = selectedId ?? (draft.id.trim() || DRAFT_CATEGORY_ID);
  const selectedPreview = useMemo(
    () => previewCategories.find((category) => category.id === activePreviewId) ?? null,
    [activePreviewId, previewCategories],
  );
  const viewBox = useMemo(() => buildViewBox(previewCategories), [previewCategories]);

  useEffect(() => {
    if (!dragState) return;
    const state = dragState;

    function handlePointerMove(event: PointerEvent) {
      if (event.pointerId !== state.pointerId || !selectedPreview) return;
      const point = readWorldPoint(svgRef.current, viewBox, event.clientX, event.clientY);
      if (!point) return;

      if (state.mode === 'move') {
        const nextX = Math.round(point.x - state.offsetX);
        const nextY = Math.round(point.y - state.offsetY);
        onDraftChange({
          ...draft,
          positionX: String(nextX),
          positionY: String(nextY),
        });
        return;
      }

      const halfWidth = Math.max(MIN_WIDTH / 2, point.x - selectedPreview.position.x + state.offsetX);
      const halfHeight = Math.max(MIN_HEIGHT / 2, point.y - selectedPreview.position.y + state.offsetY);
      const width = Math.round(halfWidth * 2);
      const height = Math.round(halfHeight * 2);
      const radius = Math.max(160, Math.round(Math.min(width, height) * 0.35));

      onDraftChange({
        ...draft,
        width: String(width),
        height: String(height),
        radius: String(radius),
      });
    }

    function handlePointerUp(event: PointerEvent) {
      if (event.pointerId !== state.pointerId) return;
      setDragState(null);
    }

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [draft, dragState, onDraftChange, selectedPreview, viewBox]);

  return (
    <div className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            Visual Editor
          </p>
          <p className="mt-1 text-sm text-[color:var(--color-text-tertiary)]">
            클러스터 박스를 드래그해 중심을 옮기고, 우하단 핸들로 크기를 조정하세요.
          </p>
        </div>
        {selectedPreview && (
          <div className="text-right">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
              {selectedPreview.id === DRAFT_CATEGORY_ID ? 'new-category' : selectedPreview.id}
            </p>
            <p className="mt-1 text-sm text-[color:var(--color-text-secondary)]">
              x {selectedPreview.position.x} / y {selectedPreview.position.y}
            </p>
          </div>
        )}
      </div>

      <svg
        ref={svgRef}
        viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        className="h-[420px] w-full rounded-lg border border-[color:var(--color-overlay-2)] bg-[color:var(--color-canvas)]"
      >
        <rect
          x={viewBox.minX}
          y={viewBox.minY}
          width={viewBox.width}
          height={viewBox.height}
          fill="var(--color-canvas)"
        />

        {previewCategories.map((category) => {
          const x = category.position.x - category.size.width / 2;
          const y = category.position.y - category.size.height / 2;
          const isSelected = category.id === activePreviewId;
          const isPersisted = persistedIds.has(category.id);
          const handleX = x + category.size.width;
          const handleY = y + category.size.height;

          return (
            <g key={category.id}>
              <rect
                data-testid={`category-preview-${category.id}`}
                x={x}
                y={y}
                width={category.size.width}
                height={category.size.height}
                rx={Math.min(32, category.radius / 6)}
                fill={isSelected ? 'rgba(94,106,210,0.15)' : 'var(--color-overlay-1)'}
                stroke={isSelected ? INDIGO_HOVER : 'var(--color-border-strong)'}
                strokeDasharray={category.borderStyle === 'dashed' ? '12 10' : undefined}
                strokeWidth={isSelected ? 6 : 4}
                onClick={() => {
                  if (isPersisted) onSelectCategory(category.id);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                  if (isPersisted) onSelectCategory(category.id);
                  const point = readWorldPoint(svgRef.current, viewBox, event.clientX, event.clientY);
                  if (!point) return;
                  setDragState({
                    id: category.id,
                    mode: 'move',
                    pointerId: event.pointerId,
                    offsetX: point.x - category.position.x,
                    offsetY: point.y - category.position.y,
                  });
                }}
                className="cursor-move"
              />

              <text
                x={x + 28}
                y={y + 44}
                fill="var(--color-text-primary)"
                fontSize="42"
                fontFamily="Inter, sans-serif"
                fontWeight={600}
              >
                {category.label}
              </text>
              <text
                x={x + 28}
                y={y + 76}
                fill="var(--color-text-quaternary)"
                fontSize="20"
                fontFamily="JetBrains Mono, monospace"
              >
                {category.labelEn ?? category.id}
              </text>

              {isSelected && (
                <>
                  <circle
                    data-testid={`category-resize-${category.id}`}
                    cx={handleX}
                    cy={handleY}
                    r={18}
                    fill={INDIGO_ACCENT}
                    stroke="var(--color-canvas)"
                    strokeWidth={6}
                    className="cursor-se-resize"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      const point = readWorldPoint(svgRef.current, viewBox, event.clientX, event.clientY);
                      if (!point) return;
                      setDragState({
                        id: category.id,
                        mode: 'resize',
                        pointerId: event.pointerId,
                        offsetX: handleX - point.x,
                        offsetY: handleY - point.y,
                      });
                    }}
                  />
                  <text
                    x={x + category.size.width - 24}
                    y={y + category.size.height - 22}
                    textAnchor="end"
                    fill="var(--color-text-tertiary)"
                    fontSize="16"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    {category.size.width} × {category.size.height}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {projects.map((project) => (
          <circle
            key={project.slug}
            cx={project.position.x + 110}
            cy={project.position.y + 70}
            r={project.isHub ? 9 : 6}
            fill={projectDotColor(project, selectedId)}
            opacity={selectedId && project.category === selectedId ? 1 : 0.65}
          />
        ))}
      </svg>
    </div>
  );
}
