/** Build native traveler sprites and identity artwork. */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const sharp = createRequire(require.resolve('next/package.json'))('sharp');
const root = 'assets/brand/mascot';
const source = `${root}/source`;
const palette = ['101025','1c1a35','2e2949','454064','725d68','a77d59','cf9e69','efc18c','ffdda6','fff0ca','fff8e2','15316b','204d9e','286dd0','4193dc','65bde9','a5e7f7','e5fcff','087dba','14b4d5','58cdd5','fff097','e9c465','bc934d'].map(h => [0,2,4].map(i => parseInt(h.slice(i,i+2),16)));
async function grid(input, size, extract) {
  let image = sharp(input);
  if (extract) image = image.extract(extract);
  const {data,info} = await image.resize(size,size,{fit:'contain',kernel:'nearest',background:'#00000000'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){
    if(data[i+3]<160){data.fill(0,i,i+4);continue;}
    let best=palette[0],distance=Infinity;
    for(const p of palette){const d=p.reduce((sum,c,j)=>sum+(c-data[i+j])**2,0);if(d<distance){distance=d;best=p;}}
    data.set([...best,255],i);
  }
  return sharp(data,{raw:info}).png().toBuffer();
}
const blank = (width,height) => sharp({create:{width,height,channels:4,background:'#00000000'}});
async function row(frames,path){await blank(frames.length*64,64).composite(frames.map((input,i)=>({input,left:i*64,top:0}))).png().toFile(path);}

async function identityGrid(input, size, extract, margin = 1) {
  let image = sharp(input);
  if (extract) image = image.extract(extract);
  const cropped = await image.png().toBuffer();
  const trimmed = await sharp(cropped).trim().png().toBuffer();
  const { data, info } = await sharp(trimmed)
    .resize(size - margin * 2, size - margin * 2, { fit: 'inside', kernel: 'nearest' })
    .png().toBuffer({ resolveWithObject: true });
  const registered = await blank(size, size).composite([{
    input: data,
    left: Math.floor((size - info.width) / 2),
    top: Math.floor((size - info.height) / 2),
  }]).png().toBuffer();
  return grid(registered, size);
}
await sharp(await identityGrid(`${source}/traveler-master-v2.png`,64)).toFile(`${root}/mascot-full-64.png`);
await sharp(await identityGrid(`${source}/traveler-master-v2.png`,128,undefined,8)).toFile(`${root}/mascot-presentation-128.png`);
const smallFile = `${source}/traveler-small-v2.png`;
const small = await sharp(smallFile).metadata();
const cellWidth = Math.floor(small.width / 2);
for (const [column, size, tier] of [[0,32,'compact'],[1,16,'micro']]) {
  await sharp(await identityGrid(smallFile, size, {
    left: column * cellWidth, top: 0, width: cellWidth, height: small.height,
  })).toFile(`${root}/mascot-${tier}-${size}.png`);
}
{
  const file = `${root}/mascot-micro-16.png`;
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const pixel = (x, y, rgba) => data.set(rgba, (y * 16 + x) * 4);
  for (let y = 10; y <= 12; y++) {
    for (let x = 5; x <= 10; x++) pixel(x, y, [16,16,37,255]);
  }
  for (const x of [6,9]) pixel(x, 10, [101,189,233,255]);
  pixel(12, 12, [255,221,166,255]);
  for (const x of [7,8]) pixel(x, 13, [40,109,208,255]);
  await sharp(data, { raw: info }).png().toFile(file);
}
for(const size of [16,32]){
  const {data,info}=await sharp(`${root}/mascot-${size===16?'micro-16':'compact-32'}.png`).raw().toBuffer({resolveWithObject:true});
  for(let i=0;i<data.length;i+=4){const dark=data[i]<85&&data[i+1]<85&&data[i+2]<120;data[i+3]=dark?0:data[i+3];data[i]=data[i+1]=data[i+2]=0;}
  await sharp(data,{raw:info}).png().toFile(`${root}/mascot-tray-template-${size}.png`);
}
async function registeredWorkFrames(file) {
  const { width, height } = await sharp(file).metadata();
  if (width % 3 || height % 2 || width / 3 !== height / 2) {
    throw new Error(`${file} must contain six equal square cells in a 3x2 sheet`);
  }
  const side = width / 3;
  const frames = [];
  for (let i = 0; i < 6; i++) {
    const pixels = await grid(file, 64, { left: i % 3 * side, top: Math.floor(i / 3) * side, width: side, height: side });
    const { data, info } = await sharp(pixels).raw().toBuffer({ resolveWithObject: true });
    let top = 64, bottom = -1;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      if (data[(y * 64 + x) * 4 + 3]) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    const offset = 61 - bottom;
    if (bottom < 0 || top + offset < 1) throw new Error(`${file} cell ${i} cannot fit the foot baseline without clipping`);
    const registered = Buffer.alloc(data.length);
    for (let y = top; y <= bottom; y++) data.copy(registered, (y + offset) * 64 * 4, y * 64 * 4, (y + 1) * 64 * 4);
    frames.push(await sharp(registered, { raw: info }).png().toBuffer());
  }
  return frames;
}
const walks = await registeredWorkFrames(`${source}/traveler-walk-v2.png`);
const reads = await registeredWorkFrames(`${source}/traveler-read-v2.png`);
const completions = await registeredWorkFrames(`${source}/traveler-success-v2.png`);
await row([...walks.slice(0,5),reads[0]],`${root}/mascot-walk-row-64.png`);
await row(reads,`${root}/mascot-read-row-64.png`);
await row([reads[5],...completions.slice(1)],`${root}/mascot-success-row-64.png`);
const portraitsFile = `${source}/traveler-portraits-v2.png`;
const portraits = await sharp(portraitsFile).metadata();
for (const [column, expression] of ['welcome','curious'].entries()) {
  await sharp(await identityGrid(portraitsFile,32,{
    left: column * portraits.width / 2, top: 0, width: portraits.width / 2, height: portraits.height,
  })).toFile(`${root}/mascot-${expression}-32.png`);
}
writeFileSync(`${root}/traveler-palette.json`,JSON.stringify({colors:palette.map(p=>'#'+p.map(c=>c.toString(16).padStart(2,'0')).join('')),cell:64,workFramesPerRow:6},null,2)+'\n');
console.log(`[traveler] 3 identity tiers, presentation art, 2 portraits, 2 tray masks, 3 registered work rows`);
