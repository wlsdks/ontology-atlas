import { invoke, isTauri } from '@tauri-apps/api/core';

export interface GrayAreaNode {
  uid: string;
  slug: string;
  title: string;
  kind: string;
  path?: string;
  body: string;
  bodyDigest: string;
}
export interface GrayAreaEdge { from: string; to: string; via: string }
export interface GrayAreaWitness {
  path: string;
  status: 'read' | 'refused' | 'omitted';
  text?: string;
  actualRange?: { startLine: number; endLine: number };
  fullFileSha256?: string;
  citation?: string;
  reason?: string;
  fileComplete?: boolean;
}
export interface GrayAreaBasis {
  projectSlug: string;
  selectedUids: string[];
  sourceId: string;
  sourceFingerprint: string;
  sourceRoots?: string[];
  graphDigest: string;
  bodyDigest: string;
  bindingDigest: string;
}
export interface GrayAreaSnapshot {
  contract: 'grayAreaEvidence:v1';
  snapshotId: string;
  measuredAt: string;
  basis: GrayAreaBasis;
  nodes: GrayAreaNode[];
  edges: GrayAreaEdge[];
  imports: { from: string; to: string; kind: string; sourceRole: string; importUsage: string }[];
  drift: { slug: string; path: string; documentChangedAt: string; sourceChangedAt: string }[];
  recordedReads: { slug: string; kind: string; statement: string; paths: string[]; ranges: { path: string; from: number; to: number }[] }[];
  witnesses: GrayAreaWitness[];
  coverage: {
    filesScanned: number;
    maxFiles: number;
    importsAvailable: boolean;
    importsLimited: boolean;
    unresolvedImports: number;
    unsupported: string[];
    readsLimited: boolean;
    recordedReadsTotal: number;
    limits: string[];
  };
}

export async function readGrayAreaEvidence(vaultPath: string, projectSlug: string, selectedUids: string[], expectedBindingDigest: string): Promise<GrayAreaSnapshot | null> {
  if (!isTauri()) return null;
  return invoke<GrayAreaSnapshot>('read_gray_area_evidence', { vaultPath, projectSlug, selectedUids, expectedBindingDigest });
}

export async function checkGrayAreaEvidence(vaultPath: string, snapshot: GrayAreaSnapshot): Promise<boolean> {
  if (!isTauri()) return false;
  return invoke<boolean>('check_gray_area_evidence', { vaultPath, basis: snapshot.basis, witnesses: snapshot.witnesses });
}

export interface GrayAreaScopePreview { projectSlug: string; sourcePath: string; sourceId: string; bindingDigest: string; maxFiles: number }
export async function previewGrayAreaScope(vaultPath:string,projectSlug:string):Promise<GrayAreaScopePreview|null>{
  if(!isTauri())return null;
  return invoke<GrayAreaScopePreview>('preview_gray_area_scope',{vaultPath,projectSlug});
}
