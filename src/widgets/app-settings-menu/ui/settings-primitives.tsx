import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { controlClass } from '@/shared/ui/control-class';
import { Chip } from '@/shared/ui/controls';
import { buildRouteFocusHref } from '@/shared/ui/route-focus-manager';
import { SegmentedControl } from '@/shared/ui/segmented-control';
import { VendorMark } from '@/shared/ui/vendor-mark';
import type { SettingId } from '../model/catalog/types';


export const DETAIL_TOGGLE_CHIP =
  'justify-self-start border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)]';

export const RESET_LINK_INK = 'justify-self-start hover:text-[color:var(--color-text-primary)]';

export const SETTINGS_SECTION_LABEL =
  'font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]';

export function SettingsPaneHead({
  title,
  description,
  testId,
}: {
  title: string;
  description: string;
  testId?: string;
}) {
  return (
    <header className="grid min-w-0 gap-1 border-x border-transparent px-3" data-testid={testId}>
      <h3 className="text-title font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]">
        {title}
      </h3>
      <p className="max-w-[var(--git-setup-measure)] text-body leading-body text-balance text-[color:var(--color-text-tertiary)]">
        {description}
      </p>
    </header>
  );
}

export function SettingsGroupHeading({
  label,
  trailing,
  id,
}: {
  label: ReactNode;
  trailing?: ReactNode;
  id?: string;
}) {
  return (
    <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <h3 id={id} className={SETTINGS_SECTION_LABEL}>
        {label}
      </h3>
      {trailing ? <div className="flex items-center gap-2">{trailing}</div> : null}
    </div>
  );
}

export function SettingsGroup({
  label,
  trailing,
  children,
  testId,
}: {
  label?: string;
  trailing?: ReactNode;
  children: ReactNode;
  testId?: string;
}) {
  return (
    <section aria-label={label} className="min-w-0" data-testid={testId}>
      {label ? <SettingsGroupHeading label={label} trailing={trailing} /> : null}
      <div className={`${label ? 'mt-1.5 ' : ''}divide-y divide-[color:var(--color-divider)] overflow-hidden rounded-card border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)]`}>
        {children}
      </div>
    </section>
  );
}


function monogramOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => Array.from(word)[0]?.toUpperCase() ?? '')
    .join('');
}

export function ProductMark({
  icon,
  ink,
  monogram,
}: {
  icon?: string | null;
  ink?: string | null;
  monogram?: string;
}) {
  return (
    <span className="relative flex shrink-0">
      <VendorMark src={icon ?? null} ink={ink ?? null} />
      {!icon && monogram ? (
        <span
          aria-hidden
          data-vendor-mark="monogram"
          className="absolute inset-0 flex items-center justify-center text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]"
        >
          {monogramOf(monogram)}
        </span>
      ) : null}
    </span>
  );
}

export function SettingsRow({
  label,
  caption,
  captionTone = 'neutral',
  control,
  testId,
  icon,
  iconInk,
  monogram,
  settingId,
}: {
  label: string;
  caption?: string;
  captionTone?: 'neutral' | 'warning' | 'danger';
  control: ReactNode;
  testId?: string;
  icon?: string | null;
  iconInk?: string | null;
  monogram?: string;
  settingId?: SettingId;
}) {
  const hasMarkSlot = icon !== undefined;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2 px-3',
        hasMarkSlot ? 'min-h-16 py-2.5' : 'min-h-12 py-2',
      )}
      data-testid={testId}
      data-setting-id={settingId}
    >
      {hasMarkSlot ? <ProductMark icon={icon} ink={iconInk} monogram={monogram} /> : null}
      <div className="min-w-0 flex-1 basis-40">
        <p className="text-body text-[color:var(--color-text-primary)]">{label}</p>
        {caption ? (
          <p
            className={cn(
              'mt-0.5 break-keep text-label leading-label [overflow-wrap:anywhere]',
              captionTone === 'danger'
                ? 'text-[color:var(--color-status-danger)]'
                : captionTone === 'warning'
                  ? 'text-[color:var(--color-status-warning)]'
                  : 'text-[color:var(--color-text-tertiary)]',
            )}
          >
            {caption}
          </p>
        ) : null}
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">{control}</div>
    </div>
  );
}

