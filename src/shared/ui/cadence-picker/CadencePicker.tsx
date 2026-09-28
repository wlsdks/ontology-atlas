"use client";

import { useCallback, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { cn } from "@/shared/lib/cn";
import { controlClass, fieldLabel } from "@/shared/ui/control-class";
import { Input } from "@/shared/ui/input";
import { SegmentedControl } from "@/shared/ui/segmented-control";

import {
  HOUR_DETENTS,
  MINUTE_DETENTS,
  detentForMinutes,
  detentRatio,
  nearestDetent,
  stepDetent,
} from "./detents";

/**
 * "How often" as one draggable rail with detents
 * (`docs/specs/2026-09-21-round-cadence-and-scope.md` §2.2). Every word arrives
 * through `labels`, so the messages stay in `messages/{en,ko}.json`. Pointer capture keeps a
 * drag working off the rail; the nearest detent is reported while dragging, and release springs
 * the thumb onto it (`--motion-ease-drag-release`). The thumb is a `role="slider"` with a 44px
 * hit area, and every detent label is a button.
 */

export type CadenceUnit = "minutes" | "hours" | "day";

interface CadencePickerLabels {
  legend: string;
  unitMinutes: string;
  unitHours: string;
  unitDay: string;
  /** The short number under a tick: "5" for five minutes, "2" for two hours. */
  detent: (minutes: number) => string;
  /** What a screen reader hears: "every 5 minutes". */
  valueText: (minutes: number) => string;
  railAria: string;
  daily: string;
  weekdays: string;
  time: string;
  dayAria: string;
  /** Shown under the time field when it is not `HH:MM`. */
  timeError: string;
}

interface CadencePickerProps {
  unit: CadenceUnit;
  onUnitChange: (unit: CadenceUnit) => void;
  /** Ignored while the unit is `day`; `null` before one is chosen. */
  minutes: number | null;
  onMinutesChange: (minutes: number) => void;
  daily: string;
  weekdaysOnly: boolean;
  onDayChange: (next: { daily: string; weekdaysOnly: boolean }) => void;
  /** `false` draws the time field's error line; the caller owns the rule. */
  timeValid?: boolean;
  labels: CadencePickerLabels;
  testId?: string;
  className?: string;
}

function detentsForUnit(unit: CadenceUnit): readonly number[] {
  return unit === "hours" ? HOUR_DETENTS : MINUTE_DETENTS;
}

export function CadencePicker({
  unit,
  onUnitChange,
  minutes,
  onMinutesChange,
  daily,
  weekdaysOnly,
  onDayChange,
  timeValid = true,
  labels,
  testId = "cadence-picker",
  className,
}: CadencePickerProps) {
  const legendId = useId();
  const trackRef = useRef<HTMLDivElement | null>(null);
  /** The finger position (0..1) while down; the thumb follows it without snapping. */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const detents = detentsForUnit(unit);
  const index = detentForMinutes(unit === "day" ? null : minutes, detents);
  const settledRatio = detentRatio(index, detents.length);
  const ratio = dragRatio ?? settledRatio;
  const travel = dragRatio === null ? "transition-transform motion-reduce:transition-none" : "transition-none";
  const travelTiming =
    dragRatio === null
      ? { transitionDuration: "var(--motion-settle)", transitionTimingFunction: "var(--motion-ease-drag-release)" }
      : {};

  const applyFromPointer = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const x = clientX - rect.left;
      setDragRatio(Math.min(1, Math.max(0, rect.width > 0 ? x / rect.width : 0)));
      const next = detentsForUnit(unit)[nearestDetent(x, rect.width, detentsForUnit(unit))];
      if (next !== undefined && next !== minutes) onMinutesChange(next);
    },
    [minutes, onMinutesChange, unit],
  );

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    applyFromPointer(event.clientX);
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRatio === null) return;
    applyFromPointer(event.clientX);
  };

  const endDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRatio === null) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // Releasing starts the spring from the finger's position to the reported detent.
    setDragRatio(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : event.key === "Home"
            ? -Infinity
            : event.key === "End"
              ? Infinity
              : null;
    if (delta === null) return;
    event.preventDefault();
    const next = detents[stepDetent(index, delta, detents.length)];
    if (next !== undefined && next !== minutes) onMinutesChange(next);
  };

  const changeUnit = (next: CadenceUnit) => {
    if (next === unit) return;
    if (next !== "day") {
      const carried = unit === "day" ? null : minutes;
      const landing = detentsForUnit(next)[detentForMinutes(carried, detentsForUnit(next))];
      if (landing !== undefined) onMinutesChange(landing);
    }
    setDragRatio(null);
    onUnitChange(next);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid={testId} data-cadence-unit={unit}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p id={legendId} className={fieldLabel()}>{labels.legend}</p>
        <span aria-hidden className="text-body font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
          {unit === "day" ? `${weekdaysOnly ? labels.weekdays : labels.daily} ${daily}` : labels.valueText(detents[index] ?? detents[0])}
        </span>
      </div>
      {/* Compact and joined: the unit frames the rail rather than competing with it. */}
      <SegmentedControl<CadenceUnit>
        labelledBy={legendId}
        value={unit}
        onChange={changeUnit}
        size="md"
        fill
        testId={`${testId}-unit`}
        options={[
          { value: "minutes", label: labels.unitMinutes },
          { value: "hours", label: labels.unitHours },
          { value: "day", label: labels.unitDay },
        ]}
      />

      {unit === "day" ? (
        <div className="mt-1 flex flex-col gap-2">
          <SegmentedControl<boolean>
            ariaLabel={labels.dayAria}
            value={weekdaysOnly}
            onChange={(next) => onDayChange({ daily, weekdaysOnly: next })}
            variant="chips"
            fill
            testId={`${testId}-day`}
            options={[
              { value: false, label: labels.daily },
              { value: true, label: labels.weekdays },
            ]}
          />
          <Input
            label={labels.time}
            type="time"
            value={daily}
            onChange={(event) => onDayChange({ daily: event.target.value, weekdaysOnly })}
            className="w-32"
            data-testid="library-rounds-time"
            error={timeValid ? undefined : labels.timeError}
          />
        </div>
      ) : (
        <div className="mt-1 px-6">
          {/* A 44px hit region over a 4px track: the whole rail is the touch floor. */}
          <div
            ref={trackRef}
            data-testid={`${testId}-rail`}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="@container relative flex h-11 w-full touch-none select-none items-center"
          >
            <span aria-hidden className="absolute inset-x-0 h-1 overflow-hidden rounded-full bg-[color:var(--color-overlay-2)]">
              <span
                data-testid={`${testId}-fill`}
                className={cn("absolute inset-0 origin-left bg-[color:var(--color-indigo-a66)]", travel)}
                style={{ transform: `scaleX(${ratio})`, ...travelTiming }}
              />
            </span>
            {detents.map((value, tick) => (
              <span
                key={value}
                aria-hidden
                data-cadence-tick={value}
                className={cn(
                  "absolute h-2 w-px -translate-x-1/2 rounded-full",
                  tick === index ? "bg-[color:var(--color-indigo-text-soft)]" : "bg-[color:var(--color-border-soft)]",
                )}
                style={{ left: `${detentRatio(tick, detents.length) * 100}%` }}
              />
            ))}
            <button
              type="button"
              role="slider"
              aria-label={labels.railAria}
              aria-valuemin={0}
              aria-valuemax={detents.length - 1}
              aria-valuenow={index}
              aria-valuetext={labels.valueText(detents[index] ?? detents[0])}
              onKeyDown={onKeyDown}
              data-testid={`${testId}-thumb`}
              data-cadence-dragging={dragRatio === null ? undefined : "true"}
              /* A 44px touch floor over a 4px track is this control's own shape. */
              className={controlClass({
                shape: "icon",
                size: "lg",
                className: cn(
                  "absolute left-0 grid h-11 w-11 -translate-x-1/2 place-items-center rounded-full",
                  travel,
                ),
              })}
              style={{ transform: `translateX(calc(${ratio} * 100cqw))`, ...travelTiming }}
            >
              <span
                aria-hidden
                className={cn(
                  "h-4 w-4 rounded-full border border-[color:var(--color-indigo-a66)] bg-[color:var(--color-indigo-brand)]",
                  dragRatio === null ? undefined : "border-[color:var(--color-indigo-text-soft)]",
                )}
              />
            </button>
          </div>
          {/* Labels crossfade on a unit change (`key`); reduced motion simply swaps them. */}
          <div
            key={unit}
            data-testid={`${testId}-detents`}
            className="relative mt-0.5 h-5 motion-safe:animate-[atlasStatusIn_var(--motion-base)_var(--motion-ease)_both]"
          >
            {detents.map((value, tick) => (
              <button
                key={value}
                type="button"
                onClick={() => onMinutesChange(value)}
                data-cadence-detent={value}
                aria-pressed={tick === index}
                className={controlClass({
                  shape: "chip",
                  size: "xs",
                  hoverInk: "strong",
                  className: cn(
                    "absolute top-0 min-h-0 -translate-x-1/2 border-transparent px-1 text-label leading-label tabular-nums",
                    tick === index
                      ? "font-[var(--font-weight-strong)] text-[color:var(--color-indigo-text-soft)]"
                      : "text-[color:var(--color-text-quaternary)]",
                  ),
                })}
                style={{ left: `${detentRatio(tick, detents.length) * 100}%` }}
              >
                {labels.detent(value)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
