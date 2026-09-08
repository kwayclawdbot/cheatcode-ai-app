/** Gallery-only illustrative data. NEVER import this file in application routes. */
import type { KitData, KitState, ScreenId, TradeIdea } from '../../../apps/mobile/src/ui/design-kit';
const candles = Array.from({ length: 44 }, (_, i) => {
  const close = i < 31 ? 162 + i * .78 + Math.sin(i*1.7)*.9 : 186.2-(i-31)*.6 + Math.sin(i*1.3)*.8;
  const open = close + Math.sin(i*2.1)*1.25;
  return { time: Date.UTC(2026,3,1+i), open, close, high:Math.max(open,close)+.7, low:Math.min(open,close)-.6 };
});
export const exampleTrade: TradeIdea = {
  id:'demo-nvda',symbol:'NVDA',company:'Nvidia',title:'Breakout retest.',summary:'A breakout returning to support.',grade:'A',direction:'long',entry:178.4,stop:171.9,target:195,status:'entry_reached',candles,dataLabel:'Illustrative setup · not live market data',
};
export const initialState: KitState = {
  persona:'learn',interest:'',level:'entry',alertFilter:'active',quantity:4,ownedShares:10,candlePart:'body',guidance:'guided',textScale:1,reducedMotion:false,setupNotifications:true,communityNotifications:true,quietHours:true,email:'',password:'',roomId:'swing',threadId:'nvda',
};
export const exampleData: KitData = {
  trade:exampleTrade,noLogo:true,
  ideas:[exampleTrade,{...exampleTrade,id:'demo-msft',symbol:'MSFT',company:'Microsoft',title:'A level worth watching.',status:'watching',grade:null},{...exampleTrade,id:'demo-closed',symbol:'AAPL',company:'Apple',status:'closed'}],
  greeting:'Let’s make your first stock make sense.',
  selectedLevelNotes:{ entry:'178 changed sides. Watch it hold.',stop:'Below 171.90, the retest has failed. That is where the idea is wrong.',target:'195 is the planned target. A plan defines the opportunity; it does not promise an outcome.' },
  profile:{name:'Jordan',rank:'white',progress:.68,nextRank:'Blue',balanceLabel:'$10,000'},
  company:{symbol:'AAPL',name:'Apple',description:'Products people use. Services they return to.',whyWatch:'A familiar business with hardware, software and recurring services.',risk:'Slower demand and intense competition can affect the business.',sourceLabel:'Illustrative company overview · example content'},
  companies:[{symbol:'AAPL',name:'Apple',description:'Devices + services'},{symbol:'MSFT',name:'Microsoft',description:'Software + cloud'},{symbol:'COST',name:'Costco',description:'Membership + everyday value'}],
  lessons:[{id:'ownership',title:'What do you own?',description:'Stocks as ownership.',duration:'3 min · interactive',state:'available'},{id:'candles',title:'Read a candle',description:'See what the price is saying.',duration:'4 min',state:'coming'},{id:'plan',title:'Build your first plan',description:'Entry. Stop. Target.',duration:'5 min',state:'coming'}],
  skills:[{id:'ownership',label:'Understand ownership',complete:true,evidence:'Knowledge check passed'},{id:'chart',label:'Read a chart correctly',complete:true,evidence:'Two chart exercises demonstrated'},{id:'plan',label:'Build a trade plan',complete:false,evidence:'Next: define where the idea is wrong'},{id:'process',label:'Complete 3 clean trades',complete:false,evidence:'Verified process, not profit'}],
  video:{lessonId:'candles',title:'What a candle tells you',creator:'Companion YouTube lesson · preview',duration:'4:20'},
  rooms:[{id:'swing',title:'Swing',initials:'SW',remainingLabel:'Main room',remainingFraction:1,membersLabel:'Example room'},{id:'nvda',title:'NVDA',initials:'NV',remainingLabel:'12 days left',remainingFraction:.4,membersLabel:'Example circle'},{id:'earnings',title:'Earnings',initials:'EA',remainingLabel:'5 days left',remainingFraction:.16,membersLabel:'Example circle'},{id:'beginners',title:'Beginners',initials:'BE',remainingLabel:'Main room',remainingFraction:1,membersLabel:'Example room'}],
  messages:[{id:'m1',name:'Renata',belt:'black',timeLabel:'9:31',text:'Holding above 178. Watching the retest.'},{id:'m2',name:'Toby',belt:'blue',timeLabel:'9:32',text:'Why not put the stop right under 178?'},{id:'m3',name:'Renata',belt:'black',replyToName:'Toby',timeLabel:'9:33',text:'I want the stop where the idea is actually wrong. A small dip is not the same as a failed setup.'}],
  threads:[{id:'nvda',title:'The NVDA retest',preview:'Why 178 matters',group:'Pinned',pinned:true},{id:'learn',title:'My first stock',preview:'Ownership, not a lottery ticket',group:'Today'},{id:'risk',title:'Protecting the idea',preview:'Where should the stop go?',group:'Yesterday'}],
  plan:{name:'Intermediate',priceLabel:'$59/mo',availability:'Planned membership',interests:['Better swing setups','Kai explanations','An active trading room']},
  membership:{name:'Free',creditsUsed:8,creditsTotal:10,resetsLabel:'Example allowance · resets monthly',included:['Guided foundations','Paper trading practice','Community access'],excluded:['Unlimited Kai questions','Premium trading tools']},
  execution:'paper',order:{statusLabel:'Submitted. Waiting to fill.',filled:0,requested:4,asOf:'Illustrative order state · just submitted'},
  position:{shares:4,entry:178.4,current:181.2,asOf:'Example position · price is illustrative'},
  review:{title:'Risk respected. Exit improvised.',lesson:'You defined the risk. Next time, write down the exit rule before you enter.',shares:4,entry:178.4,exitPrice:186.2},
  connection:{lastUpdated:'9:41 AM',message:'Your saved setup is still here. Reconnect to refresh it.'},notificationDelivery:'Device delivery · preview',
};
export function dataForScreen(screen: ScreenId, base: KitData): KitData {
  return { ...base, greeting:screen==='home-ready'?'NVDA is back at your level.':screen==='home-developing'?'You found the entry. Now protect the idea.':screen==='home-invest'?'Let’s understand the business behind the stock.':base.greeting };
}
