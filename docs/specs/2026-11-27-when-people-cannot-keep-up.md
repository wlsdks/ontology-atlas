---
title: When people cannot keep up
doc_type: spec
status: draft
area: product
date: 2026-11-27
decisions: []
---

# When people cannot keep up

**In one minute.**

- Coding agents change this repository faster than a person can read it. In under eight days, 200
  changes were merged. Half of them went from their first commit to merged in 25 minutes or less.
- The owner, 2026-11-27, translated from Korean: "We should accept that human cognition can no
  longer follow what AI agents do, and plan the tools and features that fit that fact. Keep
  repeating the definition of this problem."
- This document defines that problem and builds nothing. It writes the definition six times, and
  each round shows the evidence that broke the one before. Round 7 tests the sixth against two
  measurements and keeps it.
- **The definition that survived.** A person who directs coding agents cannot read what the agents
  change, and no tool gives that back. The harm is not the unread code: when the person merges,
  releases, promises something or asks for the next change, nothing tells them which of the few
  things they answer for were checked, by what, and against which version of the code, so "nobody
  looked" and "someone looked and it was fine" both appear as silence.
- Reading more does not fix it. Today was a quiet day, with 12 changes a person could have read
  in full. The two things that went wrong were in lines no change touched.
- A person keeps five things: what was asked, what must never happen, what cannot be undone, what
  the product promises, and the meanings they accepted. The rest may stay unknown, as long as the
  screen says it is unknown.
- Next come three measurements, then at most one experiment behind a "Labs (Beta)" entry. Each
  experiment names its question, the test that can kill it, and the day it ends.

**Words used here.** A *change* is one pull request merged into the main branch. A *belief* is
what a person thinks is true about the code. The *vault* is the folder of Markdown documents Atlas
reads, here `docs/ontology`. A *concept* is one document in the vault that describes one ability or
one part of the code; its `path:` line names the file it describes. A document is *stale* when
that file changed after the document was written. A *gate* is an automatic check that must pass
before a merge or a release. A *sealed probe* is a test whose right answers are written and locked
before anyone sees the material, so the result cannot be bent afterwards. A *missed impact* is
something a change affected that a reader did not name. A *late find* is a mistake found after the
change that made it was merged.

## Person and moment

A developer who directs coding agents and merges their work many times a day: the owner of this
repository, the only person observed. The moment is not "reviewing a change". It is any moment the
person acts on what they believe about the code:

| The person | Acts on the belief that | Seen today |
|---|---|---|
| lets a change merge | it does what its title says, everywhere it needs to | #3963 fixed one place and left a second place reading the old thing |
| releases | what the product says about itself is still true | #3965: the vault said "68 of 72 abilities" and the measure was 69 of 73 |
| asks for the next change | the code is the way they last saw it | the owner asked the agent "what did you do this session?" |

These three are told in full in the spec "Changes beside the center"
([`2026-11-27-changes-beside-the-center.md`](2026-11-27-changes-beside-the-center.md)). Not observed: anyone but the owner, a person
learning agents, a person who does not write code, and what the owner looks at before pressing
release. Acceptance criterion 1 captures the last.

## Today

**Measured on this repository on 2026-11-27 at `bf6670e469`,** by two scripts in the session
scratchpad over `git log --first-parent` and `git diff --numstat -M` against each first parent:

| Fact | Count |
|---|---|
| Pace | the last 200 changes span 7 days 13 hours (2026-11-20 00:31 to 2026-11-27 14:01); 59 on the busiest day; 12 today |
| Time between two merges | 26 minutes at the median; 36 of 199 gaps are under ten minutes |
| First commit of a change to its merge | 25 minutes at the median; a quarter take 7 minutes or less, a quarter more than 1 hour 44 minutes |
| Size | 8,555 files and 500,335 changed lines; one change alone holds 179,822 lines; a change is 10 files and 316 lines at the median |
| Today | 12 changes, 106 files, 3,456 changed lines |
| Who wrote it | 1,279 of the 1,290 commits inside those changes carry an agent's co-author line |
| Titles | 52 of the 200 are titled `fix`; none is a revert |
| What the vault names | 97 documents (`list_concepts` census), 90 with `path:`; they reach 158 of the 8,555 changed files (1.8%) and none of today's 106 |
| Automatic checks | 253 contract test files under `tests/contract`; 7 hook files under `.claude/hooks` |

As plain arithmetic, not a measured reading speed: 500,335 lines over eight eight-hour days is 2.2
lines every second with no pause. Today's 3,456 lines are one line every eight seconds.

**What Atlas and this repository already say about "checked" and "not checked":**

- One rule decides whether a document still stands on its code, with four answers: `current`,
  `stale`, `missing`, `unknown` (`mcp/src/drift/evidence-verdict.mjs:26-69`).
