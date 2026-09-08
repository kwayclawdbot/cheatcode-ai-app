import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { mkdirSync,writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { KitIcon, BeltEmblem, type IconName } from '../../../apps/mobile/src/ui/design-kit';
import { KaiOrb } from '../../../apps/mobile/src/ui/KaiOrb';
const out=resolve(process.cwd(),'packages/design-kit/assets');mkdirSync(out,{recursive:true});
const icons:IconName[]=['home','alerts','community','trade','account','arrow','back','chevron','down','menu','plus','send','close','check','bookmark','book','play','search','lock','bolt','clock','more','wifi','flag'];
const files:{file:string;source:string;note:string}[]=[];
function save(name:string,element:React.ReactNode,source:string){
 const html=renderToStaticMarkup(element);const svg=html.match(/<svg\b[\s\S]*?<\/svg>/)?.[0];if(!svg)throw new Error(name);
 writeFileSync(resolve(out,name),svg.replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" '));files.push({file:name,source,note:'Generated from native component. Regenerate; do not hand-edit.'});
}
for(const name of icons)save(`icon-${name}.svg`,<KitIcon name={name} size={24}/>, 'icons.tsx');
for(const rank of ['white','blue','purple','brown','black'] as const)save(`belt-${rank}.svg`,<BeltEmblem rank={rank} size={200}/>, 'learning.tsx');
save('kai-orb.svg',<KaiOrb size={100} glow={false}/>, '../KaiOrb.tsx');
writeFileSync(resolve(out,'manifest.json'),JSON.stringify(files,null,2)+'\n');
console.log(`Exported ${files.length} SVG assets from the actual components.`);
