import { describe, expect, it } from 'vitest';
import {
  DENSE_OVERVIEW_EDGE_COUNT,
  DENSE_OVERVIEW_EDGE_LOD_RATIO,
  shouldHideDenseOverviewEdge,
} from './reducer-edge-lod';
import type { SigmaNodeAttrs } from './graph-build';

function attrs(overrides: Partial<SigmaNodeAttrs> = {}): SigmaNodeAttrs {
  return {
    x: 0,
    y: 0,
    size: 4,
    label: 'Node',
    color: '',
    borderColor: '',
    outerBorderColor: '',
    projectSlug: 'node',
    categoryId: 'ontology',
    isHub: false,
    ownerKey: 'unassigned',
    isOntology: true,
    ...overrides,
  };
}

describe('shouldHideDenseOverviewEdge', () => {
  it('keeps small graphs fully connected in overview', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT - 1,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs(),
        target: attrs(),
      }),
    ).toBe(false);
  });

  it('keeps all edges when the user has zoomed in enough to inspect relations', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO - 0.01,
        source: attrs(),
        target: attrs(),
      }),
    ).toBe(false);
  });

  it('still treats mid-zoom as overview so saved camera state does not revive the dense web', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: 0.45,
        source: attrs({ ontologyTopKind: 'capability' }),
        target: attrs({ ontologyTopKind: 'element' }),
      }),
    ).toBe(true);
  });

  it('treats the default fit-to-view zoom as a dense overview', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ overviewLandmark: true, ontologyTopKind: 'domain' }),
        target: attrs({ ontologyTopKind: 'capability' }),
      }),
    ).toBe(true);
  });

  it('hides dense ontology leaf edges in the default overview', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ ontologyTopKind: 'capability' }),
        target: attrs({ ontologyTopKind: 'element' }),
      }),
    ).toBe(true);
  });

  it('hides landmark-to-leaf spokes so hubs do not draw a bright fan on load', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ overviewLandmark: true }),
        target: attrs({ ontologyTopKind: 'element' }),
      }),
    ).toBe(true);
  });

  it('hides element edges even when a high-degree element became a landmark', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ overviewLandmark: true, ontologyTopKind: 'domain' }),
        target: attrs({ overviewLandmark: true, ontologyTopKind: 'element' }),
      }),
    ).toBe(true);
  });

  it('keeps skeleton edges between overview domain landmarks', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ overviewLandmark: true, ontologyTopKind: 'domain' }),
        target: attrs({ isHub: true, ontologyTopKind: 'domain' }),
      }),
    ).toBe(false);
  });

  it('does not affect project-only edges', () => {
    expect(
      shouldHideDenseOverviewEdge({
        edgeCount: DENSE_OVERVIEW_EDGE_COUNT,
        cameraRatio: DENSE_OVERVIEW_EDGE_LOD_RATIO,
        source: attrs({ isOntology: false }),
        target: attrs({ isOntology: false }),
      }),
    ).toBe(false);
  });
});