- The project page already refuses to let silence mean "fine": "Nothing to check in what Atlas
  read. That does not say the meaning is right." (`messages/en/projectPages.json:163`).
- Changes names at most three changes as worth a look, by revert, an author's "breaking" mark,
  recorded concepts, or file count (`docs/features/change-briefing.md:44-53`). It has "no semantic
  approval, agent attribution, background collection or last-read checkpoint" (`:167`).
- The product direction says a person should not have to "accept the producing agent's summary as
  independent proof" (`docs/PRODUCT-DIRECTION.md:24-27`), that a full automatic review of agent
  changes "is not a current product promise" (`:45-48`), and that accepting a meaning, verifying
  code, merging and deploying "remain separate decisions" (`:54-56`).
- This repository already keeps the person at the steps that cannot be undone. An agent's write
  into the vault waits for `allow_once` or `reject_once` (`AGENTS.md:103`); publishing needs an
  explicit request (`AGENTS.md:134`, `.claude/rules/forbidden.md:86-87`); hooks block irreversible
  commands (`AGENTS.md:163`). A successful write "is not meaning acceptance" (`AGENTS.md:117`).
- No "Labs" or beta entry exists in the app: a search of `docs/ARCHITECTURE.md`, `docs/FEATURES.md`
  and `messages/en` found none.

**Earlier sealed probes on record:**

- 2026-09-13, two rounds. Readers answered questions about real agent changes, with and without
  facts from the vault. The committed record keeps one result: the fact that cut missed impacts by
  75% was "meaning unchanged, the code under it moved" (decision 683f0641, line 7). By the lead's
  account in this spec's brief, round one failed its pass line; round two cut missed impacts from
  16 to 4, the readers opened no fewer files, and every gained answer came from a fact only the
  vault held. Those figures are in no committed record
  (`docs/specs/2026-11-22-cli-rebuild.md:109-112`).
- 2026-11-22, a summary printed in the terminal. Missed impacts out of 124: 105 with the change's
  description and file list, 99 when the same packet was run a second time, 100 with the summary
  added, 78 with the full diff. The gain was 2%, smaller than the 6 between two identical runs
  (`docs/specs/2026-11-22-cli-rebuild.md:23-37`, decision 87de58d1).
- Stale documents: 17 of 31 abilities on 2026-11-17 (decision 3fbe9895, Dissent) and 75 of 96
  documents on 2026-11-22 (`docs/specs/2026-11-22-cli-rebuild.md:92-93`).
- When one import is followed from each file, 21% of changed product files reach a concept
  (`docs/specs/2026-11-23-review-agent-work-by-meaning.md:58-70`).

**Unknown:** how any of this reads on another repository or for another person. What caught the
52 `fix` changes is measured in round 7.

## Patterns that already worked

People have accepted "we cannot look at everything" before and built something that worked. Each
row takes the mechanism only; "what Atlas borrows" is this spec's reading, not the source's. Every
outside source in this spec was fetched and read on 2026-11-27, as its abstract or its page text,
unless a line says it was not read.

