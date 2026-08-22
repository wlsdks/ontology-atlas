"use client";

import { useLatinEyebrow } from "@/shared/lib/latin-eyebrow";
import { useRelationVocabulary, type RelationRegister } from "@/entities/knowledge-graph";

/**
 * The always-on instrument at the map's bottom right. It is the only surface that
 * explains the line encoding, so it stays lit regardless of first-run state. It
 * borrows `FirstRunReadout`'s readout grammar but not its visibility rules.
 *
 * "Always on" is about first-run state, not viewport: below 768px it is
 * deliberately hidden (`md:flex`). A narrow screen has no room for it, and there
 * exploring the nodes themselves outranks the line encoding (UX cross-check
 * round, 2026-07-19).
 *
 * Every word comes from `useRelationVocabulary` rather than being written here —
 * a persona measurement found four different relation vocabularies across the
 * surfaces.
 *
 * 2026-07-23 (owner observation + salience research): the right-hand entry used
 * to be a "confidence" gradient (strong ↔ weak). It was a legend for data that
 * does not exist — zero vault relations carry a confidence field, and the
 * renderer never varied colour per edge (Tufte's chartjunk). Worse, the weak end
 * of the gradient was amber (`--topology-relation-stroke-weak`, 217,161,65),
 * leaking the tone reserved for hub / Layer-0 onto relation lines. What the map
 * actually encodes is the relation type, so the legend now describes that.
 */
export function TopologyRelationLegend({
  register = "formal",
}: {
  register?: RelationRegister;
} = {}) {
  const relationVocabulary = useRelationVocabulary();
  // Caps tracking pulls Korean legend words apart (「포  함」, 「의  존」), so the
  // eyebrow is dropped by locale only — on Latin text it is the correct signal.
  const eyebrow = useLatinEyebrow("tracking-[var(--tracking-caps-16)]");

  return (
    <div
      data-testid="topology-relation-legend"
      className={`pointer-events-none hidden items-center gap-3.5 text-caption text-[color:var(--color-text-quaternary)] md:flex ${eyebrow}`}
    >
      <span className="flex items-center gap-2">
        <span aria-hidden className="relative h-2.5 w-8 shrink-0">
          <span className="absolute left-0 right-1 top-1/2 h-px -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-halo)]" />
          <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-[color:var(--topology-relation-spine-terminal)]" />
        </span>
        {relationVocabulary("contains", register)}
      </span>
      <span className="flex items-center gap-2">
        {/* Directed relation — dashed plus a **taper** (thick at the source, thin
            at the target). The swatch narrows left → right in the same grammar. */}
        <span
          aria-hidden
          className="h-[3px] w-8 shrink-0"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
            clipPath: "polygon(0 0, 100% 33%, 100% 67%, 0 100%)",
          }}
        />
        {/* The vocabulary's canonical key is `depends_on`. Passing the renderer's
            short form "depends" falls through as an unknown type and printed a raw
            "DEPENDS" on the Korean screen (found in an owner screenshot,
            2026-07-23). */}
        {relationVocabulary("depends_on", register)}
      </span>
      <span className="flex items-center gap-2">
        {/* Symmetric relation — dashed at **uniform width**. "No taper" is how the
            two ends being equals gets encoded. While this entry was missing the
            legend called every dashed line "depends", when in the real vault 70%
            of them were undirected `related_to` (dogfood measurement 2026-07-31:
            62 of 89). */}
        <span
          aria-hidden
          className="h-[2px] w-8 shrink-0 rounded-full"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, var(--topology-relation-spine-halo) 0 4px, transparent 4px 7px)",
          }}
        />
        {relationVocabulary("related_to", register)}
      </span>
    </div>
  );
}
