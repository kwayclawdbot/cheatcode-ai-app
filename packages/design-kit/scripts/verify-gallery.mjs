/** Run on your machine after npm run build + npm run serve. Not executed in the authoring browser. */
import { createRequire } from 'node:module';
import { resolve,dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const require=createRequire(resolve(root,'apps/mobile/package.json'));
const {chromium}=require('playwright');
const source=await readFile(resolve(root,'apps/mobile/src/ui/design-kit/contracts.ts'),'utf8');
const ids=[...source.matchAll(/\{ id: '([^']+)', title:/g)].map(m=>m[1]);
const base=process.env.KIT_PREVIEW_URL||'http://127.0.0.1:4179';
const out=resolve(root,'packages/design-kit/proof/browser');await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1200,height:1000}});
const runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));
const report=[];
try{
 for(const width of [320,390,430]){
  for(const id of ids){
   await page.goto(`${base}/?capture=1&screen=${id}&width=${width}`);await page.evaluate(()=>document.fonts.ready);
   const device=page.getByTestId('device');await device.waitFor();
   const overflow=await device.evaluate(el=>{
    const box=el.getBoundingClientRect();
    // Horizontal story lists intentionally scroll inside their own viewport.
    return [...el.querySelectorAll('input,textarea,[role="button"],[role="tab"],[role="switch"]')].filter(node=>{
     const r=node.getBoundingClientRect();if(!r.width||!r.height)return false;
     let p=node.parentElement;while(p&&p!==el){const css=getComputedStyle(p);if(['auto','scroll'].includes(css.overflowX)&&p.scrollWidth>p.clientWidth)return false;p=p.parentElement;}
     return r.left<box.left-1||r.right>box.right+1;
    }).map(node=>node.textContent||node.getAttribute('aria-label'));
   });
   assert.deepEqual(overflow,[],`${id}/${width}: horizontal control overflow`);
   if(width===390)await device.screenshot({path:resolve(out,`${id}.png`)});
   report.push({screen:id,width,controlsWithinWidth:true});
  }
 }
 // Higher-risk interactions and information states.
 await page.goto(`${base}/?screen=alerts`);
 await page.getByLabel('Text size',{exact:true}).selectOption('1.4');
 await page.getByLabel('Viewport width',{exact:true}).selectOption('320');
 await page.getByTestId('device').screenshot({path:resolve(out,'alerts-large-text.png')});
 await page.getByLabel('Preview state',{exact:true}).selectOption('empty');
 assert(await page.getByText('Nothing here yet.',{exact:true}).isVisible());
 await page.getByLabel('Preview state',{exact:true}).selectOption('default');
 await page.getByRole('button',{name:'Reset',exact:true}).click();
 await page.getByRole('button',{name:'Review setup',exact:true}).click();
 await page.getByRole('button',{name:'Watch setup',exact:true}).click();
 assert(await page.getByRole('button',{name:'Watching setup',exact:true}).isDisabled());
 await page.goto(`${base}/?screen=community`);
 await page.getByLabel('Preview state',{exact:true}).selectOption('send-error');
 await page.getByLabel('Message room',{exact:true}).fill('Does this stop fit the idea?');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.getByText('Message not sent. Your draft is saved here. Try again.',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Message room',{exact:true}).inputValue(),'Does this stop fit the idea?');
 await page.getByLabel('Preview state',{exact:true}).selectOption('default');
 await page.getByRole('button',{name:'Send message',exact:true}).click();
 await page.getByText('Does this stop fit the idea?',{exact:true}).waitFor();
 assert.equal(await page.getByLabel('Message room',{exact:true}).inputValue(),'');
 await page.goto(`${base}/?screen=lesson&capture=1`);
 await page.getByRole('button',{name:'Own one more share',exact:true}).click();
 assert(await page.getByText('11%',{exact:true}).isVisible());
 await page.goto(`${base}/?screen=order-review&capture=1`);
 await page.getByRole('button',{name:'Add one share',exact:true}).click();
 assert(await page.getByText('$32.50',{exact:true}).isVisible());
 await page.getByRole('button',{name:'Submit paper order',exact:true}).click();
 assert(await page.getByText('0/5',{exact:true}).isVisible());
 assert(await page.getByText('Submitted. Waiting to fill.',{exact:true}).isVisible());
 assert.deepEqual(runtimeErrors,[],'Browser runtime errors');
 await writeFile(resolve(out,'report.json'),JSON.stringify({status:'passed',screens:report,interactions:['watch setup','message failure retains draft','message success clears draft','ownership stepper','order sizing and pending state'],runtimeErrors},null,2));
 console.log(`Passed ${report.length} screen/width checks and focused interactions. Review PNGs for visual fidelity before sign-off.`);
}finally{await browser.close();}
