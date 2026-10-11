import { invoke, isTauri } from '@tauri-apps/api/core';

export interface ConstructionSourcePreview {
  sourcePath:string;
  destinationPath:string;
  fingerprint:string;
  files:{path:string;bytes:number}[];
  limited:boolean;
  excluded:string[];
}
export interface ConstructionSourceRange {
  path:string;
  startLine:number;
  endLine:number;
  text:string;
  fullFileSha256:string;
  bytes:number;
  nextLine:number|null;
  totalLines:number;
  fileComplete:boolean;
}
function nativeOnly():void { if(!isTauri())throw new Error('unsupported_platform'); }
export async function previewConstructionSource(sourcePath:string,destinationPath:string):Promise<ConstructionSourcePreview>{
  nativeOnly();return invoke('preview_local_construction_source',{sourcePath,destinationPath});
}
export async function readConstructionSource(preview:ConstructionSourcePreview,path:string,startLine:number):Promise<ConstructionSourceRange>{
  nativeOnly();return invoke('read_local_construction_source',{sourcePath:preview.sourcePath,destinationPath:preview.destinationPath,fingerprint:preview.fingerprint,path,startLine});
}
