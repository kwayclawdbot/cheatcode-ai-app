import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import assert from 'node:assert/strict';
import { KitScreen, DesignKitProvider, screenCatalog, TradeChart, PriceLevels, RiskRewardBar } from '../../../apps/mobile/src/ui/design-kit';
import { exampleData, exampleTrade, initialState, dataForScreen } from '../gallery/fixtures';
const errors: string[]=[];
for (const item of screenCatalog) {
  for (const textScale of [1,1.4]) {
    try {
      const markup=renderToStaticMarkup(<DesignKitProvider textScale={textScale}><KitScreen screen={item.id} data={dataForScreen(item.id,exampleData)} state={initialState} onAction={()=>{}} onSend={async()=>{}} /></DesignKitProvider>);
      assert(markup.length>1000,`${item.id}: missing screen`);
      assert(!markup.includes('NaN'),`${item.id}: invalid numeric rendering`);
      const needsNav=!['identify','reveal','curiosity','plan','signup','preferences'].includes(item.id);
      assert.equal(markup.includes('role="tab"'),needsNav || item.id==='curiosity' && false,`${item.id}: navigation`);
      if (item.id==='order-pending')assert(markup.includes('Waiting to fill')&&markup.includes('0/4'));
      if (item.id==='membership')assert(markup.includes('NOT INCLUDED IN THIS PLAN'));
    }catch(error){errors.push(String(error));}
  }
}
for(const idea of [{...exampleTrade,candles:[]},{...exampleTrade,candles:[],entry:null,stop:null,target:null},{...exampleTrade,direction:'short' as const,stop:185,target:161.8},{...exampleTrade,stop:178.399,target:178.401}]){
 const markup=renderToStaticMarkup(<><TradeChart idea={idea}/><PriceLevels idea={idea}/><RiskRewardBar idea={idea}/></>);
 assert(!markup.includes('NaN'));
 assert(!markup.includes('Infinity'));
}
if(errors.length)throw new Error(errors.join('\n'));
console.log('PASS: 36 screens × 2 text scales render; missing prices, missing candles, short and near-overlap cases render. This is server-render verification, not browser visual QA.');
