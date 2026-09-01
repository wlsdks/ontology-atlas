# Source-hidden field-trial specimen

`v1.json` is a deterministic contract specimen, not a recorded qualification
or a real repository result. It closes the fixture gap without introducing a
public MCP field, a vault write path, or a quality score.

The question set is fixed before the build phase and contains 20 questions
across executive, employee, and agent audiences. The recorded specimen
keeps the four measurements separate:

1. `build` — elapsed build cost, meaningful node/relation observations, and
   builder/evaluator write boundaries.
2. `citation` — every cited relative path and its source check.
3. `handoff` — source-hidden answers, unanswered/partial IDs, and the exact
   full-body follow-up count.
4. `hallucination` — claim-level verification and failed claim IDs.

The fixture deliberately says `fixture_only` / `not_assessed`. A real trial
still requires the independent agent, a source clone outside this repository,
human approval, and the four phases in
[the field-trial skill](../../../.agents/skills/ontology-field-trial/SKILL.md).

Run the focused contract:

```bash
node --test mcp/src/source-hidden-field-trial.test.mjs
```
