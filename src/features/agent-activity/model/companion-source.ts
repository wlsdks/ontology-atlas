import {codedFailure} from '@/shared/lib/failure-code';
import {parseFrontmatter} from '@/shared/lib/parse-frontmatter';

/** Read one current saved document, never promote its text to accepted meaning. */
type SourceExpectation={uid:string|null;mtime:number|undefined;frontmatter?:Record<string,unknown>};
const witnessedFields=['uid','kind','dependencies','depends_on','relation_notes'] as const;
export async function readCompanionDocument(handle:Pick<FileSystemFileHandle,'getFile'>,expected:SourceExpectation){
 const file=await handle.getFile();
 if(file.size>512*1024)throw codedFailure('companion-source-large');
 if(expected.mtime!==undefined&&file.lastModified!==expected.mtime)throw codedFailure('companion-source-changed');
 const parsed=parseFrontmatter(await file.text());
 if(expected.uid&&parsed.frontmatter.uid!==expected.uid)throw codedFailure('companion-source-changed');
 if(expected.frontmatter&&JSON.stringify(witnessedFields.map(key=>expected.frontmatter![key]))!==JSON.stringify(witnessedFields.map(key=>parsed.frontmatter[key])))throw codedFailure('companion-source-changed');
 return {body:parsed.body.trim(),frontmatter:parsed.frontmatter};
}

export async function readCompanionSource(handle:Pick<FileSystemFileHandle,'getFile'>,expected:SourceExpectation,declarations=false):Promise<string>{
 const doc=await readCompanionDocument(handle,expected);
 return declarations?`${JSON.stringify({dependencies:doc.frontmatter.dependencies??[],depends_on:doc.frontmatter.depends_on??[],relation_notes:doc.frontmatter.relation_notes??{}},null,2)}\n\n${doc.body}`:doc.body;
}

/** Preserve every character; limit both wrapping work and explicit line breaks per page. */
export function companionSourcePages(body:string,limit:number):string[]{
 const pages:string[]=[];let current:string[]=[];let lines=0;
 for(const char of Array.from(body)){
  if(current.length>=limit||lines>=3){
   let end=current.length;
   if(lines<3&&!/\s/.test(char)&&!/\s/.test(current[end-1])){
    for(let index=end-1;index>=Math.floor(limit*.6);index--)if(/\s/.test(current[index])){end=index+1;break;}
   }
   pages.push(current.slice(0,end).join(''));current=current.slice(end);lines=current.filter(value=>value==='\n').length;
  }
  current.push(char);if(char==='\n')lines++;
 }
 if(current.length)pages.push(current.join(''));
 return pages.length?pages:[''];
}