| Where | Mechanism, and why it worked | How it fails | What Atlas borrows |
|---|---|---|---|
| Linux kernel maintainers | Of over 9,500 patches in one release, one person chose 112 himself, about 1.3%. The rest came through maintainers, each answering for one named area, and each patch carries a signed line from everyone who passed it on ([development process](https://docs.kernel.org/process/2.Process.html), [submitting patches](https://docs.kernel.org/process/submitting-patches.html)). It works because the answer to "who vouches for this?" is written on the change. | The newest rule still says the human submitter must review all AI-written code and take full responsibility ([coding assistants](https://docs.kernel.org/process/coding-assistants.html)). At 200 changes in eight days that is a signature without a reading. | Answering by named area. Separate words for "reviewed", "tested" and "agreed", as the kernel has. Never one word that covers all three. |
| Air traffic control | The rule book puts two duties first, keeping aircraft apart and issuing safety alerts, and leaves everything else to judgment as workload allows. It says: "Do not assume that because someone else has responsibility for the aircraft that the unsafe situation has been observed." Responsibility is handed over and taken back in stated steps ([FAA Order JO 7110.65, chapter 2 section 1](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap2_section_1.html)). | The same text admits a controller "cannot see immediately the development of every situation". | A very short list of what always comes first. Handing over is said aloud, never assumed. |
| Control charts in manufacturing | Compare today with how the process usually runs. Only a point outside the limits is investigated. Where the limits sit is a chosen risk of searching for nothing ([NIST handbook 6.1.2](https://www.itl.nist.gov/div898/handbook/pmc/section1/pmc12.htm), [6.3.1](https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc31.htm)). | It needs a stable process and a number to measure. Whether agent work is stable enough is an assumption nobody tested. | State what is normal first. Flag only what departs from it. Publish how often the flag is wrong. |
| Sampling instead of inspecting everything | "Inspecting every product is costly and inefficient", so a sample stands for the lot (NIST 6.1.2). | A sample says nothing about the item not drawn. Audit sampling in finance was not read: the standard's page refused the fetch. | "People sample" is a real option when the sample is chosen on purpose and its size is said. |
| Management by exception | Set the expected figures first. Only a case that departs from them reaches the manager ([encyclopedia summary](https://en.wikipedia.org/wiki/Management_by_exception); the 1903 original was not read). | Its passive form acts only after something has gone wrong. With no figures set beforehand there is nothing to depart from. | The person sets the expectation once. The tool speaks only when it is broken. |
| Double-entry bookkeeping | Every amount is written twice, and the two totals must agree, so a slip shows without anyone rereading the books ([OpenStax, Principles of Accounting 3.6](https://openstax.org/books/principles-financial-accounting/pages/3-6-prepare-a-trial-balance)). | "We can have errors and still be mathematically in balance" (same page). | Two independent records of one fact. #3965 was caught exactly this way: the vault's count against the measured count. |
| Nuclear control room | Alarms watch because people cannot: nobody keeps attention for more than about half an hour on a display where little happens ([Bainbridge 1983, "Ironies of Automation"](https://doi.org/10.1016/0005-1098%2883%2990046-8), full text read from an openly hosted copy). | At Three Mile Island a lamp showed whether a valve's control had power, not whether the valve was shut. Operators read the unlit lamp as "shut" for hours, among many similar alarms ([encyclopedia summary](https://en.wikipedia.org/wiki/Three_Mile_Island_accident); the commission's report was not read). | A signal says what it measured. A missing signal is never shown as "fine". |
| Triage after a disaster | Sort many patients fast into four groups with one simple method, and live with a known error rate. Across 32 studies the most used method was right 73% of the time, too urgent 14% and not urgent enough 10% ([Franc et al. 2022](https://pubmed.ncbi.nlm.nih.gov/34915954/)). | The same review concludes it is not accurate enough to rely on. | A sorter publishes its error rates. Sorting is not judging. |

Not verified: newspaper editing and financial audit practice. No source was read for either.

**What is new in Atlas's combination.** In none of these does the checker know what the person
believes. Atlas holds written beliefs (concept documents) with their dates, beside the code and
its dates. So it can combine four borrowed parts: a short list the person set, compared against a
second record, with "not looked at" shown as its own state, and with error rates published by a
sealed probe before anything ships.

## Problem and alternatives

### What research says people miss, even when it matters

Ranked by how much each matters for a person who reviews agent work in Atlas.

| # | Finding | Source | For a person reviewing agent work |
|---|---|---|---|
| 1 | **A missing thing is not noticed.** People learn from what is present far more easily than from what is absent. Finding the one item that lacks a feature takes a slow search, item by item. | [Newman, Wolff and Hearst 1980, "The feature-positive effect in adult human subjects"](https://pubmed.ncbi.nlm.nih.gov/7437120/); [Treisman and Souther 1985, "Search asymmetry"](https://pubmed.ncbi.nlm.nih.gov/3161978/) | Nobody notices the edit that was not made (#3963) or the sentence that quietly became false (#3965). A tool has to turn the absence into something present on screen. |
| 2 | **People lean on automation, and training does not stop it.** It happens to experts, cannot be prevented by training or instructions, and happens in teams too. A second crew member did not reduce missed events. | [Parasuraman and Manzey 2010, "Complacency and bias in human use of automation"](https://pubmed.ncbi.nlm.nih.gov/21077562/); [Skitka et al. 2000, "Automation bias and errors: are crews better than individuals?"](https://pubmed.ncbi.nlm.nih.gov/11543300/) | "Review more carefully" and "add a second reviewer" are not answers. |
| 3 | **How advice is shown changes how much it is trusted.** What helped: giving information instead of a recommendation, showing how sure the system is, where the advice sits on screen, and making the user answer for the result. | [Goddard, Roudsari and Wyatt 2012, "Automation bias: a systematic review"](https://pubmed.ncbi.nlm.nih.gov/21685142/) | Atlas shows facts and where they came from. It does not say "safe" or "approve". |
| 4 | **Watching instead of doing costs understanding.** People who only monitor an automated task are slower to take over when it fails. A person can judge a computer's decisions only at a higher level: are they acceptable? | [Endsley and Kiris 1995, "The out-of-the-loop performance problem"](https://doi.org/10.1518/001872095779064555) (abstract); Bainbridge 1983, linked above (full text) | The person's part is to set what is acceptable, not to re-check each step. Some real reading must stay, or the ability to step in is lost. |
| 5 | **Too many alarms hide the real one, and rare problems are missed.** In one hospital 88.8% of 12,671 checked alarms were false. When the thing searched for is rare, people often fail to see it when it does appear. | [Drew et al. 2014, "Insights into the problem of alarm fatigue"](https://pubmed.ncbi.nlm.nih.gov/25338067/); [Wolfe, Horowitz and Kenner 2005, "Rare items often missed in visual searches"](https://pubmed.ncbi.nlm.nih.gov/15917795/) | Most agent changes are fine. A flag on every change is the same as no flag. |
| 6 | **Looking at something is not seeing it.** 83% of 24 radiologists missed a gorilla 48 times the size of what they were looking for, and most looked straight at it. What people notice depends on the task they are doing. | [Drew, Vo and Wolfe 2013, "The invisible gorilla strikes again"](https://pubmed.ncbi.nlm.nih.gov/23863753/); [Simons and Chabris 1999, "Gorillas in our midst"](https://pubmed.ncbi.nlm.nih.gov/10694957/) | A reviewer answers "does this do what the title says?". Anything outside that question can be on screen and unseen. |
| 7 | **The first find ends the search.** After one abnormality is found, others are detected less well. A spoken checklist did not help. | [Berbaum et al. 1990, "Satisfaction of search in diagnostic radiology"](https://pubmed.ncbi.nlm.nih.gov/2312249/); [Berbaum et al. 2016, "The influence of a vocalized checklist"](https://pubmed.ncbi.nlm.nih.gov/26916249/) | Once the main part looks right, the look is over. A fixed checklist does not reopen it. |
| 8 | **Watching for long is hard work.** Monitoring feels easy and is measured as demanding and stressful; performance drops with time. | [Warm, Parasuraman and Matthews 2008, "Vigilance requires hard mental work and is stressful"](https://pubmed.ncbi.nlm.nih.gov/18689050/) | A person cannot sit and watch a stream of merges that are mostly fine. |
| 9 | **People believe they would notice a change, and do not.** Large changes go unseen without a cue; with a spoken cue they are found fast. | [Rensink, O'Regan and Clark 1997, "To see or not to see"](https://doi.org/10.1111/j.1467-9280.1997.tb00427.x) (abstract) | "I would have seen it" is not evidence. A cue that names the place works. |
| 10 | **A repeated shortcut becomes normal.** Breaking a rule often enough makes it routine, and nobody sees it as a risk any more. | [Banja 2010, "The normalization of deviance in healthcare delivery"](https://pmc.ncbi.nlm.nih.gov/articles/PMC2821100/), which reports Vaughan's work; her book was not read | Merging unread work is already normal here. So is a vault where 75 of 96 documents are stale. |
| 11 | **Percentages mislead; counts help.** Given test accuracy as probabilities, 48 physicians got the right answer in 10% of cases; given the same facts as counts, 46%. | [Hoffrage and Gigerenzer 1998, "Using natural frequencies to improve diagnostic inferences"](https://pubmed.ncbi.nlm.nih.gov/9609869/) | Say "3 of 40 flags were real", never "92% accurate". |

Two studies of AI coding tools show the same gap between belief and fact. People with an AI
assistant wrote less secure code and were more likely to believe it was secure
([Perry et al. 2023](https://arxiv.org/abs/2211.03622)). Experienced developers believed AI made
them 20% faster while they measured 19% slower
([Becker et al. 2025](https://arxiv.org/abs/2507.09089)).

### The definition, round by round

**Round 1.** *Agents produce more code than a person can read.*
- **For it:** 500,335 changed lines in under eight days.
- **What broke it:** today. Twelve changes and 3,456 lines could have been read in full. Reading
  them would not have helped: the second place in #3963 and the false count in #3965 were in lines
  no change touched. The September probe says the same from the other side. By the lead's account,
  readers given vault facts opened no fewer files and missed 4 impacts where the others missed 16.
  The amount read does not decide a miss.

**Round 2.** *A person's picture of the code is updated more slowly than the code changes, so the
picture is always behind.*
- **For it:** a merge every 26 minutes, and 25 minutes from a change's first commit to its merge.
- **What broke it:** "behind" promises that a summary lets the person catch up. That was built and
  tested, and the terminal summary gained 2%, less than the difference between two identical runs.
  Being behind is also often harmless. One person chose 1.3% of a kernel release himself, and the
  owner never needed to know which two motion files #3964 deleted. A definition that treats every
  unread thing as a debt asks for a tool nobody needs.

**Round 3.** *The person cannot verify agent work, so the agent's own summary is the only account.*
- **For it:** 1,279 of 1,290 commits were written with an agent, and each change's description
  comes from the agent that made it.
- **What broke it:** the person is not the only checker. 253 contract tests and a release gate
  also check, and the gate caught #3965. By the account in "Changes beside the center", an independent
  reviewer read #3963 and still missed the second place; it was handed the same title and the same
  diff. A second reader with the first reader's question is not a second account. The research
  adds that the failure is not weak checking. It is confidence that does not match what was
  checked (findings 2 and 9, and the two AI studies).

**Round 4.** *The person cannot tell which of their beliefs about the code were checked and which
are only assumed.*
- **For it:** the Three Mile Island lamp, and developers who felt faster while measuring slower.
- **What broke it:** on this repository "not known to Atlas" would be said of 98.2% of changed
  files, and "stale" of 75 of 96 documents. A true statement made about nearly everything is the
  false alarm of finding 5, and it gets ignored. The definition also covers every belief, when a
  person needs this for a few, and it describes a standing state, when harm happens at a moment.

**Round 5.** *At each decision only the person can make, they act on a few beliefs and cannot tell
which of those are no longer supported.*
- **For it:** the three moments in the table under Person and moment.
- **What broke it:** two things. At 200 merges in eight days the person does not decide each
  merge; `pnpm pr:land` and the checks do. The person's real decisions are fewer: what to ask for,
  which rules and gates exist, and when to release. And the belief that broke in #3963, "the fix
  reached every place that reads this branch", was written nowhere. A tool can only watch beliefs
  that are written down. Round 5 assumed a list that does not exist.

**Round 6, the one that survived.** *A person who directs coding agents cannot read what the
agents change, and no tool gives that back. The harm is not the unread code: when the person
merges, releases, promises something or asks for the next change, nothing tells them which of the
few things they answer for were checked, by what, and against which version of the code, so
"nobody looked" and "someone looked and it was fine" both appear as silence.*
- **Why it survives:** it asks for no more reading (round 1) and no catching up (round 2). It
  counts gates and agents as checkers and asks only that they be named (round 3). It is limited to
  a few things (round 4). It says "acts", not "decides each merge", and "the few things they
  answer for" makes writing that list part of the problem (round 5).

**The strongest objection still standing.** The costliest miss today was a belief nobody had
written down, and the vault names 1.8% of the files that change. So the definition may be right
while Atlas can serve only a sliver of it. A second objection is weaker but not dead: gates and
agents caught both of today's misses without the person, so perhaps a person needs no picture of
the code, only a list of gates. The reply is finding 4: someone still has to say what the gates
are for. Criterion 2 measures who catches what, and it can overturn this definition.

**Round 7: round 6 tested against criteria 2 and 3.** Measured on 2026-11-27 with
`pnpm who-catches-what`. The rule for "what caught it" was written and committed before any fix
was opened (`scripts/records/who-catches-what-rule.md`, SHA-256 `d1470b67...50df`).
- **Nearly every fix corrected an earlier change.** 50 of the 52 `fix` changes changed lines an
  earlier merged change wrote. One only added lines; one could not be traced. Half of these
  mistakes were more than 4.7 days old when fixed, and 20 were more than 30 days old. Those ages
  are often too young: in 20 of the 50, the last change to touch the line was a move, a split or a
  release step, not the change that made the mistake.
- **Most mistakes shipped first.** In 42 of the 50, a stable release was tagged between the
  mistake and its fix. There were 21 stable release tags in these seven and a half days, so a
  mistake older than a few hours almost always ships.
- **Who caught them, by the script:** a gate 19, an agent 3, the owner 6, an outside user 0, luck
  0, and 24 where the record does not say. A person re-read 20 of the 52, drawn with a fixed seed.
  The script was wrong on 8 of the 20. By hand, the 20 were: a gate 11, an agent 2, the owner 1,
  luck 1, and 5 where the record does not say.
- **What the gates caught was breakage:** a red lint step, a failed browser test, a build that ran
  out of time. Six of the other nine were the app saying something untrue: a working sign-in shown
  as missing, merged work shown as not merged, a repair button that changed nothing. No test knew
  the right answer. Someone looked at the app, or the record does not say who found it.
- **One fix in four does not say what found the mistake** (5 of the 20 read by hand). Round 6's
  silence is in the record too: after the fix, nobody can tell a check from a person from chance.
- **The noise count.** Today's vault has 94 concepts: 35 checked (37%), 59 stale (63%), and none
  that could not be dated. "Checked" only means the document was saved after its code last
  changed, apart from comments, imports and whitespace; nobody is recorded as having read it. The
  spec's "not looked at since the code changed" is the stale count. At 63% it is three times the
  one-in-five limit, so that state must be narrowed before any probe.
- **What this does to round 6:** it is kept. Gates caught the most, which supports the objection
  that a list of gates may be enough. The objection still fails: the gates caught what broke and
  missed what became untrue, and 42 of 50 mistakes shipped before anyone fixed them. Experiment 0
  (do nothing) dies by its own sealed line, but only on its release part. Luck and outside users
  together were 1 of the 20.
- **Limits.** The sealed rule missed in four ways, and it stays as sealed; a better rule needs a
  new seal. Commit bodies wrap at 80 characters, and the rule ends a sentence at a line break. Its
  check words lack "run", as in "the browser run failed". It allows one word between "the" and
  "review", so "the independent security review" was missed. It also matched sentences that
  describe the fix, not the find. Which earlier change made the mistake was wrong in 6 of the 20:
  the line was last touched by a folder move, a comment cleanup or the previous release's version
  lines. One merge that carried two fixes (#3674 and #3675) is outside the 52, as in the first
  count.

### Five layers, and whether accepting the fact changes what a tool should do

| Layer | In this repository | If we accept that people cannot keep up | Does it need Atlas? |
|---|---|---|---|
| **Volume**: more changes than anyone can read | 200 changes, 500,335 lines | Stop building aids for reading everything; the terminal summary failed. A tool chooses what not to show and says how much it left out. | Mostly no. Gates and sampling carry volume. |
| **Speed**: a change lands before a person forms a belief about it | 25 minutes from first commit to merge | Stop seating the person before each merge. Seat them before what cannot be undone, and make "what changed since I last looked" cheap afterwards. | Partly. Git and the checks own merging. "Since I last looked" by concept is Atlas's part, and it does not exist (`change-briefing.md:167`). |
| **Opacity**: the producer's summary is the only account | 1,279 of 1,290 commits by agents | Do not ask the person to check the summary by reading. Give a second account built from files, which does not start from the agent's title. | Yes. This is where a recorded probe showed a gain, and all of it came from vault facts. |
| **Drift**: a belief that was true becomes false without anyone touching it | #3965; 75 of 96 documents stale | A belief has an age against its code. A machine can find every case with no person. The person only decides what to do. | Yes, and only Atlas has both dates. At 75 of 96 the flag is noise until it is narrowed. |
| **Responsibility**: who answers for something nobody read | every merge; the kernel rule above | Answering must attach to what a person can really do: set the rules, own named areas, and take the steps that cannot be undone. Record what checked each thing. Do not collect a signature. | Mostly no. This is process and law. Atlas's part is small: keep "merged" and "meaning accepted" apart, and add no approval button (`docs/PRODUCT-DIRECTION.md:34`). |

Ranked by what each gives back to the person against its cost: drift first, because the parts
exist and only Atlas holds them; then opacity; then speed's "since I last looked"; then
responsibility; volume last, because other tools already carry it.

### What a person must still own

| The person keeps | Example here | What a tool owes them |
|---|---|---|
| **What was asked**, and whether the result is that | "draw the rooms without Moru" (#3964) is a matter of the owner's taste | the request beside the result |
| **What must never happen** | nothing leaves the computer without a line in the local log; no login (`.claude/rules/forbidden.md`) | the list of rules, and for each rule what checks it. The person owns the list, not each check. |
| **What cannot be undone** | a release, a publish, a deleted branch, a write into the vault | a stop before the step, as this repository already has (`AGENTS.md:103`, `:134`, `:163`) |
| **What the product promises** | the README, the six trust promises, a count the vault states about itself | a notice when the code under a promise changed |
| **Meanings they accepted** | a concept document a person reviewed | "accepted" kept apart from "written" (`AGENTS.md:117`) |

**What may safely become unknown, if it is flagged:** how an ability is built, which files a
change touched, the inner structure of a part, and everything the vault does not name. Three
conditions make it safe: the screen says it is unknown, a gate or a way to undo stands behind it,
and its size is shown as a count so it cannot grow unseen.

**Not reading must stay different from not knowing that you did not read.** That needs three
states that never share a look: checked since the code last changed (with what checked it and
when), not looked at since the code changed, and not known to Atlas. Silence is not one of the
three. The project page's sentence quoted under Today is the model.

### Options, each as one experiment

The owner plans one "Labs (Beta)" entry in the app: one door to a list of experiments a person
can switch on and try. That door is a new route and needs its own decision record. It is a
dependency of every experiment below and is not designed here.

**What earlier experiment pages teach.**

- The person switches each experiment on or off, and the page promised an ending from its first
  day: popular ones "will become core parts of the product, and we'll eventually retire the ones
  that don't get much use". It shipped with "not that much testing" and a way out when one broke
  ([Gmail Labs, 2008](https://gmail.googleblog.com/2008/06/introducing-gmail-labs.html)).
- Every experimental flag has a named owner and an expiry, and expired flags are removed. Flags
  that never expire "represent ongoing engineering, test and support burden"
  ([flag expiry](https://chromium.googlesource.com/chromium/src/+/main/docs/flag_expiry.md),
  [flag ownership](https://chromium.googlesource.com/chromium/src/+/main/docs/flag_ownership.md)).
- Each preview has a short description, a feedback link and a plainly named release phase
  ([feature preview](https://docs.github.com/en/get-started/using-github/exploring-early-access-releases-with-feature-preview)).
- How such pages fail: an experiment stays so long that people rely on it, which is the reason the
  flag rules give for expiry. One company closed its whole experiments site because "greater focus
  is crucial" ([2011](https://googleblog.blogspot.com/2011/07/more-wood-behind-fewer-arrows.html)).

So every experiment here has one question, one measure, a named owner, and an end date on which it
is removed unless promoted. At most three run at once, each off until the person switches it on,
and none starts before its sealed probe has passed.

**Experiment 0. Do nothing; people sample.** No switch. This is the baseline.
- **Question:** are the gates, the agents' own reviews and a person who reads what catches their
  eye already enough?
- **Measures:** for each late find, what caught it (acceptance criterion 2).
- **Sealed probe that could kill it:** the rule for "caught by luck" is written and locked before
  the 52 `fix` changes are opened. Doing nothing dies if more than a third of late finds were
  caught by luck, by a user, or after a release. If gates and agents caught nearly all, it wins.
- **Ends:** when criterion 2 is reported.

**Experiment 1. Checked, by what, against which code.** Before a release, one list of the things
the person answers for. Each row is in one of the three states above.
- **Question:** does keeping "not looked at" apart from "fine" change what a person believes
  before they release?
- **Measures:** wrong beliefs, and whether the first screen names an item like the one in #3965.
- **Sealed probe that could kill it:** the last ten releases. For each, the key is what later
  fixes showed was wrong in it, locked before any packet exists. Readers get the release notes and
  change list, or the same plus the list. It dies if wrong beliefs fall by less than the
  difference between two identical runs, or if more than one row in five reads "not looked at".
- **Ends:** after ten real releases or 30 days. Promoted if the owner acted on a row at least
  three times; removed otherwise.

**Experiment 2. The person's short list.** At most ten sentences that must stay true, each tied to
files or to a gate. Atlas speaks only when the code under a sentence changes.
- **Question:** can a short written list hold the beliefs that really break?
- **Measures:** how many late finds sat under a sentence on the list.
- **Sealed probe that could kill it:** someone who has not seen the corrections writes the list
  from the vault and the rule files as they stood on 2026-11-19. It is locked, and the 200 changes
  are replayed. It dies if it covers under a third of the late finds, or speaks on more than one
  change in five. The belief behind #3963 is the hard case.
- **Ends:** after 30 days. Removed if the person never edited the list.

**Experiment 3. A stated sample.** Each day Atlas draws a few merged changes to read in full and
says the size, for example "You read 3 of 25 today; only automatic checks covered the other 22."
- **Question:** does a chosen, stated sample find more than reading by taste, and does saying its
  size bring confidence closer to fact?
- **Measures:** late finds per change read.
- **Sealed probe that could kill it:** with the late finds of criterion 2 locked, does the drawing
  rule pick the changes that needed correcting more often than twenty random draws of the same
  size? It dies if it does not.
- **Ends:** after 14 days. Removed if the owner read under half of what was drawn.

Inside one change, the options are in the spec "Changes beside the center" named above: its
options 1 to 3 give a second account of a single change, which answers the opacity layer. The
experiments above answer the moment of acting, across changes. Order: the three measurements
first; then experiment 1; then 3; then 2.

| Way | Value | Cost to the person | Can be built now | Local-first | Why Atlas |
|---|---|---|---|---|---|
| 0. Do nothing | unknown until criterion 2 | none | yes | holds | not needed |
| 1. Checked, by what, against which code | covers drift, where a probe showed a gain | one list before a release | parts exist | holds | only Atlas holds the documents and the code with both dates |
| 2. The short list | the only way to reach a belief like the one behind #3963 | writing and keeping ten sentences | needs a vault contract | holds | the list is Markdown in the vault, beside the concepts |
| 3. A stated sample | keeps real reading alive (finding 4) | a few changes a day | yes | holds | weak: a script could draw, unless the draw uses the short list |

## Flow

None — problem definition only.

## States

None — problem definition only.

## Copy

None — problem definition only.

## Edge cases

- **Zero, one, most.** A repository with one change a week does not have this problem, and no
  experiment switches itself on there. The largest measured are 59 merges in a day and one change
  of 3,471 files.
- **First run.** With no vault, nothing the person answers for is written, so experiments 1 and 2
  have nothing to show and must say so.
- **Hangul and offline.** A sentence on the short list may be in Korean; matching to files never
  depends on its words. Every read is local, so offline changes nothing.
- **Moved, renamed or unreadable folder.** "Checked" attaches to a version of the code. If the
  folder cannot be read, every row is "not known", never "checked".
- **Two edits at once.** Two agents changing the same thing is the same problem seen twice;
  `docs/specs/2026-11-22-work-status-coordination.md:327` covers two branches touching one file.

## Out of scope

- **An approval button for agent work.** No record found with `pnpm decisions:find cognitive diff`
  measures whether a person can tell a wrong sentence about a change from a right one, and a
  signature without a reading is the failure named above.
- **A risk score or a ranking of changes by danger.** Counts never imply severity (decision
  390e91c6), and the first answer about impact is evidence, not a number (`docs/DECISIONS.md:3884`).
- **A summary written by a model.** It is the producer's account again, and it sends text out.
- **Slowing agents down or gating every merge on a person.** That refuses the premise.
- **Who answers in law or in a team.** This spec covers one person and their own repository.
- **The design of the Labs door.** It gets its own spec and decision record.

## Acceptance criteria

1. **The release walk, captured first.** Given the next real release, when the owner says aloud
   each thing they believe before pressing release, then the pull request lists each belief and
   whether anything had checked it. Checked by: a recorded installed-app walk.
2. **Who catches what.** Given the last 200 changes, when each of the 52 `fix` changes is
   classified, then the pull request states for each late find whether the corrected lines were in
   the earlier change, and what caught it: a gate, an agent, the person, a user, or luck. Checked
   by: a committed script's output and a hand-checked sample of twenty.
3. **The noise count.** Given today's vault, when the three states are computed for every concept,
   then the pull request states how many read "not looked at". More than one in five means the
   state must be narrowed before any probe. Checked by: the same script's output.
4. **The definition is attacked again.** Given criteria 1 to 3, when their results are in, then
   this spec gains a round 7 with the evidence that broke or kept round 6. Checked by: the dated
   line under Revisions.
5. **One sealed probe before one experiment.** Given the experiment ranked first after round 7,
   when two readers per packet answer, then the gain exceeds the difference between two identical
   runs and wrong beliefs do not rise. Checked by: the probe's table in the pull request, with the
   key's hash dated before the packets.
6. **Silence is never "fine".** Given the built experiment and a folder Atlas cannot read, then
   every row reads "not known" and none reads "checked". Checked by: a unit test named when the
   experiment is chosen.
7. **An experiment ends.** Given the Labs entry, then each experiment shows its owner and its end
   date, and on that date it is gone or promoted. Checked by: the Labs spec's own criteria.
8. **The recovery proof.** On the owner's Mac, in a rebuilt installed app, before one real
   release: the owner names for each thing they answer for whether it was checked and by what,
   without opening a diff. Then for five days the owner notes each late find; the notes fall
   against the week before. Checked by: the walk's recording and the notes in the pull request.

## Risks

1. **The definition is right and Atlas cannot reach it.** The vault names 1.8% of changed files,
   and the worst miss was a belief written nowhere. Answer: criterion 3 measures the reach before
   anything is drawn; experiment 2 tests whether a short list closes the gap; the mapping work in
   `docs/specs/2026-11-23-one-press-maps-the-rest.md` widens it.
2. **"Not looked at" becomes wallpaper.** That is findings 5 and 10 together. Answer: the
   one-in-five limit is measured first, results are shown as counts, and a state that is always
   on is removed.
3. **Accepting "people cannot keep up" becomes permission to stop looking.** Then the person loses
   the ability to step in (finding 4). Answer: the stated sample keeps some real reading, and the
   steps that cannot be undone stay with the person.

## Later

1. Experiment 1, at the release moment. Next when its probe passes.
2. Experiment 3, the stated sample. Next when criterion 2 shows the person catching almost nothing.
3. Experiment 2, the short list. Next when criterion 2 shows late finds that sit under no concept.
4. "Since you last looked", per thing the person answers for. It needs a new vault file, since no
   user state may live outside vault files (`.claude/rules/local-first.md:36-39`). Next when that
   file has a decision record.
5. The options of "Changes beside the center". Next by that spec's own probe.

## Owner question

The brief asks for three. Each has a default, and nothing waits on them.

1. **Where does the person stand: before every merge, or only before what cannot be undone?**
   Default: only before what cannot be undone. Merges are sampled, not read.
2. **Who writes the short list of what the person answers for?** Default: Atlas proposes it from
   the vault and the rule files, and the person cuts it to ten or fewer.
3. **Does Labs open with one experiment or several?** Default: one, experiment 1, with the
   do-nothing count reported beside it.

## Revisions

- 2026-11-27: first draft. Six rounds of the definition, five layers, eleven research findings,
  eight patterns and four experiments; no option chosen and no copy written.
- 2026-11-27: round 7 from criteria 2 and 3, measured by `pnpm who-catches-what` under a rule
  sealed before any fix was opened. Round 6 is kept. 50 of 52 fixes corrected an earlier change,
  42 of those shipped in a release first, and 59 of 94 concepts are stale, over the one-in-five
  limit. The script's class was wrong on 8 of 20 fixes read by hand.
