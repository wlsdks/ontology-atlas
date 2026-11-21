import * as fs from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve, sep } from 'node:path';

const context = new AsyncLocalStorage();
const MAX_ENTRIES = 12000;
const MAX_TEXT_BYTES = 32 * 1024 * 1024;
const SENSITIVE = /^(?:credential|credentials|secret|secrets|private[-_]?key|id_rsa|id_ed25519)(?:\.[^.]+)?$|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const order = (a,b) => Buffer.compare(Buffer.from(a),Buffer.from(b));
let inheritedSnapshot;
export const confinedSourceReadsEnabled = () => Boolean(context.getStore()) || process.env.OATLAS_CONFINED_SOURCE_READS === '1';

function refuse(ctx,reason){ctx.failure??=reason;const error=new Error(`Confined source read refused: ${reason}`);error.code='EACCES';throw error;}
function address(ctx,input){
  if(typeof input!=='string'||input.includes('\0'))return refuse(ctx,'invalid path');
  const path=relative(ctx.root,resolve(input));
  if(path==='..'||path.startsWith(`..${sep}`)||isAbsolute(path))return refuse(ctx,'outside approved root');
  if(path.split(sep).some(p=>p.startsWith('.')||SENSITIVE.test(p)))return refuse(ctx,'private or hidden path');
  const normalized=path.split(sep).join('/')||'.';
  if(ctx.excluded?.some(p=>normalized===p||normalized.startsWith(`${p}/`)))return refuse(ctx,'input deliberately excluded');
  return normalized;
}
function get(ctx,input){
  const path=address(ctx,input);const entry=ctx.entries.get(path);
  ctx.lookups.set(path,{path,state:entry?.kind??'missing'});
  if(!entry){const error=new Error('Input absent from the complete snapshot');error.code='ENOENT';throw error;}
  if(entry.kind==='symlink')return refuse(ctx,'symlink');
  return entry;
}
const methods = kind => ({isFile:()=>kind==='file',isDirectory:()=>kind==='directory',isSymbolicLink:()=>kind==='symlink',isBlockDevice:()=>false,isCharacterDevice:()=>false,isFIFO:()=>false,isSocket:()=>false});
function stat(entry){return {...methods(entry.kind),size:entry.size??0,mtimeMs:entry.mtimeMs??0,ino:entry.ino??0,dev:entry.dev??0};}

export function readFileSync(input,options){
  const ctx=context.getStore();if(!ctx)return fs.readFileSync(input,options);
  const entry=get(ctx,input);
  if(entry.kind!=='file'||typeof entry.text!=='string')return refuse(ctx,'file bytes unavailable in snapshot');
  const bytes=Buffer.from(entry.text,'utf8');ctx.files.set(entry.path,{path:entry.path,sha256:createHash('sha256').update(bytes).digest('hex')});
  const encoding=typeof options==='string'?options:options?.encoding;return encoding?bytes.toString(encoding):bytes;
}
export function readdirSync(input,options){
  const ctx=context.getStore();if(!ctx)return fs.readdirSync(input,options);
  const entry=get(ctx,input);if(entry.kind!=='directory'||!Array.isArray(entry.children))return refuse(ctx,'directory unavailable in snapshot');
  const names=[...entry.children].sort(order);ctx.directories.set(entry.path,{path:entry.path,names});
  if(!options?.withFileTypes)return names;
  return names.map(name=>{const path=entry.path==='.'?name:`${entry.path}/${name}`;const child=ctx.entries.get(path);if(!child)return refuse(ctx,'incomplete directory');return {name,parentPath:resolve(ctx.root,entry.path),path:resolve(ctx.root,entry.path),...methods(child.kind)};});
}
export function statSync(input,options){const ctx=context.getStore();return ctx?stat(get(ctx,input)):fs.statSync(input,options);}
export function lstatSync(input,options){const ctx=context.getStore();return ctx?stat(get(ctx,input)):fs.lstatSync(input,options);}
export function existsSync(input){const ctx=context.getStore();if(!ctx)return fs.existsSync(input);try{get(ctx,input);return true;}catch{return false;}}
export function realpathSync(input){const ctx=context.getStore();if(!ctx)return fs.realpathSync(input);return resolve(ctx.root,get(ctx,input).path);}

export function withSourceSnapshot(snapshot,operation){
  if(snapshot?.contract!=='confinedSourceSnapshot:v1'||typeof snapshot.rootPath!=='string'||!Array.isArray(snapshot.entries)||snapshot.entries.length>MAX_ENTRIES||snapshot.truncated)throw new Error('Confined source snapshot is incomplete');
  const ctx={root:resolve(snapshot.rootPath),entries:new Map(),failure:null,files:new Map(),lookups:new Map(),directories:new Map(),excluded:Array.isArray(snapshot.excluded)?snapshot.excluded:[]};let bytes=0;
  for(const entry of snapshot.entries){
    if(typeof entry.path!=='string'||!['file','directory','symlink','other'].includes(entry.kind))refuse(ctx,'invalid snapshot entry');
    const normalized=entry.path==='.'?'.':address(ctx,resolve(ctx.root,entry.path));
    if(normalized!==entry.path||ctx.entries.has(normalized))refuse(ctx,'ambiguous snapshot entry');
    if(typeof entry.text==='string'){const size=Buffer.byteLength(entry.text);bytes+=size;if(size>512*1024||bytes>MAX_TEXT_BYTES)refuse(ctx,'snapshot byte limit');}
    ctx.entries.set(normalized,entry);
  }
  const result=context.run(ctx,operation);
  if(ctx.failure)throw new Error(`Confined source read refused: ${ctx.failure}`);
  const sorted=map=>[...map.values()].sort((a,b)=>order(a.path,b.path));
  return {...result,readBoundary:{contract:'confinedSourceReads:v1',origin:'process-supplied-immutable-snapshot',diskAuthority:'not-asserted-by-server',excluded:ctx.excluded,files:sorted(ctx.files),lookups:sorted(ctx.lookups),directories:sorted(ctx.directories)}};
}
export function withConfinedSourceReads(root,operation){
  const active=context.getStore();if(active){if(active.root!==resolve(root))refuse(active,'root mismatch');return operation();}
  if(process.env.OATLAS_CONFINED_SOURCE_READS!=='1')return operation();
  if(!inheritedSnapshot){
    if(process.env.OATLAS_SOURCE_SNAPSHOT_FD!=='198')throw new Error('Confined source snapshot descriptor is unavailable');
    const descriptor=198;const info=fs.fstatSync(descriptor);if(info.size>64*1024*1024)throw new Error('Confined source snapshot exceeds its transport limit');
    try{inheritedSnapshot=JSON.parse(fs.readFileSync(descriptor,'utf8'));}finally{fs.closeSync(descriptor);}
  }
  if(resolve(root)!==inheritedSnapshot.rootPath)throw new Error('Confined source snapshot root mismatch');
  return withSourceSnapshot(inheritedSnapshot,operation);
}
