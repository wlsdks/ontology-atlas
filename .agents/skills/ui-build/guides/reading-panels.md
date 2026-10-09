# Reading panels

Use this phase reference when building or auditing an inspector that presents
long reading evidence. It supplements the ui-build workflow and the ui-proof design-audit
procedures; it does not prescribe a new visual style.

Before placement, name the primary reading object, controls that must remain
reachable beside it, and the element that owns reading scroll. Reuse a token
only when its role fits this surface. A selected-node inset does not establish
clearance for another inspector; measure its toolbar and zoom context.

Compare independent surfaces that must remain usable together across stacking
contexts. A higher z-index does not justify covering map controls. Exclude an
intentionally blocked modal background only when its interaction contract says
that background is blocked.

Expand the longest reading disclosure the surface offers, such as an answer,
source excerpt or exact request. Inventory painted elements with scrolling
overflow and scrollHeight greater than clientHeight. Those disclosures normally
flow in the panel body. An independent editor or collection may scroll separately
when its task requires it; measure wheel and keyboard reachability for that
exception. Verify that a long disclosure opens at its label and close control,
and check maximum scroll and affected viewport bands.

If the owner explicitly requests background-only verification, keep their
foreground untouched. Use rendered browser screenshots, accessibility and DOM
measurements for the baseline, checkpoints and final state. Record installed-app
or real-monitor proof as unperformed. Headless frames do not establish native
motion smoothness.
