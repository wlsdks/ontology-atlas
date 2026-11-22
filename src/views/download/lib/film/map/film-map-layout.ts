import { annotateFilmMap } from './film-map-annotations';
import { placeFilmClusters } from './film-map-placement';
import type { FilmLayoutInput, FilmMapLayout } from './film-map-shapes';

/**
 * The film's map, laid out once per stage size and locale: the product's Flat map mark for mark,
 * placed so that no name, mark or line runs over another. Deterministic and seedless: the same
 * vault and stage give the same picture. Cost: the slot order tries every order of up to six
 * domains (d! orders, greedy beyond); label admission is O(n^2) over at most about sixty boxes.
 */
export function layoutFilmMap(input: FilmLayoutInput): FilmMapLayout {
  const placement = placeFilmClusters(input);
  const { stems, restArcs, restLabels, lit } = annotateFilmMap(input, placement);
  const { S, titleBox, captionBox, order, marks, clusters, pick, capRadius } = placement;
  return {
    sizes: S,
    w: input.w,
    h: input.h,
    titleBox,
    captionBox,
    order,
    marks,
    clusters,
    stems,
    restArcs,
    restLabels,
    lit,
    pick,
    capRadius,
  };
}
