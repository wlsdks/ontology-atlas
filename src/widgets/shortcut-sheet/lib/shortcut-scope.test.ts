import { describe, expect, it } from "vitest";

import {
  sectionVisible,
  sectionVisibleForCurrent,
  surfaceForPathname,
} from "./shortcut-scope";

describe("surfaceForPathname", () => {
  it('keeps ontology editor shortcuts in the Library ontology tab', () => {
    expect(surfaceForPathname('/ko/library/', 'ontology')).toBe('docs');
    expect(surfaceForPathname('/ko/library/', 'wiki')).toBe('global');
  });
  it('maps the root and /topology to the map surface', () => {
    expect(surfaceForPathname("/")).toBe("topology");
    expect(surfaceForPathname("/topology")).toBe("topology");
    expect(surfaceForPathname("/ko/topology/")).toBe("topology");
  });

  it('maps /docs to the docs surface', () => {
    expect(surfaceForPathname("/docs")).toBe("docs");
    expect(surfaceForPathname("/en/docs/")).toBe("docs");
  });

  // Studio, insights and projects have no dedicated shortcuts — we do not claim what is not there.
  it('maps a screen without its own shortcuts to global only', () => {
    expect(surfaceForPathname("/ko/ontology/studio/")).toBe("global");
    expect(surfaceForPathname("/ko/projects/")).toBe("global");
  });
});

describe("sectionVisible", () => {
  it('shows everything on the all tab', () => {
    expect(sectionVisible("all", "topology")).toBe(true);
    expect(sectionVisible("all", "docs")).toBe(true);
    expect(sectionVisible("all", "global")).toBe(true);
  });

  it('keeps global shortcuts on every tab', () => {
    expect(sectionVisible("topology", "global")).toBe(true);
    expect(sectionVisible("docs", "global")).toBe(true);
  });

  it('shows only that surface on a surface tab', () => {
    expect(sectionVisible("topology", "topology")).toBe(true);
    expect(sectionVisible("topology", "docs")).toBe(false);
    expect(sectionVisible("docs", "topology")).toBe(false);
  });
});

describe("sectionVisibleForCurrent", () => {
  it('shows global plus map on the map', () => {
    expect(sectionVisibleForCurrent("topology", "global")).toBe(true);
    expect(sectionVisibleForCurrent("topology", "topology")).toBe(true);
    expect(sectionVisibleForCurrent("topology", "docs")).toBe(false);
  });

  it('shows only global on a screen without its own shortcuts', () => {
    expect(sectionVisibleForCurrent("global", "global")).toBe(true);
    expect(sectionVisibleForCurrent("global", "topology")).toBe(false);
    expect(sectionVisibleForCurrent("global", "docs")).toBe(false);
  });
});
