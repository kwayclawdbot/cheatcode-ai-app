import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DesignKitProvider, KitScreen, screenCatalog, color, KitIcon, TradeIdeaPreview, TradeChart, PriceLevels, RiskRewardBar, TradeLifecycle, OwnershipGrid, ProgressRing, BeltEmblem, CandleAnatomy, ProductReveal, KaiMessage, ConversationThread, CircleStories, MessageComposer, ActionButton, SelectionRow, SkillChecklist, LessonPath, VideoLesson, MetricStrip, MemberProfile, SettingToggle, type ScreenId, type KitState, type KitAction, type KitData } from '../../../apps/mobile/src/ui/design-kit';
import { initialState, exampleData, exampleTrade, dataForScreen } from './fixtures';
import { referenceBoards } from './references';
const groups = [...new Set(screenCatalog.map(s=>s.group))];
const params = new URLSearchParams(location.search);
const initialScreen = screenCatalog.find(s=>s.id===params.get('screen'))?.id ?? 'alerts';
const capture = params.has('capture');
const widthParam = Number(params.get('width'));
function App(){
  const [screen,setScreen]=useState<ScreenId>(initialScreen);
  const [state,setState]=useState<KitState>({...initialState,textScale:Number(params.get('scale'))||1});
  const [data,setData]=useState(exampleData);
  const [view,setView]=useState<'screens'|'components'|'references'>('screens');
  const [width,setWidth]=useState(widthParam||390);
  const [event,setEvent]=useState('Open any screen or tap through the working examples.');
  const [modal,setModal]=useState<{title:string;text:string;quiz?:boolean}|null>(null);
  const [history,setHistory]=useState<ScreenId[]>([]);
  const [condition,setCondition]=useState('default');
  function navigate(next:ScreenId){setHistory(h=>[...h,screen]);setScreen(next);setView('screens'); const url = new URL(location.href);url.searchParams.set('screen',next);window.history.replaceState(null,'',url);}
  function report(text:string){setEvent(text);}
  function action(a:KitAction){
    report(a.type==='create-account'?'create-account: credentials intentionally omitted from event log':JSON.stringify(a));
    switch(a.type){
      case 'navigate':navigate(a.screen);break;
      case 'back':setScreen(history.at(-1)??'alerts');setHistory(h=>h.slice(0,-1));break;
      case 'state':setState(s=>({...s,...a.patch}));break;
      case 'open-idea':setData(d=>({...d,trade:d.ideas.find(i=>i.id===a.id)??d.trade}));navigate('setup');break;
      case 'watch-idea':setState(s=>({...s,watched:true}));report('Setup watched locally. Production adapter must persist the watch request.');break;
      case 'open-room':setState(s=>({...s,roomId:a.id}));navigate('community');break;
      case 'open-thread':setState(s=>({...s,threadId:a.id}));setData(d=>({...d,messages:[]}));navigate('kai');break;
      case 'new-thread':setState(s=>({...s,threadId:`local-${Date.now()}`}));setData(d=>({...d,messages:[]}));navigate('kai');break;
      case 'open-lesson':navigate(a.id==='ownership'?'lesson':'video');break;
      case 'open-company':setData(d=>({...d,company:{...d.company,symbol:a.symbol,name:d.companies.find(c=>c.symbol===a.symbol)?.name??a.symbol,description:d.companies.find(c=>c.symbol===a.symbol)?.description??d.company.description}}));navigate('company');break;
      case 'submit-order':setData(d=>({...d,order:{...d.order,requested:a.quantity,filled:0}}));navigate('order-pending');break;
      case 'create-account':
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)||a.password.length<8){setState(s=>({...s,formError:'Use a valid email and a password with at least 8 characters.'}));break;}
        setState(s=>({...s,password:'',formError:undefined}));report('Local account preview only. No account was created.');navigate('preferences');break;
      case 'join-early-access':navigate('signup');break;
      case 'confirm-preferences':navigate(state.persona==='learn'?'home-beginner':state.persona==='pro'?'home-ready':'home-developing');break;
      case 'complete-lesson':setModal({title:'Check your understanding',text:`You own ${state.ownedShares} of 100 shares. What percentage of this example company do you own?`,quiz:true});break;
      case 'analyze-chart':setState(s=>({...s,level:'entry'}));report('Chart annotation selected. Live Kai analysis belongs in the host adapter.');break;
      case 'play-video':setModal({title:'Companion video slot',text:'Connect this action to the approved YouTube lesson ID in your learning library. The kit supplies the player entry, duration, transcript action and interactive exercise.'});break;
      case 'open-transcript':setModal({title:'Candle lesson · sample transcript',text:'Each candle summarizes a period of trading. Its body runs from the opening price to the closing price. The wick reaches the highest and lowest prices during that period. Select Body or Wick in the exercise to connect the explanation to the visual.'});break;
      case 'retry':setCondition('default');navigate('setup');report('Local recovery preview. The host must refresh data before enabling live actions.');break;
      case 'test-notification':setModal({title:'Notification preview',text:'CheatCode · A tracked setup changed. The production handler must use device notification permission and the delivery service.'});break;
      case 'open-privacy':setModal({title:'Host integration',text:'Connect this action to your actual privacy, terms and account security routes.'});break;
      case 'sign-out':setState(initialState);setData(exampleData);navigate('identify');break;
    }
  }
  async function send(text:string){
    if(condition==='send-error') throw new Error('Gallery failure mode');
    await new Promise(resolve=>setTimeout(resolve,150));
    setData(d=>({...d,messages:[...d.messages,{id:`local-${Date.now()}`,name:d.profile.name,belt:d.profile.rank,timeLabel:'Now',text}]}));
    report('Local message appended; no external message sent.');
    if(!['community','discussion','kai'].includes(screen)) navigate('kai');
  }
  function conditionData():KitData{
    const d=dataForScreen(screen,data);
    if(condition==='empty')return {...d,ideas:[],messages:[],threads:[],trade:{...d.trade,candles:[],entry:null,stop:null,target:null}};
    if(condition==='missing-chart')return {...d,trade:{...d.trade,candles:[]}};
    if(condition==='short')return {...d,trade:{...d.trade,direction:'short',entry:178.4,stop:185,target:161.8}};
    if(condition==='expired')return {...d,trade:{...d.trade,status:'expired'}};
    return d;
  }
  const renderedData=conditionData();
  const phone=<div className="device" style={{width}} data-testid="device"><div className="device-status"><span>9:41</span><span className="status-symbols">▰ ▰ ●</span></div><div className="native-screen"><DesignKitProvider textScale={state.textScale} reducedMotion={state.reducedMotion}><KitScreen screen={screen} state={state} data={renderedData} onAction={action} onSend={send} loadState={condition==='loading'?'loading':condition==='error'?'error':'ready'} /></DesignKitProvider></div><div className="home-indicator"><i /></div></div>;
  if(capture)return <div className="capture-only">{phone}</div>;
  return <div className="gallery-shell"><aside className="sidebar"><div className="brand">CheatCode<span>DESIGN SYSTEM / 02</span></div><div className="view-tabs">{(['screens','components','references'] as const).map(v=><button key={v} className={view===v?'selected':''} onClick={()=>setView(v)}>{v}</button>)}</div>{view==='screens'?<nav>{groups.map(group=><section key={group}><h3>{group}</h3>{screenCatalog.filter(s=>s.group===group).map(s=><button key={s.id} aria-current={screen===s.id?'page':undefined} className={screen===s.id?'active':''} onClick={()=>navigate(s.id)}><span>{String(screenCatalog.indexOf(s)+1).padStart(2,'0')}</span>{s.title}</button>)}</section>)}</nav>:<p className="sidebar-note">One source of truth.<br/>The preview renders the actual React Native components—not a separate HTML recreation.</p>}<a href="references/manifest.json">Reference manifest ↗</a></aside>
  <main><header className="gallery-header"><div><p className="eyebrow">THE PRODUCT, MADE TANGIBLE</p><h1>{view==='screens'?screenCatalog.find(s=>s.id===screen)?.title:view==='components'?'Built to feel like CheatCode.':'Approved visual direction.'}</h1><p>36 screen compositions. Shared objects. A consistent experience.</p></div><span className="version">NATIVE + WEB / v2</span></header>
  {view==='screens'?<><div className="toolbar"><label>Viewport<select aria-label="Viewport width" value={width} onChange={e=>setWidth(Number(e.target.value))}><option value="320">320 · compact</option><option value="390">390 · default</option><option value="430">430 · large</option></select></label><label>Text<select aria-label="Text size" value={state.textScale} onChange={e=>setState(s=>({...s,textScale:Number(e.target.value)}))}><option value="1">Default</option><option value="1.2">Larger</option><option value="1.4">Largest</option></select></label><label>State<select aria-label="Preview state" value={condition} onChange={e=>setCondition(e.target.value)}><option value="default">Default</option><option value="loading">Loading</option><option value="error">Load failure</option><option value="empty">Empty data</option><option value="missing-chart">Missing candles</option><option value="short">Short setup</option><option value="expired">Expired setup</option><option value="send-error">Message failure</option></select></label><button onClick={()=>{setState(initialState);setData(exampleData);setCondition('default');report('Preview reset.');}}>Reset</button></div><div className="stage">{phone}<aside className="notes"><p className="eyebrow">IMPLEMENTATION REFERENCE</p><h2>The object does the explaining.</h2><p>Keep this composition. Connect your data and actions without rebuilding its layout.</p><dl><dt>Import</dt><dd><code>@/ui/design-kit</code></dd><dt>Screen identifier</dt><dd><code>{screen}</code></dd><dt>Source</dt><dd><code>screens.tsx</code><br/><code>trading.tsx · learning.tsx<br/>conversation.tsx · primitives.tsx</code></dd></dl><div className="rule">One primary action.<br/>No nested metric cards.<br/>Violet belongs to Kai.<br/>Volt belongs to the user.</div><h3>Action inspector</h3><pre aria-live="polite">{event}</pre><p className="small">Illustrative data. Orders, accounts, messages and notifications are local previews. The host supplies real services.</p></aside></div></>:view==='components'?<ComponentGallery state={state} update={patch=>setState(s=>({...s,...patch}))} send={send} />:<div className="reference-grid">{referenceBoards.map(board=><figure key={board.file}><img src={`references/${board.file}`} alt={board.title} loading="lazy"/><figcaption>{board.title}</figcaption></figure>)}</div>}
  <footer>Code is the implementation reference. Images document the approved direction. Validate changes at 320 / 390 / 430 and with larger text.</footer></main>
  {modal&&<div className="modal-backdrop" onClick={()=>setModal(null)}><section role="dialog" aria-modal="true" aria-label={modal.title} className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close dialog" autoFocus onClick={()=>setModal(null)}>×</button><p className="eyebrow">INTERACTIVE PREVIEW</p><h2>{modal.title}</h2><p>{modal.text}</p>{modal.quiz&&<div className="quiz-options">{[state.ownedShares,Math.min(100,state.ownedShares+10),Math.min(100,state.ownedShares+25)].filter((v,i,a)=>a.indexOf(v)===i).map(v=><button key={v} onClick={()=>{if(v===state.ownedShares){setModal(null);navigate('lesson-complete');}else setModal(m=>m?{...m,text:'Think of 100 equal shares as 100 percent. Each share represents 1 percent. Try again.'}:null);}}>{v}%</button>)}</div>}</section></div>}
  </div>;
}
function ComponentGallery({state,update,send}:{state:KitState;update:(patch:Partial<KitState>)=>void;send:(text:string)=>Promise<void>}){
  const [notice,setNotice]=useState('Tap a component to inspect its behavior.');const click=()=>setNotice('Action received. Connect the callback to your app handler.');
  const samples:[string,React.ReactNode][]=[
    ['TradeIdeaPreview',<TradeIdeaPreview idea={exampleTrade} noLogo onOpen={click}/>],
    ['TradeChart + PriceLevels',<><TradeChart idea={exampleTrade} selected={state.level}/><PriceLevels idea={exampleTrade} selected={state.level} onSelect={level=>update({level})}/><RiskRewardBar idea={exampleTrade}/></>],
    ['TradeLifecycle',<TradeLifecycle status="entry_reached"/>],
    ['OwnershipGrid',<OwnershipGrid selected={state.ownedShares} onChange={ownedShares=>update({ownedShares})}/>],
    ['BeltEmblem + ProgressRing',<ProgressRing progress={.68} size={200}><BeltEmblem/><span style={{color:color.text}}>68%</span></ProgressRing>],
    ['CandleAnatomy',<CandleAnatomy selected={state.candlePart} onSelect={candlePart=>update({candlePart})}/>],
    ['KaiMessage',<KaiMessage text="178 changed sides. Watch it hold." compact/>],
    ['ConversationThread',<ConversationThread messages={exampleData.messages}/>],
    ['CircleStories',<CircleStories rooms={exampleData.rooms} onOpen={click}/>],
    ['MessageComposer · Kai',<MessageComposer onSend={send}/>],
    ['MessageComposer · Community',<MessageComposer kind="community" onSend={send}/>],
    ['ActionButton',<><ActionButton label="Review setup" onPress={click}/><ActionButton label="Ask Kai why" variant="kai" onPress={click}/><ActionButton label="Secondary action" variant="secondary" onPress={click}/><ActionButton label="Unavailable" disabled onPress={click}/></>],
    ['LessonPath',<LessonPath lessons={exampleData.lessons} onOpen={click}/>],
    ['SkillChecklist',<SkillChecklist skills={exampleData.skills}/>],
    ['VideoLesson',<VideoLesson {...exampleData.video} onPlay={click} onTranscript={click}/>],
    ['MemberProfile',<MemberProfile name="Jordan" rank="white" subtitle="Guided · Paper"/>],
    ['SelectionRow + SettingToggle',<><SelectionRow title="Learn" detail="Make your first stock make sense." selected onPress={click}/><SettingToggle title="Reduce motion" value={state.reducedMotion} onChange={reducedMotion=>update({reducedMotion})}/></>],
    ['ProductReveal',<ProductReveal/>],
  ];
  return <><p className="component-notice" aria-live="polite">{notice}</p><DesignKitProvider textScale={state.textScale} reducedMotion={state.reducedMotion}><div className="component-grid">{samples.map(([title,component])=><section key={title}><h2>{title}</h2><div className="component-stage">{component}</div></section>)}</div></DesignKitProvider></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
