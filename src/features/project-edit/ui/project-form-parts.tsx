import type {
  InputHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown } from "lucide-react";

import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { fieldClass } from "@/shared/ui/control-class";
import { cn } from "@/shared/lib/cn";
import { controlClass } from "@/shared/ui";

/** The create screen's "add more" section: a hairline, not a box, expanded by the user. */
export function CreateExtras({
  open,
  onToggle,
  label,
  caption,
  openLabel,
  closeLabel,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  label: string;
  caption: string;
  openLabel: string;
  closeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-[color:var(--color-divider)] pt-5">
      <button
        type="button"
        data-testid="project-create-extras-toggle"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls="project-create-extras"
        className={controlClass({
          shape: "row",
          stacked: true,
          className: "justify-between gap-3",
        })}
      >
        <span className="min-w-0">
          <span className="block text-body-lg text-[color:var(--color-text-primary)]">{label}</span>
          <span className="mt-1 block text-label text-[color:var(--color-text-quaternary)]">
            {caption}
          </span>
        </span>
        <span className="inline-flex h-8 shrink-0 items-center gap-2 rounded-full border border-[color:var(--color-divider)] px-3 text-body text-[color:var(--color-text-secondary)]">
          {open ? closeLabel : openLabel}
          <ChevronDown
            size={ICON_SIZE.md}
            aria-hidden="true"
            className={cn("transition-transform", open && "rotate-180")}
          />
        </span>
      </button>
      {open ? (
        <div
          id="project-create-extras"
          className="mt-5 flex flex-col gap-6 border-t border-[color:var(--color-divider)] pt-5"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** A subgroup inside "add more" — engraved label plus a hairline, no collapse control. */
export function ExtrasGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2.5">
        <p className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]">
          {label}
        </p>
        <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
      </div>
      {children}
    </div>
  );
}

export function FieldRow({
  label,
  error,
  errorTestId,
  fieldId,
  children,
}: {
  label: string;
  error?: string;
  errorTestId?: string;
  fieldId?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={fieldId}
        className="font-mono text-caption uppercase tracking-[var(--tracking-caps-12)] text-[color:var(--color-text-quaternary)]"
      >
        {label}
      </label>
      {children}
      {error && (
        <p
          role="alert"
          data-testid={errorTestId}
          className="text-body text-[color:var(--color-status-danger)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function FormSection({
  id,
  label,
  description,
  isOpen = true,
  onToggle,
  collapsible = true,
  helperBadge,
  collapseLabel,
  expandLabel,
  children,
}: {
  id: string;
  label: string;
  description: string;
  isOpen?: boolean;
  onToggle?: () => void;
  collapsible?: boolean;
  helperBadge?: string;
  collapseLabel?: string;
  expandLabel?: string;
  children: React.ReactNode;
}) {
  const contentId = `${id}-content`;
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className="scroll-mt-28 rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-5 shadow-[inset_0_1px_0_var(--color-overlay-2)] md:px-5"
    >
      <div className="mb-5">
        {/* engraved section label — mono uppercase caption + hairline
            continuation (docs/prototypes/project-forms-final.html `.slabel`) */}
        <div className="mb-3 flex items-center gap-2.5">
          <p
            id={headingId}
            className="shrink-0 font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-tertiary)]"
          >
            {label}
          </p>
          <span aria-hidden className="h-px flex-1 bg-[color:var(--color-divider)]" />
        </div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-body-lg text-[color:var(--color-text-secondary)]">
              {description}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {helperBadge ? (
              <span className="rounded-full border border-[color:var(--color-divider)] px-2.5 py-1 font-mono text-caption uppercase tracking-[var(--tracking-caps-08)] text-[color:var(--color-text-quaternary)]">
                {helperBadge}
              </span>
            ) : null}
            {collapsible ? (
              <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                aria-controls={contentId}
                className={controlClass({
                  shape: "pill",
                  size: "lg",
                  tone: "secondary",
                  className:
                    "gap-2 hover:border-[color:var(--color-indigo-a34)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-panel)]",
                })}
              >
                {isOpen ? (collapseLabel ?? "Collapse") : (expandLabel ?? "Expand")}
                <ChevronDown
                  size={ICON_SIZE.md}
                  aria-hidden="true"
                  className={cn("transition-transform", isOpen && "rotate-180")}
                />
              </button>
            ) : null}
          </div>
        </div>
      </div>
      {isOpen ? (
        <div
          id={contentId}
          role="region"
          aria-labelledby={headingId}
          className="flex flex-col gap-6"
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-label text-[color:var(--color-text-quaternary)]">
      {children}
    </p>
  );
}

export function Input({
  value,
  onChange,
  placeholder,
  type = "text",
  mono,
  disabled,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  mono?: boolean;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "disabled"
>) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={fieldClass({
        size: "lg",
        className: cn("hover:border-[color:var(--color-border-strong)]", mono && "font-mono"),
      })}
      {...props}
    />
  );
}

export function Textarea({
  value,
  onChange,
  placeholder,
  rows,
  mono,
  ...props
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows: number;
  mono?: boolean;
} & Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  "value" | "onChange" | "rows"
>) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className={fieldClass({
        multiline: true,
        size: "lg",
        className: cn("hover:border-[color:var(--color-border-strong)]", mono && "font-mono"),
      })}
      {...props}
    />
  );
}
