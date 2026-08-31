# Reading the 24 answers — 2026-08-31

> A screening pass, not a verdict. Read
> [the scoring correction](FINDINGS-2026-08-31-metric-split.md) first: it showed
> that the machine score could not compare the two sides, and that only a person
> reading the answers could. This is a first read of those answers by a model,
> which is weaker evidence than the human grading the rubric asks for and does
> not replace it.

## How this was done, and what it cannot be

The 24 answers already saved for `2026-08-31-gb-r3` were rewritten into a packet
with opaque ids in a shuffled order, the grades were written down, and only then
was the key opened. The packet and the key are both committed
([packet](results/2026-08-31-gb-r3-blind-packet.md),
[grades](results/2026-08-31-gb-r3-screening-grades.md)), so anyone can grade the
same answers and compare.

Two limits are structural:

- **The grader is not a person.** It is the same assistant that built the scoring
  split, and it knew what the earlier numbers said.
- **The sides cannot really be hidden.** An answer written with a vault names its
  concepts; an answer written without one does not. Shuffling protects against
  grading in a convenient order. It does not make the sides unrecognisable.

So treat every number below as a place to look, not as a result.

## What the reading found

Correctness is 0–3. Twelve answers per side.

| | Without Atlas | With Atlas |
|---|---:|---:|
| Correctness | 2.50 | **2.83** |
| Boundary right | 1.92 | 2.00 |
| Citations exist | 2.00 | 2.00 |
| Next step worth taking | **1.92** | 1.83 |
| Claims the source does not support | 1 | **0** |

The averages are close, and the averages are the least interesting part. The
four questions do not behave the same way:

| Question | What it asked | Without Atlas | With Atlas |
|---|---|---:|---:|
| G1 | who should own a new discount rule, and what to read first | **3.00** | 2.67 |
| G2 | should reconciliation move into checkout, and what is the recorded relation | 2.00 | **3.00** |
| B1 | what an acknowledgement change touches, and what is only declared | 2.33 | **2.67** |
| B2 | where permission evaluation belongs, and what to verify next | 2.67 | **3.00** |

### Atlas won where the question was about something recorded

On G2 both sides said *no, reconciliation stays in Inventory* — and both were
right. The question also asked for **the recorded relationship and its reason**.
Only the Atlas side had one to give:

> `capabilities/checkout --depends_on--> capabilities/inventory-sync` — "Checkout
> depends on trustworthy sellable availability before it confirms a purchase."

The control side answered that too, but by paraphrasing the product goal: *"the
recorded relationship is consistency between purchase completion and inventory
availability."* That is the same idea, correctly derived — and it is not a
recorded relation, because the prose has none. Asked what was written down, one
side could quote it and the other had to reconstruct it.

On B2 the Atlas answers stated the boundary **in both directions**: Coordination
does not own permission evaluation, *and* Access Control does not own incident
decision content. No control answer stated the second half. That comes straight
from the `Inclusions / Exclusions` sections, and it is the clearest thing the
vault contributed anywhere in this run.

### Atlas lost the orientation question, and the reason is worth knowing

G1 asked who should own a new discount rule and what to read first. Both sides
correctly said Purchase, through Checkout. They differed on what to read second:

- **Without Atlas** → `src/widgets/cart-summary/index.ts`, the cart display.
- **With Atlas** → `src/features/inventory-sync/index.ts`, following the recorded
  `checkout depends_on inventory-sync` edge.

For a discount rule, the cart summary is the better second file: a discount
changes what the customer sees and what the order records. Inventory is only
involved if the discount depends on stock, which nobody said it did. **The
recorded dependency became a reading order, and pointed slightly away from the
change.** One Atlas answer avoided this by listing cart-summary third and
labelling it "source-discovered, not an Atlas-declared anchor" — which is
exactly the right instinct, and only one of three did it.

That is a lead about the product, not a scoring artifact: *a declared dependency
is not the same thing as the file a change will touch, and the handoff currently
presents them in one list.*

### The only made-up claim came from the side without Atlas

Across all 24 answers, one contained a statement the source does not support. A
control answer on B1 said the relevant capabilities of Coordination are
*"coordinate (changing acknowledgement state) and read (viewing
acknowledgements)"* — it had taken the permission verbs from Access Control
("who may read, coordinate, or administer") and reused them as capability names
in a different domain. Every Atlas answer named the capabilities that exist.

One case is not a rate. It is worth watching because it is the failure a written
vocabulary is supposed to prevent.

## What this does not settle

- **The fixture gives the control side a strong prose brief.** The source is four
  one-line files; all the meaning lives in the subject's own README and product
  document — [`tests/fixtures/meaning-corpus/commerce-fsd/docs/PRODUCT.md`](../../tests/fixtures/meaning-corpus/commerce-fsd/docs/PRODUCT.md)
  — which both sides read. So this compares a vault against good product prose,
  not a vault against code. That is the same condition
  [the 2026-08-25 findings](FINDINGS-2026-08-25.md) named on this repository, and
  it is still not resolved.
- **Twelve answers per side on two tiny subjects** cannot establish an effect.
- **Nothing here costs in what it takes to build and maintain a vault.**
- **A model graded it.** The next pass has to be a person.

## What to do about it

1. **Have a person grade the same packet.** `pnpm benchmark:blind-set
   --run-id=2026-08-31-gb-r3` regenerates it byte for byte. Compare the two
   gradings; where they disagree is where the criteria are unclear.
2. **Look at the G1 reading order as a product question.** Should a handoff
   present a declared dependency and a likely-touched file in the same list, in
   the same voice? This run says an agent follows the edge.
3. **Do not put any of these numbers in the README.** The public claim stays
   where the correction left it until a person has read the answers.
