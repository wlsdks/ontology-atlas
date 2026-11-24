import type { Box, Point } from "../../dial/dial-shapes";
import { crowdShare, LIT_DOT_SHARE, ORPHAN_ROOM } from "../marks";
import { openedElements } from "../open";
import { candidates, degreeOf, type Candidate } from "./candidates";
import { leaderSegment, linePolylines, linesCross, segmentCrossesBox } from "./lit-lines";
import { chooseSide, elementDotRadius, isStarMember, openDomainStar } from "./sides";
import { CELL_PX, grown, Occupancy, StepOccupancy, stepScale, sweptBox, worldBox } from "./zoom-step";
import { blockAbove, domainBlock, domainReachLine, hubCaptionBox, orphanCaption, projectName, titleMayRise } from "./titles";
import type { NameAdmission, NameInput, PlacedName } from "./placed-name";


/** Air, px, the selection's name keeps from every disc not its own. */
const SELECTED_NAME_AIR_PX = 8;
/** The axes a free map may cut an open star's rim along. */
const AXES = ["x", "y"] as const;

/** The highest side cost with no dot of the open star under the name. */
const CLEAR_SIDE = 3;

/** How many capabilities a folded star names at rest: its most connected ones stand for the mass. */
const FOLDED_STAR_NAMES = 2;

