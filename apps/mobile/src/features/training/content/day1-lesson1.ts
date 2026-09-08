import type { LessonContent } from '../types';

/**
 * DAY 1 · LESSON 1 — "What Is a Stock?"
 * ===========================================================================
 *
 * THE CANONICAL TEMPLATE. The spec writes this lesson out screen by screen and
 * says: build exactly this. It is the reference every other lesson is authored
 * against, and it is the reason the engine exists in the shape it does — the
 * thirteen beats below use ten different screen types, so a later author can
 * see one working example of each.
 *
 * Everything here is DATA. There is no component, no string, and no number in
 * this file that the engine knows about specifically. Writing Day 2 Lesson 1
 * means writing a file with this shape.
 *
 * The thirteen beats, in the spec's own order:
 *   1  Opening                  2  Core idea + quiz        3  Why companies have stocks
 *   4  Human video              5  Price is an auction     6  Quick check
 *   7  Market value vs company  8  What makes price move   9  Trader vs investor
 *  10  Sorting game            11  Kai check              12  Real market application
 *  13  Final mastery challenge  → completion
 */
export const DAY1_LESSON1: LessonContent = {
  lessonId: 'd1l1',
  screens: [
    /* 1 ── Opening ───────────────────────────────────────────────────────── */
    {
      id: 's1-opening',
      type: 'opening',
      eyebrow: 'DAY 1 · MARKET BASICS',
      title: 'What Are You Actually Buying?',
      body: [
        'Before charts, before entries, before any of it — one question that most people never get a straight answer to.',
        'When you buy a stock, something real changes hands. By the end of this lesson you will be able to say exactly what.',
      ],
      image: require('../../../../assets/training/thumb_market_basics.jpg'),
      cta: 'Start Lesson',
    },

    /* 2 ── Core idea + quiz ──────────────────────────────────────────────── */
    {
      id: 's2-core-idea',
      type: 'quiz',
      eyebrow: 'THE CORE IDEA',
      title: 'A Company, Cut Into Pieces',
      body: [
        'A company decides to divide itself into a fixed number of pieces. Say a million of them.',
        'Each piece is a share. Owning one share means you own one of those million pieces of the business.',
      ],
      visual: {
        kind: 'share_grid',
        columns: 10,
        rows: 5,
        highlightIndex: 27,
        totalLabel: '1,000,000 shares',
        highlightLabel: 'A tiny ownership interest',
      },
      keyLine: 'A share is a tiny ownership interest in a real business.',
      prompt: 'So if you buy 10 shares, what do you own?',
      options: [
        { id: 'a', label: '10 small ownership interests in the company' },
        { id: 'b', label: 'A loan the company has to pay back' },
        { id: 'c', label: '10 percent of the company' },
        { id: 'd', label: 'A promise from your broker' },
      ],
      correctId: 'a',
      whenCorrect:
        'Exactly. Ten shares out of a million is ten small ownership interests — a real, if tiny, claim on the business.',
      whenWrong:
        'Not quite. Ten shares out of a million is ten of the million pieces — ten small ownership interests. It is not a loan, and it is nowhere near ten percent.',
      competency: { key: 'stock_ownership', label: 'Stock ownership' },
      cta: 'Continue',
    },

    /* 3 ── Why companies have stocks ─────────────────────────────────────── */
    {
      id: 's3-why-stocks-exist',
      type: 'concept',
      eyebrow: 'WHY THIS EXISTS',
      title: 'Why Companies Sell Pieces of Themselves',
      body: [
        'A company that wants to grow needs money. Rather than borrow all of it, it can sell pieces of itself to people who want a share of what it becomes.',
        'That is the whole mechanism. The company raises money once; the pieces then change hands between investors for as long as the company exists.',
      ],
      visual: {
        kind: 'flow',
        steps: [
          { label: 'COMPANY', detail: 'needs money to grow' },
          { label: 'SELLS SHARES', detail: 'pieces of itself' },
          { label: 'INVESTORS BUY', detail: 'money in, ownership out' },
          { label: 'SHARES TRADE', detail: 'hand to hand, every day' },
        ],
        note: 'Everyday trading happens at the last step — investor to investor. The company is not on the other side of your order.',
      },
      cta: 'Continue',
    },

    /* 4 ── The human video ───────────────────────────────────────────────── */
    {
      id: 's4-kway-breakdown',
      type: 'video',
      eyebrow: 'KWAY BREAKDOWN',
      title: 'Forget the Textbook Definition',
      presenter: 'Kway',
      duration: '1:42',
      poster: require('../../../../assets/training/thumb_video.jpg'),
      /**
       * HONEST STATE: the script is written, the footage is not shot.
       *
       * MATRIX ROW: `white-1/what_is_a_stock` in
       * docs/training/BELT-CURRICULUM-MATRIX.md. That row carries three curated
       * candidates that could stand in for this breakdown — the strongest being
       * Martik Finance 2:31–4:02, whose two chapters map almost exactly onto
       * screens 2 and 3 of this lesson.
       *
       * NONE OF THEM IS WIRED IN HERE, DELIBERATELY. Putting an external video
       * in front of a paying member is the owner's call, not an authoring one,
       * so the candidates live in the matrix for review and this screen stays
       * what it honestly is. Switching to a curated pick later is a content
       * edit, not an engineering one: set `status: 'curated'` and add the
       * `curated` block — the renderer already draws it, and it will still
       * refuse to link out until `owner_approved` is true.
       *
       * The recommendation on that row is to film the 1:42. This is the first
       * human voice in the product and it is the one place a curated video
       * cannot do the job, because the job is "who is teaching you".
       */
      status: 'filming',
      statusNote:
        'This breakdown is being filmed. The lesson does not wait on it — everything it covers is on the card below.',
      outline: [
        'A ticker is a nickname. There is a real business underneath it.',
        'Traders hold for minutes or days — the thing being traded is still ownership.',
        'The chart is not the company. The chart is what people will pay for a piece of it right now.',
      ],
      afterCard: {
        title: 'Three things to hold on to',
        rows: [
          { label: 'The company', text: 'is the asset — the real business doing real work.' },
          { label: 'The stock', text: 'is ownership — your slice of that asset.' },
          { label: 'The chart', text: 'is the market price — what people will pay today.' },
        ],
      },
      cta: 'Continue',
    },

    /* 5 ── Price is an auction ───────────────────────────────────────────── */
    {
      id: 's5-auction',
      type: 'auction',
      eyebrow: 'BUYERS & SELLERS',
      title: 'Price Is an Auction',
      body: [
        'Nobody sets the price of a stock. It is the running result of an auction — buyers naming what they will pay, sellers naming what they will accept.',
        'The highest bid and the lowest offer sit either side of the last traded price. Nothing moves until somebody crosses the gap.',
      ],
      // No symbol on purpose: this is a teaching book on round numbers, and an
      // invented ticker rendered as a market object would be a small lie.
      bookLabel: 'EXAMPLE ORDER BOOK · NOT A LIVE MARKET',
      last: 100.0,
      bids: [
        { price: 99.99, size: 400 },
        { price: 99.98, size: 900 },
        { price: 99.97, size: 1200 },
        { price: 99.96, size: 700 },
        { price: 99.95, size: 2100 },
      ],
      asks: [
        { price: 100.01, size: 500 },
        { price: 100.02, size: 1100 },
        { price: 100.03, size: 800 },
        { price: 100.04, size: 1600 },
        { price: 100.05, size: 900 },
      ],
      lift: {
        price: 100.01,
        label: 'Aggressive buyer lifts the offer',
        explain:
          'A buyer who will not wait pays the lowest offer instead of bidding under it. That offer is gone, the next one up becomes the cheapest — and the price has moved without anyone deciding it should.',
      },
      caption: 'Bids sit below. Offers sit above. Price is wherever the two last met.',
      cta: 'Continue',
    },

    /* 6 ── Quick check ───────────────────────────────────────────────────── */
    {
      id: 's6-quick-check',
      type: 'quiz',
      eyebrow: 'QUICK CHECK',
      prompt:
        'Buyers keep stepping up and paying the offer instead of waiting. What happens to price?',
      options: [
        { id: 'a', label: 'Pressure upward — each buyer takes the cheapest offer left' },
        { id: 'b', label: 'Pressure downward — more buying means more supply' },
        { id: 'c', label: 'Nothing, until the company announces something' },
        { id: 'd', label: 'It depends on the broker' },
      ],
      correctId: 'a',
      whenCorrect:
        'Right. Every buyer who refuses to wait clears out the cheapest offer, and the next cheapest is higher. That is upward pressure.',
      whenWrong:
        'Look again at the ladder. Each impatient buyer takes the lowest offer available; the next lowest is a cent higher. Buying pressure pushes price up, not down.',
      kaiNote:
        'Later I will teach you whether that buying pressure actually matters — plenty of it goes nowhere. For now, just know which direction it pushes.',
      competency: { key: 'buyers_sellers', label: 'Buyers and sellers' },
      cta: 'Continue',
    },

    /* 7 ── Market value vs company value ─────────────────────────────────── */
    {
      id: 's7-market-cap',
      type: 'quiz',
      eyebrow: 'MARKET VALUE',
      title: 'What the Market Says the Whole Thing Is Worth',
      body: [
        'One share has a price. Multiply that by every share in existence and you get what the market currently says the whole company is worth. That number is the market capitalisation.',
        'You will never work this out by hand — every quote screen shows it. What matters is knowing what it is measuring.',
      ],
      visual: {
        kind: 'formula',
        lhs: 'Market cap',
        terms: ['share price', 'total shares'],
        result: 'what the market says the company is worth',
        note: 'It is the market’s opinion, priced. It is not the company’s bank balance.',
      },
      prompt: 'A company has 1,000,000 shares and each one trades at $20. What is its market cap?',
      options: [
        { id: 'a', label: '$20,000,000' },
        { id: 'b', label: '$1,000,000' },
        { id: 'c', label: '$20,000' },
        { id: 'd', label: 'There is not enough information' },
      ],
      correctId: 'a',
      whenCorrect: 'Correct. 1,000,000 shares at $20 each is a $20,000,000 market cap.',
      whenWrong:
        'Multiply the two numbers you were given: 1,000,000 shares × $20 a share = $20,000,000.',
      competency: { key: 'market_cap', label: 'Market cap' },
      cta: 'Continue',
    },

    /* 8 ── What makes price move ─────────────────────────────────────────── */
    {
      id: 's8-what-moves-price',
      type: 'concept',
      eyebrow: 'WHAT MOVES PRICE',
      title: 'Four Things, Constantly Arguing',
      body: [
        'Price is not a scoreboard for how good a company is. It is the running total of what everybody currently expects.',
      ],
      visual: {
        kind: 'cards',
        cards: [
          {
            label: 'Business',
            text: 'What the company actually does — sales, profit, growth, debt.',
          },
          {
            label: 'Expectations',
            text: 'What people believe is coming next, which is usually already priced in.',
          },
          {
            label: 'News',
            text: 'Anything that changes the story — earnings, products, lawsuits, rates.',
          },
          {
            label: 'Supply & demand',
            text: 'Who needs to buy or sell right now, and how badly.',
          },
        ],
      },
      keyLine:
        'Markets constantly update their EXPECTATIONS about the future. A great company can have a falling stock — because the expectation moved, not the business.',
      kaiNote:
        'This is why trading is about price behaviour and expectations, not about whether you like the company.',
      cta: 'Continue',
    },

    /* 9 ── Trader vs investor ────────────────────────────────────────────── */
    {
      id: 's9-trader-vs-investor',
      type: 'concept',
      eyebrow: 'TWO DIFFERENT JOBS',
      title: 'Trader or Investor?',
      body: [
        'Same instrument, completely different problem. Neither one is the smarter choice — they are answers to different questions.',
      ],
      visual: {
        kind: 'split',
        left: {
          title: 'INVESTOR',
          caption: 'Holds for years',
          lines: [
            'Buys the business and waits',
            'Cares what the company becomes',
            'Ignores most of what price does day to day',
          ],
        },
        right: {
          title: 'TRADER',
          caption: 'Holds minutes to weeks',
          lines: [
            'Buys a move, not a future',
            'Cares what price is doing right now',
            'Has a plan for being wrong before entering',
          ],
        },
      },
      kaiNote:
        'This is what changes when you set your mode. Day Trade, Swing and Invest ask me for different things, so I answer differently.',
      cta: 'Continue',
    },

    /* 10 ── Sorting game ─────────────────────────────────────────────────── */
    {
      id: 's10-sorting',
      type: 'sorting',
      eyebrow: 'YOUR TURN',
      title: 'Sort These Four',
      prompt: 'Tap a card, then tap the bucket it belongs in.',
      buckets: [
        { id: 'trader', label: 'TRADER', caption: 'Minutes to weeks' },
        { id: 'investor', label: 'INVESTOR', caption: 'Years' },
      ],
      cards: [
        {
          id: 'c1',
          label: '"I want to own this business for the next ten years."',
          bucketId: 'investor',
          why: 'A ten-year horizon is an ownership decision, not a price decision.',
        },
        {
          id: 'c2',
          label: '"I will exit if it closes below $182."',
          bucketId: 'trader',
          why: 'A predefined invalidation level is a trade plan — that is trader thinking.',
        },
        {
          id: 'c3',
          label: '"Earnings are in three days and I am out before then."',
          bucketId: 'trader',
          why: 'Timing around one event, with an exit already chosen, is a trade.',
        },
        {
          id: 'c4',
          label: '"I add a little every month and never look at the chart."',
          bucketId: 'investor',
          why: 'Regular buying with no regard for price is long-horizon investing.',
        },
      ],
      competency: { key: 'trader_vs_investor', label: 'Trader vs investor' },
      cta: 'Continue',
    },

    /* 11 ── Kai check ────────────────────────────────────────────────────── */
    {
      id: 's11-kai-check',
      type: 'kai_check',
      eyebrow: 'KAI CHECK',
      title: 'Say It in Your Own Words',
      prompt:
        'What is a stock? Two or three sentences, the way you would explain it to a friend who has never bought one.',
      placeholder: 'A stock is…',
      symbol: 'AAPL',
      timeframe: '1D',
      stage: 'day1_lesson1_free_response',
      selfAssessLabel: 'I explained it in my own words',
      competency: { key: 'free_response', label: 'Explaining it yourself' },
      cta: 'Continue',
    },

    /* 12 ── Real market application ──────────────────────────────────────── */
    {
      id: 's12-application',
      type: 'market_application',
      eyebrow: 'REAL MARKET',
      title: 'Put It on a Real Company',
      symbol: 'AAPL',
      companyName: 'Apple Inc.',
      quote: {
        price: 229.42,
        marketCapLabel: '$3.4T',
        // A worked example from the curriculum, not a live quote. Saying so is
        // the difference between a teaching number and a price we are claiming.
        asOf: 'Worked example — not a live quote',
      },
      scenario: {
        shares: 10,
        costLabel: '$2,294.20',
        movedPrice: 235.0,
        movedValueLabel: '$2,350.00',
        question: 'Price rises to $235. How much of Apple do you own now?',
        answer:
          'Exactly the same amount — 10 shares. What changed was the market price of each one, and therefore what your 10 shares are worth today.',
      },
      takeaways: [
        'Buying 10 shares at $229.42 costs about $2,294.20.',
        'Your ownership is measured in shares, never in dollars.',
        'A $3.4T market cap is what the market says all of Apple is worth right now.',
      ],
      cta: 'Continue',
    },

    /* 13 ── Final mastery challenge ──────────────────────────────────────── */
    {
      id: 's13-mastery',
      type: 'mastery_challenge',
      eyebrow: 'MASTERY CHALLENGE',
      title: 'Five Questions',
      intro: 'No hints and no teaching this time. Answer them the way you understand it.',
      passPct: 70,
      questions: [
        {
          id: 'm1',
          prompt: 'When you buy one share, what have you bought?',
          options: [
            { id: 'a', label: 'A small ownership interest in the business' },
            { id: 'b', label: 'A loan to the business' },
            { id: 'c', label: 'A bet placed with the broker' },
            { id: 'd', label: 'A share of the company’s bank account' },
          ],
          correctId: 'a',
          competency: { key: 'stock_ownership', label: 'Stock ownership' },
        },
        {
          id: 'm2',
          prompt: 'Who decides the price of a stock during the trading day?',
          options: [
            { id: 'a', label: 'Buyers and sellers, through the auction' },
            { id: 'b', label: 'The company’s finance department' },
            { id: 'c', label: 'The exchange, each morning' },
            { id: 'd', label: 'Your broker' },
          ],
          correctId: 'a',
          competency: { key: 'buyers_sellers', label: 'Buyers and sellers' },
        },
        {
          id: 'm3',
          prompt: 'A company reports record profits and the stock falls. Why is that possible?',
          options: [
            { id: 'a', label: 'The market expected even more, so expectations moved down' },
            { id: 'b', label: 'It is impossible — good news always lifts a stock' },
            { id: 'c', label: 'The company sold shares to make the price fall' },
            { id: 'd', label: 'Profits have nothing to do with a stock' },
          ],
          correctId: 'a',
          competency: { key: 'price_movement', label: 'Why price moves' },
        },
        {
          id: 'm4',
          prompt: 'A company has 2,000,000 shares trading at $15. What is its market cap?',
          options: [
            { id: 'a', label: '$30,000,000' },
            { id: 'b', label: '$2,000,000' },
            { id: 'c', label: '$15,000,000' },
            { id: 'd', label: '$300,000' },
          ],
          correctId: 'a',
          competency: { key: 'market_cap', label: 'Market cap' },
        },
        {
          id: 'm5',
          prompt: 'Which of these is a trader’s decision rather than an investor’s?',
          options: [
            { id: 'a', label: '"I am out if it loses the $182 level."' },
            { id: 'b', label: '"I will hold this for a decade."' },
            { id: 'c', label: '"I buy a little every payday."' },
            { id: 'd', label: '"I never look at the chart."' },
          ],
          correctId: 'a',
          competency: { key: 'trader_vs_investor', label: 'Trader vs investor' },
        },
      ],
      cta: 'See Your Result',
    },

    /* ── Completion ───────────────────────────────────────────────────────── */
    {
      id: 's14-completion',
      type: 'completion',
      title: 'You understand ownership.',
      masteryGain: 20,
      /* The idea, said once more, with the picture that taught it. Board 09's
         Lesson Complete screen repeats the concept rather than printing a
         receipt: the last thing somebody reads is what they walk away with. */
      restate: 'A share is part of a business. A simple idea, and a powerful foundation.',
      visual: {
        kind: 'share_grid',
        columns: 10,
        rows: 5,
        highlightIndex: 27,
        totalLabel: '1,000,000 shares',
        highlightLabel: 'The part you would own',
      },
      knowNow: [
        'What a share actually is, and what 10 of them means',
        'Why companies sell pieces of themselves in the first place',
        'That price is an auction between buyers and sellers, not a posted number',
        'What market cap measures — and what it does not',
        'Why a great company can still have a falling stock',
        'The difference between a trader’s decision and an investor’s',
      ],
      kaiMessage:
        'You know what you are buying now. Next I will show you what happens after you buy it — and the three numbers every trade hangs from: entry, stop and target.',
      nextLessonId: 'd1l2',
      nextLabel: 'Next: How a Trade Works',
      secondaryCta: 'Back to Day 1',
      cta: 'Continue',
    },
  ],
};
