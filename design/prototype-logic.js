class Component extends DCLogic {
  state = { screen: 'welcome', goal: 'day', risk: 'balanced', obTapped: false, watching: false, kaiSheet: false, hasPosition: false, ticks: null, kaiChars: 0, ctx: 'kai', openedFrom: false, pending: false, threadsOpen: false, tickerSection: 'overview', exp: 'new', focus: ['tech', 'ai'], alertTab: 'active', activeExpanded: false, watchExpanded: false };
  componentDidMount() {
    this.__kaiFull = "The room leans bullish and the volume claim checks out \u2014 but the setup is still waiting on a hold above 504.";
    this.__startTyping();
    const ticks = [];
    let p = 501.2;
    for (let i = 0; i < 48; i++) { p += (Math.random() - 0.38) * 2.6; if (p > 518.5) p = 518.5 - Math.random() * 2; if (p < 499.5) p = 499.5 + Math.random() * 2; ticks.push(p); }
    this.setState({ ticks });
    this.__tickTimer = setInterval(() => {
      this.setState(s => {
        if (!s.ticks) return {};
        const last = s.ticks[s.ticks.length - 1];
        let next = last + (Math.random() - 0.47) * 2.8;
        if (next > 518.5) next = last - Math.random() * 2.4;
        if (next < 499.5) next = last + Math.random() * 2.4;
        return { ticks: [...s.ticks.slice(1), next] };
      });
    }, 650);
  }
  __startTyping() {
    clearInterval(this.__kaiTimer);
    this.__kaiTimer = setInterval(() => {
      this.setState(s => {
        if (s.kaiChars >= this.__kaiFull.length) {
          clearInterval(this.__kaiTimer);
          this.__kaiRestart = setTimeout(() => { this.setState({ kaiChars: 0 }); this.__startTyping(); }, 8000);
          return {};
        }
        return { kaiChars: s.kaiChars + 2 };
      });
    }, 28);
  }
  componentWillUnmount() { clearInterval(this.__kaiTimer); clearTimeout(this.__kaiRestart); clearInterval(this.__tickTimer); }
  __go(screen) { return () => this.setState({ screen, kaiSheet: false }); }
  __voice(text, term) {
    const exp = this.state.exp;
    if (exp === 'pro') return text.replace('Good morning, Kway. ', '');
    if (exp !== 'new' || !term) return text;
    const glossary = {
      confirmed: 'Confirmed means the move Kai was waiting for actually happened \u2014 not just a guess.',
      cleared: 'Cleared the level means price moved above a price that had been holding it back.',
      drift: 'Drift is how far your mix has wandered from the split you chose.',
      volume: 'Volume is how many shares changed hands \u2014 more of it makes a move more believable.',
      invalidating: 'Invalidating means price is close to proving the idea wrong, so Kai would drop it.',
      thesis: 'A thesis is the reason you own something and what would make you stop.'
    };
    const note = glossary[term];
    return note ? text + ' \u2014 ' + note : text;
  }
  __onboard() {
    const selBg = 'linear-gradient(160deg, rgba(200,255,0,0.14), rgba(200,255,0,0.04) 55%, rgba(23,23,28,0.6))';
    const selBr = '1px solid rgba(200,255,0,0.6)';
    const unBg = 'linear-gradient(160deg, rgba(255,247,232,0.05), rgba(23,23,28,0.7))';
    const unBr = '0.5px solid rgba(255,247,232,0.16)';
    const exp = this.state.exp, focus = this.state.focus || [];
    const has = (k) => focus.indexOf(k) >= 0;
    const tog = (k) => () => this.setState(s => {
      const f = (s.focus || []).slice(), i = f.indexOf(k);
      if (i >= 0) f.splice(i, 1); else f.push(k);
      return { focus: f };
    });
    const chip = (k) => ({
      bg: has(k) ? 'rgba(200,255,0,0.12)' : 'transparent',
      br: has(k) ? '0.5px solid rgba(200,255,0,0.55)' : '0.5px solid rgba(255,247,232,0.18)',
      c: has(k) ? '#C8FF00' : '#B9B0A8'
    });
    const names = { tech: 'big tech', ai: 'AI & semis', energy: 'energy', etf: 'index ETFs', crypto: 'crypto-linked names', earnings: 'earnings plays' };
    const picked = focus.map(k => names[k]).filter(Boolean);
    const list = picked.length === 0 ? 'the whole market' : (picked.length === 1 ? picked[0] : picked.slice(0, -1).join(', ') + ' and ' + picked[picked.length - 1]);
    const t = chip('tech'), a = chip('ai'), en = chip('energy'), et = chip('etf'), cr = chip('crypto'), ea = chip('earnings');
    return {
      goOb4: this.__go('ob4'), sOb4: this.state.screen === 'ob4',
      setExpNew: () => this.setState({ exp: 'new' }),
      setExpSome: () => this.setState({ exp: 'some' }),
      setExpPro: () => this.setState({ exp: 'pro' }),
      expIsNew: exp === 'new', expIsSome: exp === 'some', expIsPro: exp === 'pro',
      expNewBg: exp === 'new' ? selBg : unBg, expNewBorder: exp === 'new' ? selBr : unBr,
      expSomeBg: exp === 'some' ? selBg : unBg, expSomeBorder: exp === 'some' ? selBr : unBr,
      expProBg: exp === 'pro' ? selBg : unBg, expProBorder: exp === 'pro' ? selBr : unBr,
      toggleTech: tog('tech'), toggleAi: tog('ai'), toggleEnergy: tog('energy'),
      toggleEtf: tog('etf'), toggleCrypto: tog('crypto'), toggleEarnings: tog('earnings'),
      fTechBg: t.bg, fTechBorder: t.br, fTechColor: t.c,
      fAiBg: a.bg, fAiBorder: a.br, fAiColor: a.c,
      fEnergyBg: en.bg, fEnergyBorder: en.br, fEnergyColor: en.c,
      fEtfBg: et.bg, fEtfBorder: et.br, fEtfColor: et.c,
      fCryptoBg: cr.bg, fCryptoBorder: cr.br, fCryptoColor: cr.c,
      fEarnBg: ea.bg, fEarnBorder: ea.br, fEarnColor: ea.c,
      focusSummary: picked.length ? 'Kai will scan ' + list + ' first.' : 'Pick at least one, or Kai scans everything.',
      focusShort: list,
      expLabel: exp === 'new' ? 'New to this' : (exp === 'some' ? 'Some experience' : 'Trades actively'),
      cycleExp: () => this.setState(s => ({ exp: s.exp === 'new' ? 'some' : (s.exp === 'some' ? 'pro' : 'new') })),
      expLine: exp === 'new' ? 'I explain every term the first time it appears.' : (exp === 'pro' ? 'I lead with levels and numbers, no preamble.' : 'I keep it plain but skip the basics.')
    };
  }
  __chart(scale) {
    const ticks = this.state.ticks || [];
    if (!ticks.length) return { pts: '', y: 46, price: '\u2014', pct: '', color: '#B9B0A8' };
    const h = scale.h, top = scale.top, bot = scale.bot;
    const lo = Math.min.apply(null, ticks) - 1, hi = Math.max.apply(null, ticks) + 1;
    const toY = (p) => Math.max(2, Math.min(h - 2, (hi - p) / (hi - lo) * h));
    const step = 330 / (ticks.length - 1);
    const pts = ticks.map((p, i) => (i * step).toFixed(1) + ',' + toY(p).toFixed(1)).join(' ');
    const last = ticks[ticks.length - 1];
    const pct = (last / 498.9 - 1) * 100;
    return { pts, y: toY(last).toFixed(1), price: last.toFixed(2), pct: (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%', color: pct >= 0 ? '#35D07F' : '#FF5A5F' };
  }
  __candles() {
    const ticks = this.state.ticks || [];
    const H = 152, PAD = 12;
    if (!ticks.length) return { candles: null, candleLastY: 74, candleLabelTop: '68px', yTarget: 20, yEntry: 76, yStop: 132, topTarget: '14px', topEntry: '70px', topStop: '126px', calloutTop: '30px', calloutLeft: '72px', targetOp: 1, entryOp: 1, stopOp: 1, targetTxt: '520.00', entryTxt: '504.00', stopTxt: '498.00' };
    const n = 26, w = 300 / n, body = w * 0.55;
    const src = ticks.slice(-n - 1);
    const lo1 = Math.min.apply(null, src), hi1 = Math.max.apply(null, src);
    const range = Math.max(hi1 - lo1, 2.5), pad = range * 0.22;
    const lo0 = lo1 - pad, hi0 = hi1 + pad;
    const raw = (p) => PAD + (hi0 - p) * (H - PAD * 2) / (hi0 - lo0);
    const toY = (p) => Math.max(6, Math.min(H - 6, raw(p)));
    const inside = (p) => p > lo0 && p < hi0;
    const els = [];
    let wickTop = H, wickBot = 0;
    const bars = [];
    for (let k = 0; k < n; k++) {
      const o = src[k] != null ? src[k] : 504, c = src[k + 1] != null ? src[k + 1] : o;
      const spread = 0.25 + ((k * 37) % 11) / 22;
      const hh = Math.max(o, c) + spread, ll = Math.min(o, c) - spread;
      const col = c >= o ? '#35D07F' : '#FF5A5F';
      const x = k * w + w / 2;
      const yh = toY(hh), yl = toY(ll);
      if (yh < wickTop) wickTop = yh;
      if (yl > wickBot) wickBot = yl;
      bars.push({ x: x, top: yh, bot: yl });
      els.push(React.createElement('line', { key: 'w' + k, x1: x, x2: x, y1: yh, y2: yl, stroke: col, strokeWidth: 0.9 }));
      const yTop = toY(Math.max(o, c)), hgt = Math.max(2, toY(Math.min(o, c)) - yTop);
      els.push(React.createElement('rect', { key: 'b' + k, x: x - body / 2, y: yTop, width: body, height: hgt, fill: col, rx: 0.6 }));
    }
    const last = src[src.length - 1] != null ? src[src.length - 1] : 504;
    const lastY = toY(last);
    const px = (y) => y + 8;
    // ONE ordered collision pass over all four chips: nothing can share a y
    const chips = [
      { id: 'target', p: 520, y: toY(520), off: !inside(520) },
      { id: 'entry', p: 504, y: toY(504), off: !inside(504) },
      { id: 'stop', p: 498, y: toY(498), off: !inside(498) },
      { id: 'live', p: last, y: lastY, off: false }
    ].sort((a, b) => a.y - b.y);
    let prev = -99;
    chips.forEach(function (ch) {
      let t = px(ch.y) - 7;
      if (t - prev < 17) t = prev + 17;
      ch.top = t;
      prev = t;
    });
    const get = (id) => chips.filter(c => c.id === id)[0];
    const tg = get('target'), en = get('entry'), st = get('stop'), lv = get('live');
    const caret = (c) => c.off ? (c.y <= H / 2 ? '\u25b2 ' : '\u25bc ') : '';
    // scan candidate slots: for each horizontal anchor, use the LOCAL band under the box
    const CW = 80, CH = 32, M = 6;
    const anchors = [64, 8, 140, 210];
    let slot = null;
    for (let ai = 0; ai < anchors.length && !slot; ai++) {
      const L = anchors[ai], R = L + CW;
      const local = bars.filter(b => b.x > L - 4 && b.x < R + 4);
      const lt = local.length ? Math.min.apply(null, local.map(b => b.top)) : H;
      const lb = local.length ? Math.max.apply(null, local.map(b => b.bot)) : 0;
      if (lt - M >= CH + 4) slot = { left: L, top: Math.max(4, lt - CH - M) };
      else if (H - lb - M >= CH + 4) slot = { left: L, top: Math.min(H - CH - 4, lb + M) };
    }
    if (!slot) slot = { left: 8, top: wickTop > H - wickBot ? 4 : Math.min(H - CH - 4, wickBot + M) };
    const callout = px(slot.top);
    return {
      candles: els,
      candleLastY: lastY.toFixed(1),
      candleLabelTop: lv.top.toFixed(0) + 'px',
      yTarget: tg.y.toFixed(1), yEntry: en.y.toFixed(1), yStop: st.y.toFixed(1),
      targetOp: tg.off ? 0.22 : 0.75, entryOp: en.off ? 0.22 : 0.75, stopOp: st.off ? 0.22 : 0.75,
      topTarget: tg.top.toFixed(0) + 'px', topEntry: en.top.toFixed(0) + 'px', topStop: st.top.toFixed(0) + 'px',
      targetTxt: caret(tg) + '520.00', entryTxt: caret(en) + '504.00', stopTxt: caret(st) + '498.00',
      calloutTop: callout.toFixed(0) + 'px', calloutLeft: (slot.left + 8).toFixed(0) + 'px'
    };
  }
  renderVals() {
    const s = this.state.screen;
    const sel = 'linear-gradient(160deg, rgba(200,255,0,0.14), rgba(200,255,0,0.04) 55%, rgba(23,23,28,0.6))';
    const selB = '1px solid rgba(200,255,0,0.6)';
    const un = 'linear-gradient(160deg, rgba(255,247,232,0.06), rgba(23,23,28,0.7))';
    const unB = '0.5px solid rgba(255,247,232,0.16)';
    const caps = { careful: '$20', balanced: '$60', aggressive: '$140' };
    const risks = { careful: '$19', balanced: '$58', aggressive: '$136' };
    const modes = { day: 'Day Trade', swing: 'Swing', invest: 'Invest' };
    const volt = '#C8FF00', gray = '#B9B0A8';
    const main = this.__chart({ h: 92, top: 548, bot: 455 });
    const home = this.__chart({ h: 88, top: 560, bot: 450 });
    const asset = this.__chart({ h: 130, top: 552, bot: 452 });
    const full = this.__kaiFull || '';
    const kaiDone = this.state.kaiChars >= full.length;
    const g = this.state.goal, r = this.state.risk;
    const nav = {};
    ['Welcome:welcome', 'Ob1:ob1', 'Ob2:ob2', 'Ob3:ob3', 'Home:home', 'Alerts:alerts', 'Community:community', 'Room:room', 'Trade:asset', 'Asset:asset', 'Review:review', 'Account:account'].forEach(pair => {
      const [name, scr] = pair.split(':');
      nav['go' + name] = this.__go(scr);
    });
    return {
      sWelcome: s === 'welcome', sOb1: s === 'ob1', sOb2: s === 'ob2', sOb3: s === 'ob3',
      sHome: s === 'home', sAlerts: s === 'alerts', sCommunity: s === 'community', sRoom: s === 'room',
      sTrade: s === 'trade', sAsset: s === 'asset', sReview: s === 'review', sConfirmed: s === 'confirmed', sAccount: s === 'account',
      inApp: ['home', 'alerts', 'community', 'room', 'trade', 'asset', 'ticker', 'account'].includes(s),
      cHome: s === 'home' ? volt : gray,
      cAlerts: s === 'alerts' ? volt : gray,
      cCommunity: (s === 'community' || s === 'room') ? volt : gray,
      cTrade: (s === 'trade' || s === 'asset' || s === 'review' || s === 'ticker') ? volt : gray,
      cAccount: s === 'account' ? volt : gray,
      ...nav,
      pickDay: () => this.setState({ goal: 'day' }),
      pickSwing: () => this.setState({ goal: 'swing' }),
      pickInvest: () => this.setState({ goal: 'invest' }),
      goalDayBg: g === 'day' ? sel : un, goalDayBorder: g === 'day' ? selB : unB,
      goalSwingBg: g === 'swing' ? sel : un, goalSwingBorder: g === 'swing' ? selB : unB,
      goalInvestBg: g === 'invest' ? sel : un, goalInvestBorder: g === 'invest' ? selB : unB,
      pickCareful: () => this.setState({ risk: 'careful' }),
      pickBalanced: () => this.setState({ risk: 'balanced' }),
      pickAggressive: () => this.setState({ risk: 'aggressive' }),
      riskCarefulBg: r === 'careful' ? sel : un, riskCarefulBorder: r === 'careful' ? selB : unB,
      riskBalancedBg: r === 'balanced' ? sel : un, riskBalancedBorder: r === 'balanced' ? selB : unB,
      riskAggBg: r === 'aggressive' ? sel : un, riskAggBorder: r === 'aggressive' ? selB : unB,
      capLabel: caps[r], riskDollar: risks[r], modeLabel: modes[g],
      cycleMode: () => this.setState(s => ({ goal: s.goal === 'day' ? 'swing' : (s.goal === 'swing' ? 'invest' : 'day') })),
      briefing: this.__voice(g === 'day'
        ? "Good morning, Kway. Futures are slightly higher, technology is leading premarket, and CPI is scheduled for 10:00 AM. I'm monitoring four intraday setups. META is the strongest and has just confirmed."
        : (g === 'swing'
          ? "Good morning, Kway. Nothing needs a decision at the open. Three swing theses are intact, and META just cleared the level that turns it into a multi-day hold. Earnings season starts in nine days."
          : "Good morning, Kway. Your portfolio is on track and drift is inside range. This month's contribution is ready to review, and META's reclaim matters more for the position you already hold than for a new one."), g === 'day' ? 'confirmed' : (g === 'swing' ? 'cleared' : 'drift')),
      artifactLine: g === 'day'
        ? 'Held above $504 with 1.6× volume. The setup is now actionable.'
        : (g === 'swing'
          ? 'Cleared $504 on real volume. Thesis is intact for a multi-day hold.'
          : 'Reclaimed $504. Relevant to your existing position, not a new entry.'),
      whyStrongest: this.__voice(g === 'day'
        ? "It's the only setup where the confirmation actually arrived \u2014 three candles above 504 with volume at 1.6\u00d7 average. NVDA is 1% from invalidating, AAPL is nine days out from earnings, and CPI at 10:00 is the day's main risk to all of it."
        : (g === 'swing'
          ? "It's the only thesis with a catalyst inside the hold window \u2014 volume confirmed the reclaim and earnings land before the target. NVDA is 1% from invalidating, and CPI at 10:00 is the near-term risk."
          : "For a long horizon it's less about today's candle: ad revenue growth and margin recovery are the thesis. The reclaim just removes the near-term downside case. CPI at 10:00 is noise at your horizon."), g === 'day' ? 'volume' : (g === 'swing' ? 'invalidating' : 'thesis')),
      tapLevel: () => this.setState({ obTapped: true }),
      tapBg: this.state.obTapped ? 'rgba(200,255,0,0.35)' : 'rgba(200,255,0,0.10)',
      obTapped: this.state.obTapped, obNotTapped: !this.state.obTapped,
      finishOnboarding: () => this.setState({ screen: 'home', watching: true }),
      openKai: () => this.setState({ screen: 'asset', ctx: 'kai', kaiSheet: false }),
      openFromAlert: () => this.setState({ screen: 'asset', ctx: 'kai', openedFrom: true, kaiSheet: false }),
      setCtxKai: () => this.setState({ ctx: 'kai' }),
      ...this.__onboard(),
      openThreads: () => this.setState({ threadsOpen: true }),
      closeThreads: () => this.setState({ threadsOpen: false }),
      threadsOpen: this.state.threadsOpen,
      goTicker: () => this.setState({ screen: 'ticker' }),
      sTicker: this.state.screen === 'ticker',
      setTickerOverview: () => this.setState(s => ({ tickerSection: s.tickerSection === 'overview' ? '' : 'overview' })),
      setTickerTech: () => this.setState(s => ({ tickerSection: s.tickerSection === 'tech' ? '' : 'tech' })),
      setTickerCommunity: () => this.setState(s => ({ tickerSection: s.tickerSection === 'community' ? '' : 'community' })),
      tickerOverview: this.state.tickerSection === 'overview',
      tickerTech: this.state.tickerSection === 'tech',
      tickerCommunity: this.state.tickerSection === 'community',
      tickerOverviewChevron: this.state.tickerSection === 'overview' ? 'rotate(180deg)' : 'none',
      tickerTechChevron: this.state.tickerSection === 'tech' ? 'rotate(180deg)' : 'none',
      tickerCommunityChevron: this.state.tickerSection === 'community' ? 'rotate(180deg)' : 'none',
      setTabActive: () => this.setState({ alertTab: 'active' }),
      toggleActive: () => this.setState(s => ({ activeExpanded: !s.activeExpanded })),
      toggleWatchCard: () => this.setState(s => ({ watchExpanded: !s.watchExpanded })),
      activeExpanded: this.state.activeExpanded,
      watchExpanded: this.state.watchExpanded,
      activeToggleLabel: this.state.activeExpanded ? 'Hide setup details' : 'View setup details',
      watchToggleLabel: this.state.watchExpanded ? 'Hide setup details' : 'View setup details',
      activeChevron: this.state.activeExpanded ? 'rotate(180deg)' : 'none',
      watchChevron: this.state.watchExpanded ? 'rotate(180deg)' : 'none',
      setTabWatching: () => this.setState({ alertTab: 'watching' }),
      setTabHistory: () => this.setState({ alertTab: 'history' }),
      tabIsActive: this.state.alertTab === 'active',
      tabIsWatching: this.state.alertTab === 'watching',
      tabIsHistory: this.state.alertTab === 'history',
      tabActiveBg: this.state.alertTab === 'active' ? 'rgba(200,255,0,0.12)' : 'transparent',
      tabActiveBorder: this.state.alertTab === 'active' ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      tabActiveColor: this.state.alertTab === 'active' ? volt : gray,
      tabActiveDot: this.state.alertTab === 'active' ? volt : '#3a3a42',
      tabActiveUnderline: this.state.alertTab === 'active' ? volt : 'transparent',
      tabWatchUnderline: this.state.alertTab === 'watching' ? volt : 'transparent',
      tabHistUnderline: this.state.alertTab === 'history' ? volt : 'transparent',
      tabWatchBg: this.state.alertTab === 'watching' ? 'rgba(200,255,0,0.12)' : 'transparent',
      tabWatchBorder: this.state.alertTab === 'watching' ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      tabWatchColor: this.state.alertTab === 'watching' ? volt : gray,
      tabHistBg: this.state.alertTab === 'history' ? 'rgba(200,255,0,0.12)' : 'transparent',
      tabHistBorder: this.state.alertTab === 'history' ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      tabHistColor: this.state.alertTab === 'history' ? volt : gray,
      setCtxAlert: () => this.setState({ ctx: 'alert' }),
      setCtxCommunity: () => this.setState({ ctx: 'community' }),
      ctxCommunityNoPos: this.state.ctx === 'community' && !this.state.hasPosition,
      ctxCommUnderline: this.state.ctx === 'community' ? volt : 'transparent',
      ctxCommColor: this.state.ctx === 'community' ? volt : '#918A82',
      openedFrom: this.state.openedFrom,
      ctxKaiNoPos: this.state.ctx === 'kai' && !this.state.hasPosition,
      ctxAlertNoPos: this.state.ctx === 'alert' && !this.state.hasPosition,
      ctxKaiBg: this.state.ctx === 'kai' ? 'rgba(200,255,0,0.12)' : 'transparent',
      ctxKaiBorder: this.state.ctx === 'kai' ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      ctxKaiColor: this.state.ctx === 'kai' ? volt : gray,
      ctxKaiUnderline: this.state.ctx === 'kai' ? volt : 'transparent',
      ctxAlertUnderline: this.state.ctx === 'alert' ? volt : 'transparent',
      ctxAlertBg: this.state.ctx === 'alert' ? 'rgba(200,255,0,0.12)' : 'transparent',
      ctxAlertBorder: this.state.ctx === 'alert' ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      ctxAlertColor: this.state.ctx === 'alert' ? volt : gray,
      closeKai: () => this.setState({ kaiSheet: false }),
      kaiSheet: this.state.kaiSheet,
      toggleWatch: () => this.setState(st => ({ watching: !st.watching })),
      watchAndClose: () => this.setState({ watching: true, kaiSheet: false }),
      watchBtnBg: this.state.watching ? 'rgba(200,255,0,0.10)' : volt,
      watchBtnColor: this.state.watching ? volt : '#0B0B0E',
      watchBtnBorder: this.state.watching ? '0.5px solid rgba(200,255,0,0.5)' : '0.5px solid transparent',
      watchBtnLabel: this.state.watching ? 'Watching \u2713' : 'Watch this',
      starFill: this.state.watching ? volt : 'none',
      submitOrder: () => this.setState({ screen: 'confirmed', pending: true, hasPosition: false }),
      simulateFill: () => this.setState({ pending: false, hasPosition: true }),
      orderPending: this.state.pending && !this.state.hasPosition,
      hasPosition: this.state.hasPosition, noPosition: !this.state.hasPosition && !this.state.pending,
      assetStateLabel: this.state.hasPosition ? 'Position open \u00b7 Long $650' : (this.state.pending ? 'Order pending \u00b7 Buy limit 504.00' : (parseFloat(main.price) < 498 ? 'Invalidated \u00b7 closed below 498' : 'Ready \u00b7 confirmed')),
      monitoringCount: this.state.hasPosition ? 4 : 3,
      liveTickPoints: main.pts, liveTickY: main.y, liveTickPrice: main.price, liveTickPct: main.pct, liveTickColor: main.color,
      homeTickPoints: home.pts, homeTickY: home.y,
      assetTickPoints: asset.pts, assetTickY: asset.y,
      ...this.__candles(),
      entryDistance: Math.abs(504 - parseFloat(main.price || 504)).toFixed(1) + ' pts',
      kaiRead: full.slice(0, this.state.kaiChars),
      kaiCursorDisplay: kaiDone ? 'none' : 'inline-block',
    };
  }
}