export function admit(input: NameInput, step: number, seed: NameAdmission | null, ceiling: ReadonlySet<string> | null): NameAdmission {
  const { model, layout, tokens } = input;
  const floor = input.zoomFloorScale ?? 0;
  const scale = Math.max(floor, stepScale(step, tokens.zoomStepsPerOctave));
  // Names are held apart at both ends of the step and its centre, so two a step admits apart stay apart
  // inside it; the step that holds the camera's floor ends there, since no zoom below it is drawn.
  const lowest = Math.max(floor, stepScale(step - 0.5, tokens.zoomStepsPerOctave));
  const highest = stepScale(step + 0.5, tokens.zoomStepsPerOctave);
  const span = (at: Point, rel: Box) => sweptBox(at, rel, lowest, highest);
  const grid = new Occupancy(CELL_PX / scale);
  const stepScales = [lowest, scale, highest] as const;
  const titles = new StepOccupancy(stepScales);
  const words = new StepOccupancy(stepScales);
  const conceptNames = new StepOccupancy(stepScales);
  const glyphs: Box[] = [];
  /** Leaders set down so far, in world units: a name set later keeps its glyphs off them. */
  const leaders: [number, number, number, number][] = [];
  const names: PlacedName[] = [];
  const ids = new Set<string>();
  const sides = new Map<string, number>();
  const discs: [string, number][] = [];
  if (model.projectId !== null && layout.positions.has(model.projectId)) discs.push([model.projectId, input.discRadius(model.projectId)]);
  for (const c of layout.clusters) {
    discs.push([c.domainId, input.discRadius(c.domainId)]);
    for (const it of c.items) if (!it.direct) discs.push([it.id, input.discRadius(it.id)]);
  }
  for (const id of layout.orphanIds) discs.push([id, input.discRadius(id)]);
  const selectedId = input.selected ? input.focusId : null;
  const marks = new Occupancy(CELL_PX / scale);
  // A fanned name may cross a disc the selection has sunk; it keeps off every disc still lit.
  const litMarks = new Occupancy(CELL_PX / scale);
  for (const [id, r] of discs) {
    // A disc and the name beside it share an anchor and scale together, so discs keep their box at the step's own scale.
    const box = worldBox(layout.positions.get(id)!, { minX: -r, maxX: r, minY: -r, maxY: r }, scale);
    grid.add(box);
    marks.add(box);
    if (input.lit?.has(id)) litMarks.add(box);
  }
  const ringCentre = selectedId !== null ? layout.positions.get(selectedId) ?? null : null;
  const ringRadius = selectedId !== null ? (input.discRadius(selectedId) + tokens.selectedRingGapPx + tokens.selectedRingPx) / scale : 0;
  // The ring is a circle: a name beside it on a diagonal is clear of it, which its bounding box would deny.
  const onRing = (at: Point, group: readonly PlacedName[]) => ringCentre !== null && group.some((n) => {
    const b = worldBox(at, n.box, scale);
    const dx = Math.max(b.minX - ringCentre.x, 0, ringCentre.x - b.maxX);
    const dy = Math.max(b.minY - ringCentre.y, 0, ringCentre.y - b.maxY);
    return dx * dx + dy * dy < ringRadius * ringRadius;
  });
  const fan = input.selected ? openedElements(model, layout, input.focusId, tokens, input.focusId === null ? 0 : input.discRadius(input.focusId), scale, input.growth) : null;
  const fanCentre = fan ? layout.positions.get(fan.capabilityId)! : null;
  // A fanned element is anchored where the fan draws it, in world units at the step's own scale.
  const anchor = (id: string): Point => {
    const offset = fan?.offsets.get(id);
    return offset ? { x: fanCentre!.x + offset.x / scale, y: fanCentre!.y + offset.y / scale } : layout.positions.get(id)!;
  };
  if (fan) {
    // A fanned dot is a mark a name keeps off while any side is clear of it; a forced name with none may still stand.
    for (const id of fan.offsets.keys()) {
      const r = elementDotRadius(input, id) / scale;
      const at = anchor(id);
      const box = { minX: at.x - r, maxX: at.x + r, minY: at.y - r, maxY: at.y + r };
      marks.add(box);
      litMarks.add(box);
    }
  }
  // A resting element dot never crowds a name, so the overview names over dots. An open domain star
  // keeps names off the dots it grows, at their opened radius; a capability's star off every dot,
  // a lit one standing out. O(elements).
  const starDots = new Occupancy(CELL_PX / scale);
  const keepOffDot = (id: string) => {
    const r = input.discRadius(id) * (input.lit?.has(id) === true ? LIT_DOT_SHARE : 1);
    const at = layout.positions.get(id);
    if (!at || fan?.offsets.has(id)) return;
    starDots.add(worldBox(at, { minX: -r, maxX: r, minY: -r, maxY: r }, scale));
  };
  const starDomain = openDomainStar(input);
  if (starDomain !== null) {
    const d = model.domainById.get(starDomain)!;
    for (const capId of d.capabilityIds) for (const id of model.capabilityById.get(capId)?.elementIds ?? []) keepOffDot(id);
    for (const id of d.directElementIds) keepOffDot(id);
  } else if ((input.openStarId ?? null) !== null) {
    for (const id of model.capabilityOf.keys()) keepOffDot(id);
    for (const d of model.domains) for (const id of d.directElementIds) keepOffDot(id);
  }
  const place = (n: PlacedName) => {
    const at = anchor(n.id);

    grid.add(worldBox(at, n.box, scale));
    words.add(at, n.box);
    glyphs.push(worldBox(at, grown(n.box, -tokens.namePadPx), scale));
    if (n.leader) {
      const s = leaderSegment(n, Math.abs(n.dx) - tokens.nameGapPx, tokens.namePadPx);
      leaders.push([at.x + s.x0 / scale, at.y + s.y0 / scale, at.x + s.x1 / scale, at.y + s.y1 / scale]);
    }
    names.push(n);
    ids.add(n.id);
  };
  /**
   * The least air, in px, between the glyphs of a group's names at `at` and a disc not its own at any
   * of `scales`, measured to the circle as the frame does; below zero over a disc. O(discs × scales).
   */
  const discAirPx = (at: Point, group: readonly PlacedName[], scales: readonly number[]) => {
    let air = Infinity;
    for (const n of group) {
      for (const [id, r] of discs) {
        if (id === n.id) continue;
        const p = layout.positions.get(id)!;
        for (const s of scales) {
          const b = worldBox(at, grown(n.box, -tokens.namePadPx), s);
          air = Math.min(air, Math.hypot(Math.max(b.minX - p.x, 0, p.x - b.maxX), Math.max(b.minY - p.y, 0, p.y - b.maxY)) * s - r);
        }
      }
    }
    return air;
  };
  // Each disc filed at the step's lowest scale, the widest it stands in world units anywhere in the step.
  const stepDiscs = new Occupancy<Box & { id: string; at: Point; r: number }>(CELL_PX / lowest);
  for (const [id, r] of discs) {
    const p = layout.positions.get(id)!;
    const w = r / lowest;
    stepDiscs.add({ id, at: p, r, minX: p.x - w, maxX: p.x + w, minY: p.y - w, maxY: p.y + w });
  }
  /**
   * Whether the glyphs of a group's names at `at` keep clear of every disc not their own at both ends
   * and the centre of the step: `discAirPx` at the step's scales never below zero, read only from the
   * discs filed under the glyphs' swept box. O(discs near the group × scales).
   */
  const offDiscsInStep = (at: Point, group: readonly PlacedName[], air = 0) => !group.some((n) => {
    const glyphs = grown(n.box, -tokens.namePadPx);
    return stepDiscs.some(span(at, glyphs), (d) => d.id !== n.id && stepScales.some((s) => {
      const b = worldBox(at, glyphs, s);
      return Math.hypot(Math.max(b.minX - d.at.x, 0, d.at.x - b.maxX), Math.max(b.minY - d.at.y, 0, d.at.y - b.maxY)) * s < d.r + air;
    }));
  });
  // A caption ranks lowest and gives way to every disc anywhere in the step, at rest and in the overview.
  const captionOnDisc = (n: PlacedName) => discAirPx(layout.positions.get(n.id)!, [n], stepScales) < 0;
  const project = projectName(input);
  if (project) place(project);
  const projectBox = project ? worldBox(layout.positions.get(project.id)!, project.box, scale) : null;
  const hubRow = hubCaptionBox(input);
  if (hubRow) {
    const hubAt = layout.positions.get(model.projectId!)!;
    grid.add(worldBox(hubAt, hubRow, scale));
    words.add(hubAt, hubRow);
    titles.add(hubAt, hubRow);
  }
  const polylines = input.lit !== null && input.lines.length > 0 ? linePolylines(input.lines, layout, tokens, scale, input.growth, input.discRadius) : [];
  const crossed = (at: Point, group: readonly PlacedName[]) => group.some((n) => linesCross(polylines, span(at, n.box)));
  // An open domain star draws a line from its disc to each member, lit or not: a member's name keeps off it as off a lit line.
  const spokes: [number, number, number, number][] = [];
  const hubAt = starDomain === null ? undefined : layout.positions.get(starDomain);
  if (hubAt) for (const id of model.domainById.get(starDomain!)!.capabilityIds) {
    const p = layout.positions.get(id);
    if (p) spokes.push([hubAt.x, hubAt.y, p.x, p.y]);
  }
  const onSpoke = (at: Point, group: readonly PlacedName[]) => group.some((n) => {
    const b = span(at, n.box);
    return spokes.some(([x0, y0, x1, y1]) => segmentCrossesBox(x0, y0, x1, y1, b));
  });
  for (const c of layout.clusters) {
    let block = domainBlock(input, c.domainId, domainReachLine(input, c.domainId), layout.compactTitles && input.focusId !== c.domainId);
    if (titleMayRise(input, c.domainId) && polylines.length > 0) {
      const at = layout.positions.get(c.domainId)!;
      const above = blockAbove(block);
      const onDisc = above.some((n) => grid.hits(worldBox(at, n.box, scale)));
      if (crossed(at, block) && !crossed(at, above) && !onDisc) block = above;
    }
    for (const n of block) {
      const box = worldBox(layout.positions.get(n.id)!, n.box, scale);
      // The census row is the one line of a title block that may go: it gives way to the project's name.
      if (n.role === "units" && projectBox !== null && box.minX < projectBox.maxX && projectBox.minX < box.maxX && box.minY < projectBox.maxY && projectBox.minY < box.maxY) continue;
      titles.add(layout.positions.get(n.id)!, n.box);
      // A caption over a disc still holds its row, so the names around it stay as they would.
      if ((n.role === "units" || n.role === "reach") && captionOnDisc(n)) {
        grid.add(box);
        words.add(layout.positions.get(n.id)!, n.box);
        continue;
      }
      // A title a lit line runs through draws on its backing, so the line passes under it rather than through it.
      place(polylines.length > 0 && crossed(layout.positions.get(n.id)!, [n]) ? { ...n, backed: true } : n);
    }
  }
  const caption = orphanCaption(input, scale);
  if (caption) {
    grid.add(worldBox(layout.positions.get(caption.id)!, caption.box, scale));
    words.add(layout.positions.get(caption.id)!, caption.box);
    names.push(caption);
  }
  const pending = candidates(input, degreeOf(model), scale, fan);
  // The overview fit pads the extent by the domain name size; a name past that pad would leave the
  // free map. Checked at the smallest scale this step stands for, so the whole step stays inside.
  const reach = tokens.domainNamePx / lowest;
  const inside = (at: Point, group: readonly PlacedName[]) => group.every((n) => {
    const b = worldBox(at, n.box, lowest);
    const e = layout.extent;
    return b.minX >= e.minX - reach && b.maxX <= e.maxX + reach && b.minY >= e.minY - reach && b.maxY <= e.maxY + reach;
  });
  const hits = (on: StepOccupancy, at: Point, group: readonly PlacedName[]) => group.some((n) => on.hits(at, n.box));
  // Clear of every disc and dot at the radius it stands at once the step's star has opened, across the whole step.
  const offAllMarks = (at: Point, group: readonly PlacedName[]) => !group.some((n) => stepScales.some((s) => {
    const box = worldBox(at, n.box, s);
    return marks.hits(box) || starDots.hits(box);
  }));
  const crowding = (at: Point, group: readonly PlacedName[]) => group.reduce((sum, n) => sum + grid.count(worldBox(at, n.box, scale)), 0);
  const offTitles = (at: Point, group: readonly PlacedName[], gap = tokens.selectedTitleGapPx) =>
    !group.some((n) => titles.hits(at, grown(n.box, gap)));
  // Both boxes carry the name pad; the test box gives up one, so two names keep one pad of air between their glyphs.
  const overprints = (at: Point, group: readonly PlacedName[]) => group.some((n) => conceptNames.hits(at, grown(n.box, -tokens.namePadPx)));
  // A lit name takes the first side no lit line crosses. Under a lit picture a forced name other than
  // the selection and the agent's focus keeps to the sides clear of title blocks when any is, and
  // drops when each of those prints over a concept's name; an element also keeps off discs and the ring.
  // A leader may not run through a name already set down, nor a name over a leader already set down.
  // O(names) per off-row try, O(leaders) per try.
  const leaderClearAt = (at: Point, group: readonly PlacedName[]) => !group.some((n) => {
    if (leaders.length > 0) {
      const b = worldBox(at, grown(n.box, -tokens.namePadPx), scale);
      if (leaders.some(([x0, y0, x1, y1]) => segmentCrossesBox(x0, y0, x1, y1, b))) return true;
    }
    if (!n.leader) return false;
    const s = leaderSegment(n, Math.abs(n.dx) - tokens.nameGapPx, tokens.namePadPx);
    return glyphs.some((b) => segmentCrossesBox(at.x + s.x0 / scale, at.y + s.y0 / scale, at.x + s.x1 / scale, at.y + s.y1 / scale, b));
  });
  const tryPlace = (cand: Candidate, force: boolean, mayOverprint = force) => {
    const at = anchor(cand.id);
    const all = cand.tries();
    const kept = seed?.sides.get(cand.id);
    // A name the step below placed tries that side first, so names do not trade sides and crowd one another out.
    const tries = kept !== undefined && kept > 0 && kept < all.length ? [all[kept]!, ...all.slice(0, kept), ...all.slice(kept + 1)] : all;
    const lit = polylines.length > 0 && input.lit!.has(cand.id);
    const yields = input.lit !== null && cand.id !== input.focusId && cand.id !== input.agentFocusId;
    const keepsOffTitles = cand.id === selectedId || (cand.element && input.lit !== null);
    const offRing = (group: readonly PlacedName[]) => !(yields && cand.element) || !onRing(at, group);
    const leaderClear = (group: readonly PlacedName[]) => leaderClearAt(at, group);
    // Names are tested against names at the step's ends and centre; a disc's box at the step's own scale.
    const discs = fan?.offsets.has(cand.id) ? litMarks : marks;
    // With no mark grown the frame draws a name as admitted, at whatever zoom of the step it rests, so a capability's name keeps off every disc not its own across the step.
    // The selection's name keeps clear air from every other disc, so it never reads as a neighbour's name.
    const nameAir = cand.id === selectedId ? SELECTED_NAME_AIR_PX : 0;
    const offDiscs = (group: readonly PlacedName[]) => (cand.element && nameAir === 0) || offDiscsInStep(at, group, nameAir);
    // A fanned name stands on a row the fan laid out for it, so it keeps off a title's glyphs, not the air round them.
    const titleGap = fan?.offsets.has(cand.id) === true ? 0 : tokens.selectedTitleGapPx;
    // The camera frames a selection with every side its name may take and its fan's names, so those may stand past the overview's pad.
    const within = (group: readonly PlacedName[]) => cand.id === selectedId || fan?.offsets.has(cand.id) === true || inside(at, group);
    // A fanned name rides its dot, which the fan sets a fixed px from the disc at every zoom: its rows
    // stand a name apart at the step's own scale and would close up at the step's far end, so it is
    // tested against names there alone.
    const fanned = fan?.offsets.has(cand.id) === true;
    const onWords = (group: readonly PlacedName[]) => fanned ? group.some((n) => words.hitsAtCentre(at, n.box)) : hits(words, at, group);
    const free = (group: readonly PlacedName[]) => within(group) && !group.some((n) => discs.hits(worldBox(at, n.box, scale))) && !onWords(group) && (!keepsOffTitles || offTitles(at, group, titleGap)) && offRing(group) && leaderClear(group) && offDiscs(group);
    // A fanned name keeps its own row over a resting dot of another capability's; its row is the fan's, laid out for it alone.
    const offStarDots = (group: readonly PlacedName[]) => free(group) && (fanned || !group.some((n) => starDots.hits(worldBox(at, n.box, scale))));
    // A fanned name crossed by a lit line keeps its row and draws on its backing; other names look for a side the line leaves.
    const litCrossed = (group: readonly PlacedName[]) => !fanned && lit && crossed(at, group);
    // A selected capability whose fan has opened keeps its name centred above its disc, the same place in
    // every scene, unless a title, a disc or the ring is there; then it takes the first side clear. A lit
    // line under it is cut out round its words, so it no longer moves the name.
    const above = cand.id === selectedId && fan !== null ? all[0] : undefined;
    const steady = above !== undefined && within(above) && offTitles(at, above, 0) && !onRing(at, above) && leaderClear(above)
      && !above.some((n) => discs.hits(worldBox(at, n.box, scale))) && offDiscsInStep(at, above, SELECTED_NAME_AIR_PX)
      ? { side: above, backed: false }
      : null;
    // Only a forced name may stand on an element dot of an open star; a forced name across a lit line draws on its backing.
    let chosen = steady ?? chooseSide(tries, offStarDots, litCrossed) ?? (force ? chooseSide(tries, free, litCrossed) : null);
    // A forced name with no side clear across the whole step takes one clear at the step's own scale.
    if (!chosen && force) {
      const clearNow = (group: readonly PlacedName[]) => within(group) && !group.some((n) => grid.hits(worldBox(at, n.box, scale)))
        && (!keepsOffTitles || !group.some((n) => titles.hitsAtCentre(at, grown(n.box, tokens.selectedTitleGapPx)))) && offRing(group) && leaderClear(group) && offDiscs(group);
      chosen = chooseSide(tries, clearNow, litCrossed);
    }
    let fit = chosen?.side;
    let backed = force && chosen?.backed === true;
    // A name carried up from the step below may stand beside a disc that drifted onto its side, never on another name.
    const apartFromNames = (group: readonly PlacedName[]) => inside(at, group) && !hits(words, at, group) && leaderClear(group);
    if (!fit && force && !mayOverprint) fit = (chooseSide(tries, (group) => apartFromNames(group) && offAllMarks(at, group), () => false) ?? chooseSide(tries, apartFromNames, () => false))?.side;
    // The selection's name with no side clear keeps off the lit lines first: on its backing over a resting
    // disc it still reads, while a lit line through it reads as one struck out.
    if (!fit && cand.id === selectedId) {
      const uncrossed = tries.filter((group) => within(group) && !hits(words, at, group) && leaderClear(group)
        && offTitles(at, group, tokens.selectedTitleGapPx) && !onRing(at, group) && !crossed(at, group));
      if (uncrossed.length > 0) {
        fit = uncrossed.reduce((best, group) => (discAirPx(at, group, stepScales) > discAirPx(at, best, stepScales) ? group : best));
        backed = !offAllMarks(at, fit);
      }
    }
    if (!fit && mayOverprint && tries.length > 0) {
      const apart = yields ? tries.filter((group) => !hits(words, at, group) && leaderClear(group) && (!cand.element || (offTitles(at, group) && offRing(group)))) : [];
      const offMarks = apart.filter((group) => offAllMarks(at, group));
      const clear = tries.filter((group) => offTitles(at, group, cand.id === selectedId ? tokens.selectedTitleGapPx : 0));
      const offTitle = clear.length > 0 ? clear : tries;
      const kept = yields ? offTitle.filter((group) => !overprints(at, group) && leaderClear(group)) : offTitle;
      // The focus's name the frame never hides takes a side off every other disc across the step where one is.
      const offAllDiscs = yields || cand.element ? [] : kept.filter((group) => offDiscsInStep(at, group));
      const legible = offAllDiscs.length > 0 ? offAllDiscs : kept;
      // A capability with no side off every mark takes, on its backing, the side apart from names that
      // stands furthest off the discs across the step, if clear of them at the step's own scale.
      const offDiscsNow = cand.element ? [] : apart.filter((group) => discAirPx(at, group, [scale]) >= 0);
      if (offMarks.length === 0 && offDiscsNow.length > 0) {
        fit = offDiscsNow.reduce((best, group) => (discAirPx(at, group, stepScales) > discAirPx(at, best, stepScales) ? group : best));
        backed = !offAllMarks(at, fit) || crossed(at, fit);
      } else {
        const pool = offMarks.length > 0 ? offMarks : cand.element && yields ? [] : apart.length > 0 ? apart : legible;
        fit = pool.length > 0 ? pool.reduce((best, group) => (crowding(at, group) < crowding(at, best) ? group : best)) : undefined;
      }
    }
    if (fit && fanned && lit && crossed(at, fit)) backed = true;
    if (fit && backed) for (const n of fit) n.backed = true;
    if (fit) sides.set(cand.id, all.indexOf(fit));
    // A forced name standing on an open star's dots draws on its plate, which covers them.
    if (fit && (input.openStarId ?? null) !== null && fit.some((n) => stepScales.some((s) => starDots.hits(worldBox(at, n.box, s))))) for (const n of fit) n.backed = true;
    if (fit) for (const n of fit) {
      place(n);
      conceptNames.add(at, n.box);
    }
  };
  const alternates = new Map<string, PlacedName[]>();
  const fallbacks = new Map<string, PlacedName[]>();
  const sideCosts: number[] = [];
  /**
   * Each side of an open star's member: -1 over a name, a disc or a leader's path, else lower for a
   * side clear of its star's dots (`CLEAR_SIDE` and below), clear of the lit lines and inside the
   * overview's extent, which does not bound an opened star's camera. Returns how many sides are
   * acceptable, only clear ones when `clearOnly`.
   */
  const memberCosts = (at: Point, all: readonly PlacedName[][], clearOnly: boolean): number => {
    sideCosts.length = all.length;
    let open = 0;
    for (let i = 0; i < all.length; i += 1) {
      const group = all[i]!;
      // Across the whole step, as names are held apart: the zoom may rest anywhere inside it.
      if (hits(words, at, group) || group.some((n) => stepScales.some((s) => marks.hits(worldBox(at, n.box, s)))) || !leaderClearAt(at, group)) {
        sideCosts[i] = -1;
        continue;
      }
      const dots = group.reduce((sum, n) => sum + Math.max(...stepScales.map((s) => starDots.count(worldBox(at, n.box, s)))), 0);
      sideCosts[i] = dots * 4 + (crossed(at, group) ? 2 : 0) + (inside(at, group) ? 0 : 1);
      if (!clearOnly || sideCosts[i]! <= CLEAR_SIDE) open += 1;
    }
    return open;
  };
  type Member = { id: string; at: Point; all: PlacedName[][] };
  /**
   * Whether a member's side keeps its name on the hub's side of its disc along `axis`, as the free map
   * needs where it cuts the star's rim on that axis: admission cannot see the free map, and while the
   * cut still holds the disc it holds such a name. True on an axis the disc does not stand off. O(side).
   */
  const towardHub = (id: string, at: Point, group: readonly PlacedName[], axis: "x" | "y") => {
    if (!hubAt) return true;
    const edge = input.discRadius(id) + tokens.namePadPx;
    const off = Math.sign(axis === "x" ? at.x - hubAt.x : at.y - hubAt.y);
    return group.every((n) => {
      const [min, max] = axis === "x" ? [n.box.minX, n.box.maxX] : [n.box.minY, n.box.maxY];
      return off > 0 ? max <= edge : off < 0 ? min >= -edge : true;
    });
  };
  /** Whether `group` at `at` rules out `side` at `sideAt`, as `memberCosts` would: over it anywhere in the step, or across its leader. */
  const takesSide = (at: Point, group: readonly PlacedName[], sideAt: Point, side: readonly PlacedName[]) => side.some((o) => group.some((n) => {
    for (const s of stepScales) {
      const a = worldBox(at, n.box, s);
      const b = worldBox(sideAt, o.box, s);
      if (a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY) return true;
    }
    if (!o.leader) return false;
    const seg = leaderSegment(o, Math.abs(o.dx) - tokens.nameGapPx, tokens.namePadPx);
    return segmentCrossesBox(sideAt.x + seg.x0 / scale, sideAt.y + seg.y0 / scale, sideAt.x + seg.x1 / scale, sideAt.y + seg.y1 / scale, worldBox(at, grown(n.box, -tokens.namePadPx), scale));
  }));
  const placedMembers: Member[] = [];
  /**
   * Each other member's open sides toward the hub, per axis: an unplaced member's acceptable sides, a
   * placed one's alternates while its own side runs away from the hub on that axis. Overwrites
   * `sideCosts`. O(members × sides × cells touched).
   */
  const towardSidesOfOthers = (self: Member, unplaced: readonly Member[]) => {
    const out: { at: Point; sides: PlacedName[][] }[] = [];
    for (const o of unplaced) {
      if (o === self || ids.has(o.id)) continue;
      memberCosts(o.at, o.all, false);
      const acceptable = o.all.filter((_, i) => sideCosts[i]! >= 0);
      for (const axis of AXES) {
        const open = acceptable.filter((group) => towardHub(o.id, o.at, group, axis));
        if (open.length > 0) out.push({ at: o.at, sides: open });
      }
    }
    for (const o of placedMembers) {
      for (const axis of AXES) {
        if (towardHub(o.id, o.at, o.all[sides.get(o.id)!]!, axis)) continue;
        const open = (alternates.get(o.id) ?? []).filter((n) => towardHub(o.id, o.at, [n], axis)).map((n) => [n]);
        if (open.length > 0) out.push({ at: o.at, sides: open });
      }
    }
    return out;
  };
  /**
   * Names a member on its cheapest side, backed over dots or a line it crosses; its other sides go off
   * every line first. Among cheapest sides that gain no leader it takes the one that leaves the most
   * other members a side toward the hub on each axis, the last a free map cutting the star still
   * holds. The first side ignores spokes: off one it can take a neighbour's last side inside the free
   * map. A placed member's alternates the new name covers are dropped, so the frame never swaps one in
   * under it. O(sides × (log sides + cells touched) + members × sides × (cells touched + ties)), the
   * members' term only when two or more cheapest sides tie.
   */
  const placeMember = (member: Member, unplaced: readonly Member[]) => {
    const { id, at, all } = member;
    memberCosts(at, all, false);
    const costs = sideCosts.slice();
    const open = all.flatMap((_, i) => (costs[i]! >= 0 ? [i] : [])).sort((a, b) => costs[a]! - costs[b]! || a - b);
    const leads = (i: number) => all[i]!.some((n) => n.leader === true);
    const cheapest = open[0]!;
    const ties = open.filter((i) => costs[i] === costs[cheapest] && (!leads(i) || leads(cheapest)));
    let best = cheapest;
    if (ties.length > 1) {
      const needs = towardSidesOfOthers(member, unplaced);
      let fewest = Infinity;
      for (const i of ties) {
        const taken = needs.reduce((sum, o) => sum + (o.sides.every((side) => takesSide(at, all[i]!, o.at, side)) ? 1 : 0), 0);
        if (taken < fewest) [best, fewest] = [i, taken];
        if (taken === 0) break;
      }
    }
    const lined = (i: number) => crossed(at, all[i]!) || onSpoke(at, all[i]!);
    const backs = (i: number) => costs[i]! > CLEAR_SIDE || lined(i);
    const order = (i: number) => costs[i]! + (lined(i) && !crossed(at, all[i]!) ? 2 : 0);
    sides.set(id, best);
    for (const n of all[best]!) {
      if (backs(best)) n.backed = true;
      place(n);
      conceptNames.add(at, n.box);
    }
    for (const o of placedMembers) {
      const kept = alternates.get(o.id)?.filter((n) => !takesSide(at, all[best]!, o.at, [n]));
      if (kept && kept.length > 0) alternates.set(o.id, kept);
      else alternates.delete(o.id);
    }
    placedMembers.push(member);
    const others = all.flatMap((group, i) => (i !== best && costs[i]! >= 0 && group.length === 1 ? [i] : []))
      .sort((a, b) => order(a) - order(b) || a - b)
      .map((i) => {
        if (backs(i)) all[i]![0]!.backed = true;
        return all[i]![0]!;
      });
    if (others.length > 0) alternates.set(id, others);
  };
  /**
   * Names the open star's members, the one with the fewest acceptable sides first, so a member with
   * room on several sides leaves a crowded neighbour its one side. Clear sides go first; a member with
   * none takes, in a second round, a backed side. Every member's sides left over become its fallbacks.
   * O(members² × sides × cells touched).
   */
  const placeStarMembers = () => {
    const members: Member[] = pending.filter((c) => !ids.has(c.id) && isStarMember(input, c.id)).map((c) => ({ id: c.id, at: anchor(c.id), all: c.tries() }));
    for (const clearOnly of [true, false]) {
      for (;;) {
        let pick: Member | null = null;
        let fewest = Infinity;
        for (const m of members) {
          if (ids.has(m.id)) continue;
          const open = memberCosts(m.at, m.all, clearOnly);
          if (open > 0 && open < fewest) {
            fewest = open;
            pick = m;
          }
        }
        if (pick === null) break;
        placeMember(pick, members);
      }
    }
    for (const m of members) {
      const chosen = ids.has(m.id) ? m.all[sides.get(m.id)!] : undefined;
      const kept = new Set(alternates.get(m.id) ?? []);
      const rest = m.all.flatMap((group) => (group !== chosen && group.length === 1 && group[0]!.leader !== true && !kept.has(group[0]!) ? [group[0]!] : []));
      if (rest.length > 0) fallbacks.set(m.id, rest);
    }
  };
  // The focus wins over every name, then its fan's elements, then capabilities over elements.
  const ahead = (cand: Candidate) => cand.id === input.focusId || !cand.element;
  // A name the step below showed stays wherever a side is clear of names; with none it goes, and still counts against its star.
  if (seed) for (const cand of pending) if (seed.ids.has(cand.id)) tryPlace(cand, true, false);
  for (const cand of pending) if (!ids.has(cand.id) && cand.id === input.focusId) tryPlace(cand, true);
  // The fan's rows are laid out for its own elements' names, which have no other row: they go next.
  // Top row first, so a name that leaves its row for the next takes room no earlier row needed.
  if (fan) for (const cand of pending.filter((c) => fan.offsets.has(c.id)).sort((a, b) => fan.offsets.get(a.id)!.y - fan.offsets.get(b.id)!.y)) if (!ids.has(cand.id)) tryPlace(cand, true);
  for (const cand of pending) if (!ids.has(cand.id) && input.named.has(cand.id) && ahead(cand)) tryPlace(cand, true);
  if (starDomain !== null) placeStarMembers();
  if (input.lit !== null) for (const cand of pending) if (!ids.has(cand.id) && !cand.element && input.lit.has(cand.id) && !isStarMember(input, cand.id)) tryPlace(cand, false);
  for (const cand of pending) if (!ids.has(cand.id) && input.named.has(cand.id)) tryPlace(cand, true);
  // A folded star is a mass: at rest it names only its most connected few, and a folded orphan group none.
  const folded = (roomKey: string) => crowdShare(layout, roomKey, tokens, lowest, input.growth) < 1;
  const restNames = new Map<string, number>();
  const starOf = (id: string) => (model.capabilityById.has(id) ? model.domainOf.get(id) ?? null : null);
  const countName = (id: string) => {
    const domainId = starOf(id);
    if (domainId !== null) restNames.set(domainId, (restNames.get(domainId) ?? 0) + 1);
  };
  for (const id of ids) countName(id);
  if (seed) for (const id of seed.ids) if (!ids.has(id)) countName(id);
  const orphanIds = new Set(layout.orphanIds);
  const overBudget = (cand: Candidate) => {
    if (cand.element || input.lit?.has(cand.id)) return false;
    if (orphanIds.has(cand.id)) return folded(ORPHAN_ROOM);
    const domainId = starOf(cand.id);
    return domainId !== null && (restNames.get(domainId) ?? 0) >= FOLDED_STAR_NAMES && folded(domainId);
  };
  for (const cand of pending) {
    if (ids.has(cand.id) || (ceiling && !ceiling.has(cand.id))) continue;
    const forced = cand.id === input.focusId || cand.id === input.agentFocusId;
    if (!forced && overBudget(cand)) continue;
    tryPlace(cand, forced);
    if (ids.has(cand.id)) countName(cand.id);
  }
  if (polylines.length > 0) {
    for (const n of names) if (input.lit!.has(n.id) && crossed(anchor(n.id), [n])) n.backed = true;
  }
  // A held or fanned name that found no side clear of every mark draws on the canvas ground over the mark it crosses.
  for (const n of names) {
    const keeps = n.id === input.focusId || input.named.has(n.id) || fan?.offsets.has(n.id) === true;
    if ((n.role === "capability" || n.role === "element") && keeps && !offAllMarks(anchor(n.id), [n])) n.backed = true;
  }
  const anchors = new Map<string, Point>();
  if (fan) for (const id of fan.offsets.keys()) anchors.set(id, anchor(id));
  return { step, names, ids, sides, anchors, alternates, fallbacks };
}
