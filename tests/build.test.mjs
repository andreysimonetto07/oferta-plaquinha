import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {buildStorefront} from '../scripts/build.mjs';

test('a changed nested catalog gives pages, styles and the full module graph a new release URL',async()=>{
 const root=await mkdtemp(join(tmpdir(),'tapstar-release-')),publicDir=join(root,'public'),dist=join(root,'dist');
 try{
  await mkdir(join(publicDir,'js'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  const page='<html><head><link rel="stylesheet" href="/style.css"><script type="module" src="/js/store.js"></script></head><body></body></html>';
  await writeFile(join(publicDir,'index.html'),page);await writeFile(join(publicDir,'produtos.html'),page);
  await writeFile(join(publicDir,'style.css'),'body{color:black}');
  await writeFile(join(publicDir,'js','store.js'),"export {MIN_QUANTITY} from './catalog.js';");
  await writeFile(join(publicDir,'js','catalog.js'),'export const MIN_QUANTITY=25;');
  const old=await buildStorefront(publicDir,dist),same=await buildStorefront(publicDir,dist);
  assert.equal(same.version,old.version);
  await writeFile(join(publicDir,'js','catalog.js'),'export const MIN_QUANTITY=5;');
  const next=await buildStorefront(publicDir,dist);assert.notEqual(next.version,old.version);
  for(const name of ['index.html','produtos.html']){
   const html=await readFile(join(dist,name),'utf8');
   assert.ok(html.includes(`src="${next.assetRoot}/js/store.js"`));
   assert.ok(html.includes(`href="${next.assetRoot}/style.css"`));
   assert.ok(!html.includes(old.assetRoot));
  }
  const loaded=await import(pathToFileURL(join(dist,'static',next.version,'js','store.js')));
  assert.equal(loaded.MIN_QUANTITY,5);
  assert.equal(await readFile(join(publicDir,'index.html'),'utf8'),page);
 }finally{await rm(root,{recursive:true,force:true});}
});
