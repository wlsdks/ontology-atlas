export const rules = [
  {
    order: 5000,
    command: 'pnpm exec playwright test tests/e2e/map-3d-relation-captions.spec.ts',
    reason: "Strata and Neural relation captions changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/relation-captions\.ts$/,
    ],
  },
  {
    order: 5001,
    command: 'pnpm exec playwright test tests/e2e/map-3d-relation-ink.spec.ts',
    reason: "the 3D relation line ink and depth fade changed",
    matches: [
      /^src\/widgets\/ontology-map\/model\/dome-view\.ts$/,
      /^src\/widgets\/ontology-map\/ui\/(?:topology-frame-draw|frame-draw\/[^/]+)\.ts$/,
    ],
  },
  {
    order: 5002,
    command: 'pnpm exec playwright test tests/e2e/map-3d-strata-drawing.spec.ts',
    reason: "the Strata view's drawing changed",
    matches: [
      /^src\/widgets\/ontology-map\/model\/strata-stage\.ts$/,
      /^src\/widgets\/ontology-map\/render\/dome-rings\.ts$/,
    ],
  },
  {
    order: 5003,
    command: 'pnpm exec playwright test tests/e2e/map-3d-strata-lod.spec.ts',
    reason: "Strata's level-of-detail draw budget and dust marks changed",
    matches: [
      /^src\/widgets\/ontology-map\/model\/strata-lod\.ts$/,
      /^src\/widgets\/ontology-map\/render\/strata-lod\.ts$/,
    ],
  },
  {
    order: 5004,
    command: 'pnpm exec playwright test tests/e2e/map-canvas-interaction-placement.spec.ts',
    reason: "where map canvas surfaces and panel rows stand changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/,
      /^src\/widgets\/ontology-map\/ui\/OntologyMapEdgePanel\.tsx$/,
    ],
  },
  {
    order: 5005,
    command: 'pnpm exec playwright test tests/e2e/map-constellation-popover-bounds.spec.ts',
    reason: "the saved constellations popover bounds changed",
    matches: [
      /^src\/widgets\/saved-constellations\/ui\/SavedConstellationsControl\.tsx$/,
    ],
  },
  {
    order: 5006,
    command: 'pnpm exec playwright test tests/e2e/map-edge-hover-card.spec.ts',
    reason: "the edge hover card placement changed",
    matches: [
      /^src\/widgets\/ontology-map\/interaction\/hover-card-placement\.ts$/,
      /^src\/widgets\/ontology-map\/ui\/OntologyMapEdgeHoverCard\.tsx$/,
    ],
  },
  {
    order: 5007,
    command: 'pnpm exec playwright test tests/e2e/map-ego-dim-labels.spec.ts',
    reason: "dimmed domain names under a selection changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/labels\.ts$/,
      /^src\/widgets\/ontology-map\/dial\/label-marks\.ts$/,
    ],
  },
  {
    order: 5008,
    command: 'pnpm exec playwright test tests/e2e/map-flat-dial-layout.spec.ts',
    reason: "the Flat dial overview layout and names changed",
    matches: [
      /^src\/widgets\/ontology-map\/dial\/layout\.ts$/,
      /^src\/widgets\/ontology-map\/dial\/label-marks\.ts$/,
    ],
  },
  {
    order: 5009,
    command: 'pnpm exec playwright test tests/e2e/map-flat-dial-motion.spec.ts',
    reason: "the Flat dial's opening motion and light changed",
    matches: [
      /^src\/widgets\/ontology-map\/dial\/frame\/frame\.ts$/,
      /^src\/widgets\/ontology-map\/light\/light-frame-stage\.ts$/,
    ],
  },
  {
    order: 5010,
    command: 'pnpm exec playwright test tests/e2e/map-flat-dial-polish.spec.ts',
    reason: "the Flat dial scope readout and ledger changed",
    matches: [
      /^src\/views\/home\/ui\/TopologyScopeReadout\.tsx$/,
      /^src\/widgets\/ontology-map\/dial\/ledger\.ts$/,
    ],
  },
  {
    order: 5011,
    command: 'pnpm exec playwright test tests/e2e/map-floor-labels.spec.ts',
    reason: "domain names at the canvas floor changed",
    matches: [
      /^src\/widgets\/ontology-map\/dial\/label-marks\.ts$/,
      /^src\/widgets\/ontology-map\/render\/label-layout\.ts$/,
    ],
  },
  {
    order: 5012,
    command: 'pnpm exec playwright test tests/e2e/map-hex-board-rest.spec.ts',
    reason: "the hex board at rest changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyHexBoardMap\.tsx$/,
      /^src\/widgets\/ontology-map\/model\/hex-board\.ts$/,
    ],
  },
  {
    order: 5013,
    command: 'pnpm exec playwright test tests/e2e/map-hex-board-room.spec.ts',
    reason: "the hex board fitting its free map changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/hex-board\.ts$/,
      /^src\/widgets\/ontology-map\/ui\/OntologyHexBoardMap\.tsx$/,
    ],
  },
  {
    order: 5014,
    command: 'pnpm exec playwright test tests/e2e/map-hex-relief.spec.ts',
    reason: "the hex board relief changed",
    matches: [
      /^src\/widgets\/ontology-map\/board\/relief-projection\.ts$/,
      /^src\/views\/home\/ui\/TopologyHexBoardSurface\.tsx$/,
    ],
  },
  {
    order: 5015,
    command: 'pnpm exec playwright test tests/e2e/map-hex-routes-free-area.spec.ts',
    reason: "hex board routes staying in the free map changed",
    matches: [
      /^src\/widgets\/ontology-map\/model\/hex-router\.ts$/,
      /^src\/widgets\/ontology-map\/interaction\/free-area\.ts$/,
    ],
  },
  {
    order: 5016,
    command: 'pnpm exec playwright test tests/e2e/map-inspector-header-chips.spec.ts',
    reason: "the node inspector header chips changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/,
    ],
  },
  {
    order: 5017,
    command: 'pnpm exec playwright test tests/e2e/map-label-collision.spec.ts',
    reason: "map label collision changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/label-layout\.ts$/,
      /^src\/widgets\/ontology-map\/render\/labels\.ts$/,
    ],
  },
  {
    order: 5018,
    command: 'pnpm exec playwright test tests/e2e/map-layout-morph.spec.ts',
    reason: "the layout morph between map views changed",
    matches: [
      /^src\/widgets\/ontology-map\/morph\/layout-morph\.ts$/,
      /^src\/widgets\/ontology-map\/morph\/MapLayoutMorphOverlay\.tsx$/,
    ],
  },
  {
    order: 5019,
    command: 'pnpm exec playwright test tests/e2e/map-no-label-under-the-panel.spec.ts',
    reason: "labels kept out from under the inspector changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/label-layout\.ts$/,
      /^src\/widgets\/ontology-map\/tokens\/read-map-tokens\.ts$/,
    ],
  },
  {
    order: 5020,
    command: 'pnpm exec playwright test tests/e2e/map-open-folder-stays-named.spec.ts',
    reason: "the INDEX folder name during vault re-reads changed",
    matches: [
      /^src\/entities\/vault-session\/model\/LocalVaultProvider\.tsx$/,
      /^src\/widgets\/topology-index-panel\/ui\/TopologyIndexPanel\.tsx$/,
    ],
  },
  {
    order: 5021,
    command: 'pnpm exec playwright test tests/e2e/map-overview-centre.spec.ts',
    reason: "the overview centring in the free map changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/topology-overview-fit\.ts$/,
      /^src\/widgets\/ontology-map\/dial\/fit\.ts$/,
    ],
  },
  {
    order: 5022,
    command: 'pnpm exec playwright test tests/e2e/map-panel-text-edges.spec.ts',
    reason: "panel text edges changed",
    matches: [
      /^src\/features\/first-run-starter\/ui\/FirstRunStarterModule\.tsx$/,
      /^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/,
    ],
  },
  {
    order: 5023,
    command: 'pnpm exec playwright test tests/e2e/map-path-lens-frame.spec.ts',
    reason: "the path lens framing changed",
    matches: [
      /^src\/widgets\/ontology-map\/model\/path-lens\.ts$/,
      /^src\/views\/home\/model\/use-topology-path-lens\.ts$/,
    ],
  },
  {
    order: 5024,
    command: 'pnpm exec playwright test tests/e2e/map-path-pick-frame.spec.ts',
    reason: "the path source pick framing changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyMapContextMenu\.tsx$/,
      /^src\/widgets\/ontology-map\/ui\/use-topology-overview-navigation\.ts$/,
    ],
  },
  {
    order: 5025,
    command: 'pnpm exec playwright test tests/e2e/map-project-receipt-arrival.spec.ts',
    reason: "the project inspector's first layout changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyMapDetailPanel\.tsx$/,
    ],
  },
  {
    order: 5026,
    command: 'pnpm exec playwright test tests/e2e/map-relation-reveal.spec.ts',
    reason: "the relation reveal changed",
    matches: [
      /^src\/widgets\/ontology-map\/expressive\/edge-reveal\.ts$/,
    ],
  },
  {
    order: 5027,
    command: 'pnpm exec playwright test tests/e2e/map-relation-signal.spec.ts',
    reason: "the relation signal light changed",
    matches: [
      /^src\/widgets\/ontology-map\/light\/signal-plan\.ts$/,
      /^src\/widgets\/ontology-map\/light\/light-sources\.ts$/,
    ],
  },
  {
    order: 5028,
    command: 'pnpm exec playwright test tests/e2e/map-spotlight-label-clearance.spec.ts',
    reason: "name clearance around changed-node rings changed",
    matches: [
      /^src\/widgets\/ontology-map\/render\/label-layout\.ts$/,
      /^src\/widgets\/ontology-map\/model\/spotlight-motion\.ts$/,
    ],
  },
  {
    order: 5029,
    command: 'pnpm exec playwright test tests/e2e/map-strata-tier-scale.spec.ts',
    reason: "Strata tier name placement changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyMapTierLegend\.tsx$/,
      /^src\/widgets\/ontology-map\/model\/tier-names\.ts$/,
    ],
  },
  {
    order: 5030,
    command: 'pnpm exec playwright test tests/e2e/map-territories-view.spec.ts',
    reason: "the Territories view changed",
    matches: [
      /^src\/widgets\/ontology-map\/ui\/OntologyTerritoriesMap\.tsx$/,
      /^src\/widgets\/ontology-map\/render\/territories\.ts$/,
      /^src\/widgets\/ontology-map\/model\/territories-layout\.ts$/,
    ],
  },
  {
    order: 5031,
    command: 'pnpm exec playwright test tests/e2e/map-toolbar-balance.spec.ts',
    reason: "the top toolbar lane balance changed",
    matches: [
      /^src\/views\/home\/ui\/TopologyCommandChrome\.tsx$/,
      /^src\/widgets\/search-hint\/ui\/SearchHint\.tsx$/,
    ],
  },
  {
    order: 5032,
    command: 'pnpm exec playwright test tests/e2e/map-toolbar-popovers.spec.ts',
    reason: "toolbar popover placement and tile sizes changed",
    matches: [
      /^src\/views\/home\/ui\/TopologyCommandChrome\.tsx$/,
      /^src\/widgets\/search-hint\/ui\/SearchHint\.tsx$/,
    ],
  },
  {
    order: 5033,
    command: 'pnpm exec playwright test tests/e2e/map-view-motion.spec.ts',
    reason: "the map view switch motion changed",
    matches: [
      /^src\/widgets\/ontology-map\/morph\/MapLayoutMorphOverlay\.tsx$/,
      /^src\/views\/home\/ui\/TopologyMapRenderer\.tsx$/,
    ],
  },
];