export function Slider({
  label,
  value,
  range,
  format,
  onChange,
  testId,
  settingId,
}: {
  label: string;
  value: number;
  range: { min: number; max: number; step: number };
  format: (v: number) => string;
  onChange: (v: number) => void;
  testId: string;
  settingId?: SettingId;
}) {
  const filled = ((value - range.min) / (range.max - range.min)) * 100;
  return (
    <label className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-1 py-2 sm:flex" data-setting-id={settingId}>
      <span className="col-span-2 shrink-0 text-body text-[color:var(--color-text-primary)] sm:w-28">{label}</span>
      <input
        type="range"
        data-testid={testId}
        min={range.min}
        max={range.max}
        step={range.step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, var(--color-indigo-accent) ${filled}%, var(--color-overlay-3) ${filled}%)`,
        }}
        className="h-1 w-full min-w-0 flex-1 cursor-pointer appearance-none rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] sm:w-auto [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[color:var(--color-indigo-accent)]"
      />
      <span className="w-12 shrink-0 text-right font-mono text-label text-[color:var(--color-text-tertiary)]">
        {format(value)}
      </span>
    </label>
  );
}

export function Choice<T extends string | boolean>({
  label,
  value,
  options,
  onChange,
  testId,
  optionTestId,
  settingId,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
  optionTestId?: (value: T) => string;
  settingId?: SettingId;
}) {
  return (
    <div className="flex min-h-11 flex-col items-stretch gap-3 px-1 py-2 sm:flex-row sm:items-center" data-setting-id={settingId}>
      <span className="shrink-0 text-body text-[color:var(--color-text-primary)] sm:w-28">{label}</span>
      <SegmentedControl
        ariaLabel={label}
        value={value}
        onChange={onChange}
        options={options.map((option) => ({
          value: option.value,
          label: option.label,
          testId: optionTestId?.(option.value),
        }))}
        testId={testId}
      />
    </div>
  );
}

export function SegmentSwitch({
  ariaLabel,
  value,
  options,
  onChange,
  testId,
}: {
  ariaLabel: string;
  value: boolean;
  options: ReadonlyArray<{ value: boolean; label: string }>;
  onChange: (next: boolean) => void;
  testId?: string;
}) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      onChange={onChange}
      options={options}
      testId={testId}
    />
  );
}

const ARM_MS = 3000;
const CONFIRM_GUARD_MS = 400;

export function SettingsDoorRow({
  settingId,
  label,
  caption,
  icon: Icon,
  href,
  onLeave,
  testId,
}: {
  settingId: SettingId;
  label: string;
  caption?: string;
  icon?: ComponentType<{ size?: number; className?: string; 'aria-hidden'?: boolean }>;
  href: string;
  onLeave: () => void;
  testId?: string;
}) {
  const router = useRouter();
  return (
    <button
      type="button"
      data-setting-id={settingId}
      data-testid={testId}
      onClick={() => {
        onLeave();
        router.push(buildRouteFocusHref(href));
      }}
      className={controlClass({
        shape: 'row',
        size: 'md',
        tone: 'muted',
        hoverInk: 'strong',
        hoverSurface: 'lift',
        className: 'min-h-12 gap-3 px-3 py-2',
      })}
    >
      {Icon ? <Icon size={16} aria-hidden className="shrink-0" /> : null}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-body text-[color:var(--color-text-primary)]">{label}</span>
        {caption ? (
          <span className="mt-0.5 block text-label leading-label text-[color:var(--color-text-tertiary)] [overflow-wrap:anywhere]">
            {caption}
          </span>
        ) : null}
      </span>
      <ChevronRight size={16} aria-hidden className="shrink-0 text-[color:var(--color-text-quaternary)]" />
    </button>
  );
}

export function ArmedChip({
  label,
  armedLabel,
  onConfirm,
  testId,
  ariaLabel,
}: {
  label: string;
  armedLabel: string;
  onConfirm: () => void | Promise<void>;
  testId: string;
  ariaLabel?: string;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | null>(null);
  const armedAt = useRef(0);
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <Chip
      size="lg"
      tone={armed ? 'danger' : 'secondary'}
      hoverInk={armed ? 'none' : 'strong'}
      hoverBorder={armed ? 'none' : 'strong'}
      data-testid={testId}
      aria-label={ariaLabel ? `${ariaLabel} · ${armed ? armedLabel : label}` : undefined}
      onClick={() => {
        if (!armed) {
          armedAt.current = Date.now();
          setArmed(true);
          timer.current = window.setTimeout(() => setArmed(false), ARM_MS);
          return;
        }
        if (Date.now() - armedAt.current < CONFIRM_GUARD_MS) return;
        if (timer.current !== null) window.clearTimeout(timer.current);
        setArmed(false);
        void onConfirm();
      }}
      className={cn(
        'shrink-0 border-[color:var(--color-border-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset',
        armed ? 'border-[color:var(--color-danger-a32)] hover:bg-[color:var(--color-danger-a10)]' : null,
      )}
    >
      {armed ? armedLabel : label}
    </Chip>
  );
}
