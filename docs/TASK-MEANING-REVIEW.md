# Task meaning review

The existing ACP conversation reviews an ontology write in three depths: summary,
comparison and complete request details. The task comes from the originating user
turn. Unrecorded non-goals remain unknown. Every batch item and every requested
field can be opened; a selected first item never represents the whole batch.
The compact task disclosure retains the full request. Initial focus starts at
the review heading; narrow or short parents use a continuous reading flow.
Execution uses a neutral action alongside correction and deferral, with complete
action explanations available in a disclosure. Coarse input keeps 44px targets.

Summary keeps complete recorded Definition, Includes, Excludes and Uncertainty
sections and relation rationales. Its coverage reports omitted units. Details
retains the exact proposed values, including empty bodies and null removals.
Comparison preserves previous-only map entries and explicitly distinguishes
missing evidence from an observed absent value. It does not infer business
changes from wording alone.

The current trusted comparison supports one `patch_concept` request. Before an
agent prompt, the Home workbench takes bounded fresh reads of the scoped ontology
documents twice and observes the connected project source. It rejects drift,
incomplete reads and changed vault/handle membership. These are bounded
observations, not an atomic filesystem snapshot. Native file times have integer
millisecond precision; compatibility with a fractional MCP guard is not exact
mtime verification. The original guard remains unchanged for the writer.

A comparison requires the original and current vault, source identity, complete
scope and target bytes to agree. A changed source observation without an exact
task-owned code diff stays uncomparable. A successful same-turn `connection_info`
from the write's MCP namespace must identify the expected vault. Known wrong
vaults block execution independently of comparison availability. Missing or
contradictory evidence does not become a trusted comparison.

Meaning acceptance requires opening the complete details, acknowledging the full
requested scope and passing a fresh comparison check. It binds only that exact
proposal and basis. Changing the request or capture provider invalidates the
decision. Acceptance does not resolve the write permission: **Allow once** still
controls execution. Code verification, merge and deployment have independent
statuses and remain unknown without their own evidence.

**Request correction** rejects the old request and appends editable task/target
context to the composer, preserving an existing draft. It never sends a new
prompt automatically. **Defer** keeps the live request unresolved and exposes
**Resume review**. It is conversation-local, not a saved queue. Cancelling the
turn refuses the pending write; neither action rolls back code already changed.

This implementation does not establish exact task-owned source diffs, trusted
batch semantic acceptance, durable meaning decisions, or human decision-quality
and repeat-use benefits. Those remain explicit work in
[the canonical V1–V4 plan](MEANING-WORKFLOW-PLAN.md). Browser fixture journeys
exercise the real components and protocol controller with disclosed test data;
they do not prove an installed native bridge or an actual participant's judgment.
