import {cp,rm,mkdir,readdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

async function sourceFiles(root,prefix=''){
 const files=[];
 for(const entry of await readdir(join(root,prefix),{withFileTypes:true})){
  const name=prefix?`${prefix}/${entry.name}`:entry.name;
  if(entry.isDirectory())files.push(...await sourceFiles(root,name));
  else if(entry.isFile()&&/\.(html|css|js)$/.test(name))files.push(name);
 }
 return files.sort();
}

export async function buildStorefront(publicDir='public',outputDir='dist'){
 const files=await sourceFiles(publicDir),hash=createHash('sha256');
 for(const name of files){hash.update(name+'\0');hash.update(await readFile(join(publicDir,name)));hash.update('\0');}
 const version=hash.digest('hex').slice(0,16),assetRoot=`/static/${version}`;
 await rm(outputDir,{recursive:true,force:true});await mkdir(outputDir,{recursive:true});
 await cp(publicDir,outputDir,{recursive:true});
 await mkdir(join(outputDir,'static',version),{recursive:true});
 await cp(join(publicDir,'js'),join(outputDir,'static',version,'js'),{recursive:true});
 await cp(join(publicDir,'style.css'),join(outputDir,'static',version,'style.css'));
 // Version the complete module directory so relative imports use the same
 // release as the entry script. API routes retain their shared source catalog.
 for(const name of files.filter(name=>name.endsWith('.html'))){
  const source=await readFile(join(publicDir,name),'utf8');
  const html=source.replaceAll('href="/style.css"',`href="${assetRoot}/style.css"`)
   .replaceAll('src="/js/',`src="${assetRoot}/js/`)
   .replace('</head>',`<meta name="tapstar-build" content="${version}"></head>`);
  await writeFile(join(outputDir,name),html);
 }
 return {version,assetRoot};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await buildStorefront();
 console.log(`Static storefront built into dist; release ${result.version}. Vercel serves /api separately.`);
}
