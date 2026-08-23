# How to Read the Map

When you select a folder, dots and lines appear. However, most of the dots are the same shade of gray.

> What is this dot? What is that dot? Why are some large and others small? Why do numbers appear only on certain dots? When I zoomed in, more dots appeared. Where were they before?

The map answers these questions **not with color, but with shape, size, and position**. Once you learn it, you can read it without explanation.

## 1. Shape Indicates Type

Node types (kind) are distinguished by **shape**.

| Shape | Type | Meaning |
|---|---|---|
| Hexagonal plate | `project` | Top-level deliverable |
| Square chip (with four legs at corners) | `domain` | Functional grouping |
| Circle | `capability` | A single coherent action |
| Square with a center hole | `element` | Concrete piece |

**Why not color.** Hue cannot express order. No one knows if blue is above or below green (Bertin, *Sémiologie graphique*, 1967). However, types have an order: project ⊃ domain ⊃ capability ⊃ element. Moreover, color in this map already serves two purposes. **Brightness** conveys hierarchy, and **signal colors** (warning/error/success) convey status. If we used color for type as well, the two channels already in use would become corrupted.

Therefore, this app has no question like "What does a red node mean?" Color does not indicate type.

## 2. Size Is Determined by Two Factors

### ① Fixed Size per Type

| Type | Radius |
|---|---|
| project | 30 |
| domain | 17 |
| capability | 11 |
| element | 7 |

This ladder is fixed. **A `domain` will never appear larger than a `project`.** If it did, the hierarchy would appear inverted.

### ② Direct Child Count

Within the same type, **more direct children make it slightly larger.** It grows up to a maximum of 1.4x (to prevent exceeding the ladder above).

- **Only `domain` and `capability` grow.**
- **`project` does not grow.** Since a vault typically has only one, there is no relative to compare against.
- **`element` does not grow either.** By definition, an element is a leaf, so its child count is always 0. This means there is no information to convey, not that it signals "smallness".

Size only says "this is unusually large," but **does not say "this is unusually small."** A node with only one child still has the base size.

## 3. Numbers on Nodes

Numbers appear embossed only on `project` and `domain`. They never appear on `capability` or `element`.

**The number counts something different from size.**

| Channel | What it Counts |
|---|---|
| Node Size | **Direct** child count (immediate next level) |
| Embossed Number | **Total descendant** count (all the way down) |

Thus, the "largest node" and the "node with the largest number" may differ. This is not a bug but an intentional dual channel. Size is a signal caught by a glance; the number is a value read upon stopping. If three domains look similar in size but one has a number three times larger, it means that one is much deeper inside.

The number disappears when zoomed out (to prevent the number from becoming larger than the glyph).

## 4. Line Grammar

| Line | Meaning |
|---|---|
| Solid line | Containment: what contains what |
| Dashed line + tapered thickness (thick start, thin end) | Directed relationship (relies on · is a parent concept) |
| Dashed line + uniform thickness | Symmetric relationship (is similar to · reads together) |

This legend **always floats** in the bottom-right corner. No need to memorize it.

The **absence of tapering** is itself information: "this relationship is equal at both ends."
See [How Relationships Are Formed](/guide/relations) for details.

## 5. Appears and Disappears with Zoom (Semantic Zoom)

When you first open it, you only see the skeleton. **It's not that there is nothing else; it just hasn't been drawn yet.**

The initial view of the map is considered **1x**.

| Zoom Level | Visible Elements |
|---|---|
| 1x (initial screen) | project · domain · hub |
| From 1.5x | capability gradually appears |
| From 2.3x | element gradually appears |

"Gradually" is key. Elements don't abruptly pop out at the threshold; their alpha values blend smoothly.
**Zooming out** returns you to the skeleton view. This prevents the screen from becoming a "point soup" regardless of zoom direction.

When zoomed out, shapes gradually converge into circles, and decorations (bridges, holes) disappear because you are not close enough to distinguish types.

> **If you don't want to see code elements at all**: Open the gear icon in the bottom-left › enable the "General" view.
> This permanently collapses the element layer. Clicking a node still reveals its elements (hidden by default, revealed on click).

## 6. `+N` Chip: Collapsed Children

Parents with **more than 12 direct children** collapse the rest into a single `+N` chip. Even if a domain has 108 capabilities, the screen won't become a "label soup."

- Clicking the chip **expands only that parent**. Children spread out in a bounded disk.
- Clicking the `−` chip collapses them again.
- Expanded parents **persist in the URL** (`?open=slug1,slug2`). This allows recipients and AI agents to reproduce the same view.
- If expanded children are still dense, they get their own chips.

## 7. Clicking to Explore

**Clicking a node** highlights only that node and its direct neighbors (ego focus), dimming the rest. A small summary appears next to the node. **To see details, you must click again within that summary**. A single click does not cover the entire screen.

| Action | Result |
|---|---|
| Click | Ego focus + node-side summary |
| Drag | Move node (snaps back physically on release) |
| Right-click | Open document · Edit relationship · Copy info for AI · Find path · View details |
| `Tab` | Move to neighbor hub |
| `⌘K` | Search by name |
| `?` | List of shortcuts |
| `Esc` | Close the topmost open item |

**View only this area**: Selecting a node reveals an "View Only This Area" button outside the ring (tooltip: "See only inside this node"). Clicking it changes the map to **that node's world**. Only its containment subtree remains; everything else disappears behind a 1px indigo circle. Relationships crossing the boundary remain as short segments on the circle, listed under "N External Connections" which you can expand.
From there, you can jump to the other side's world via "View That Area Only".

While inside, a chip at the top reads "<Name> Only". Click "Full Map" or press `Esc` to return. This also persists in the URL.

## 8. What Do the Numbers in the Summary Count?

The numbers in a node summary count **only direct connections**. They are not cumulative sums across multiple steps.

| Term | Meaning |
|---|---|
| Uses | Other items directly pointing to this node |
| Needs | Other items this node directly requires |
| Source Document | The document where this concept is written |

The grouping axis is **direction**, not relationship type. If we grouped by both, the same line would be counted twice.

Lines like "Last Updated / Unchanged for a While" indicate when the node's `.md` file was last modified. This is a fact about the file, not a score generated by the map.

## 9. Address is State

Current screen state: what you selected, what you expanded, and which region you're in are all encoded in the URL.

```
/topology?open=domains/auth&realm=domains/auth
```

This leads to three consequences.

- When you send a link, the recipient sees **the same screen**.
- Back navigation works correctly.
- An AI agent can say "look at this screen." Not via screenshot,
  but via address.

## Summary

- **Shape = Type**, not color.
- **Size = Type hierarchy level × direct children count**, max 1.4x.
- **Number = total descendant count**, only for projects and domains.
- **Lines = solid (containment), tapered dashed (direction), uniform dashed (symmetry)**.
- What you don't see is **not missing, but folded**. Zoom or `+N` chip.
- Screen state is in the address.

If you click a node and the summary is empty, that's not a map issue but rather that no relations have been written in that `.md` file yet. What to write is covered in [Vault Structure](/guide/vault-structure), and how they connect is explained in [How Relations Are Created](/guide/relations).
