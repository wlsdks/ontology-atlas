### 10. Persist only the released meaning and verify it

Use `query_ontology({operation:"similar_nodes"})` or `find_evidence` before writes when non-starter concepts
may already exist. Pass `writePlan.concepts` rows unchanged in chunks of at most
50:

```text
add_concepts({ "concepts": [...] })
```

Only when every concept result row is `ok: true`, pass
`writePlan.relations` rows unchanged in chunks of at most 50:

```text
add_relations({ "relations": [...] })
```

If any concept row fails, stop before relation writes, repair the proposal, and
restart at step 8. The released plan proves lifecycle eligibility for that
exact source and proposal; it does not prove atomicity or write success.

After relation writes, read every released concept with full bodies in batches
of at most 20 and require each returned `body` to equal the corresponding
`writePlan.concepts[].body` byte-for-byte. Analyzer plans use the parser's
canonical body representation, including its one structural leading newline.
Do not trim, normalize, or accept semantic equivalence. A mismatch blocks source
connection and finalization because the successor did not receive the bytes the
human approved.

Then call:

```text
list_kinds({})
validate_vault({})
compile_ontology({ "summary": true })
connect_project_source({ "projectSlug": "<project>", "rootPath": "<repository root>", "confirm": true })
finalize_project_meaning({ "projectSlug": "<project>", "expected_mtime": <fresh project mtime> })
```

Then read `health`. Accepted competency gaps may keep the overall status at
`needs_attention`, but the released plan must not create new structural repair
work. An owned element's domain membership must not produce a redundant direct
domain relation recommendation; a genuinely unowned element remains a review
item.

Verify at least one path from project to domain to capability to element.
Report the census change, validation issues, graph issues, final meaning
assessment, unanswered competency questions, accepted gaps, and concepts
intentionally left proposed. A post-write failure is repaired forward; never
report construction complete before the finalizer succeeds.

The exact plan preserves the evidence, definition, includes/excludes,
uncertainty, domain/path, competency audit, and relation rationale so the
persisted graph remains inspectable by humans and source-hidden agents.

