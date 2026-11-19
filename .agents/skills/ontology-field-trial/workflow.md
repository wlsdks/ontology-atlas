# Field trial: build through the app's door, then read the result against the code

A change to construction is judged by what a builder agent writes on a
repository nobody tuned it for, and by whether what it wrote is true of that
code. Run this when construction rules, the survey, a write tool's result, the
guide `connection_info` returns, or either prompt the app sends can change what
ends up in a vault.

Use the
[Atlas meta-model specification](../../../docs/ONTOLOGY-ATLAS-SPEC.md#2-the-five-authorable-node-kinds-and-reserved-reader-kind)
as the answer key for kind and relation questions. Do not invent a second
rubric from the vault being judged.

## Targets

- Open source under Apache-2.0, MIT or BSD only, with no extra policy file that
  restricts use. When in doubt, pick another.
- Repositories nobody in the session has read, so gaps cannot be filled from
  memory. Prefer a rich domain (commerce, finance, logistics) over a library of
  utilities: kinds and relations can only be judged where the product has
  several responsibilities.
- At least two languages, and at least one repository above 100,000 lines. The
  defects of a large repository (a survey the host rejects, areas never opened)
  do not show on a small one.
- Clone shallow into the session scratchpad, never inside this checkout. Name a
  target by shape ("an MIT TypeScript personal-finance monorepo, 1,900 files")
  in every file, test, commit and pull request of this repository
  (`.claude/rules/forbidden.md`).

## Headless ACP replay

The same door the app opens (the vault MCP bound to one folder, the session's
appended handoff, and the first-run instruction sent as the person's own turn)
assembled outside the app, so a build can be repeated after every change. The
script reads both prompts out of the app source at run time and stops if it
cannot, so a replay always measures what the app sends.

```bash
# A fresh copy per run: the vault is <copy>/atlas and must not exist yet.
rsync -a --exclude atlas --exclude .git "$TRIAL"/clone/ "$TRIAL"/run/repo/
.claude/skills/ontology-field-trial/scripts/acp-replay.sh "$TRIAL"/run/repo \
  --model opus --out "$TRIAL"/run/out

# What the write door still says about the finished vault.
node .claude/skills/ontology-field-trial/scripts/scan-findings.mjs \
  "$TRIAL"/run/repo/atlas "$TRIAL"/run/repo
```

Run the base commit and the change in the same session, on the same clones and
model: a number from another day is not a comparison. Do not coach a run.

## Read the run

`<out>/replay.json` holds turns, cost, wall clock, nodes per kind folder, the
calls per tool and whether finalizing succeeded. `<out>/turn-one.jsonl` holds
every call and its answer. From them, list:

- **Answers the host did not deliver.** A tool result the host rejects for its
  size never reaches the agent, and the agent builds from less without saying
  so. Record the size of every survey and validation answer; any above 40,000
  characters is a defect.
- **Refused and repeated calls**, each with the refusal text. A refusal the
  agent could not have avoided from the tool's description is a product defect,
  not agent error.
- **Calls that carry nothing the next call uses**, and answers whose bulk is
  one sentence repeated per row.
- **What the agent said it did not do.** Its closing answer names what it left
  unread; compare that with the request.

## Read the vault against the clone

- **Cited lines exist.** Every `path:Lstart-Lend` and every `path:` resolves in
  the clone. Anything below all of them is an invention: name the node.
- **Domains are the product's responsibilities.** Read the project node and the
  domain list beside the repository's own README. A domain named after a folder
  or a framework layer is a defect.
- **Abilities are things someone gets.** Titles read as what a user, operator
  or other system can do. Count titles that are a noun or a code name.
- **Rules are in the code.** For a sample of capabilities, open the cited lines
  and check that the stated rule is what those lines decide.
- **Dependencies are mechanisms.** For a sample of `depends_on` edges, check
  the stated reason against the cited file, and that the direction is consumer
  to provider.
- **What is unread is said.** A capability nobody read states no rule and says
  so; a family says how many members were read.

The session that made the change reads first. Then one reader that did not
make it, given only the clone and the vault, checks a sample of rules and
edges and reports each as true, false or not stated by the cited lines.

## A bounded second request

A builder completes a request that names its work and declines one that asks
for the whole repository in a turn. After the build, resume the session id in
`<out>/replay.json` with the flags the script gives its second turn and send the
text of one next step the app offers (`messages/en/acpChat.json`, `suggest.*`),
naming up to eight slugs. Check that every named concept changed and that the
new cites exist.

## Report

Put in the pull request, for each target by shape: a before and after row
(nodes per kind, turns, wall clock, cost, calls refused, largest answer), the
defects found with the run that showed each, which were fixed, and which were
left with the reason. Say what was not checked.

Limits: the permission card is replaced by an allow-list, so a replay is never
evidence that the checkpoint holds; one run per target, so only a moved
category counts as a change; and it reproduces the door's inputs, not the app,
so the installed build stays unproven.
