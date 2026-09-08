"use client";
import { useState } from "react";
import type { Feature } from "@/sim/journey";
import { KaiOrb } from "./surfaces/kit";
import s from "./Journey.module.css";

function Kai({ children }: { children: React.ReactNode }) {
  return (
    <div className={s.kai}>
      <KaiOrb size={25} />
      <p>{children}</p>
    </div>
  );
}
export function MarketChart({ marked = false }: { marked?: boolean }) {
  return (
    <svg
      className={s.chart}
      viewBox="0 0 340 270"
      role="img"
      aria-label={
        marked
          ? "Illustrative NVDA chart: former resistance at 178 becomes support, resistance at 195"
          : "Illustrative NVDA price chart"
      }
    >
      <defs>
        <linearGradient
          id={marked ? "fill-marked" : "fill-plain"}
          x2="0"
          y2="1"
        >
          <stop stopColor="#32d6ff" stopOpacity=".2" />
          <stop offset="1" stopColor="#32d6ff" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[45, 100, 155, 210].map((y) => (
        <path key={y} d={`M0 ${y}H340`} stroke="#fff7e8" opacity=".08" />
      ))}
      <path
        d="M0 235L22 218L43 226L66 190L86 202L109 173L130 186L151 145L173 156L195 108L217 74L238 109L261 147L283 137L308 99L340 82V270H0Z"
        fill={`url(#${marked ? "fill-marked" : "fill-plain"})`}
      />
      <path
        d="M0 235L22 218L43 226L66 190L86 202L109 173L130 186L151 145L173 156L195 108L217 74L238 109L261 147L283 137L308 99L340 82"
        stroke="var(--cyan)"
        strokeWidth="3"
        fill="none"
      />
      {marked && (
        <g className={s.annotations}>
          <path d="M0 149H340" stroke="var(--cyan)" strokeDasharray="6 5" />
          <path d="M0 45H340" stroke="var(--gold)" strokeDasharray="6 5" />
          <text x="8" y="136" fill="var(--cyan)" fontSize="14">
            178 · Now support
          </text>
          <text x="8" y="31" fill="var(--gold)" fontSize="14">
            195 · Resistance
          </text>
          <circle
            cx="261"
            cy="147"
            r="12"
            fill="none"
            stroke="var(--violet-light)"
            strokeWidth="3"
          />
        </g>
      )}
    </svg>
  );
}
export function ValueReveal() {
  return (
    <div className={s.reveal}>
      <h1>
        Meet your market
        <br />
        <em>advantage.</em>
      </h1>
      <p className={s.sub}>Learn. Invest. Trade. Together.</p>
      <div className={s.collage}>
        <div className={s.revealAlert}>
          <small>01 · DAILY TRADE IDEAS</small>
          <div className={s.row}>
            <strong>NVDA</strong>
            <b className={s.gold}>A</b>
          </div>
          <p>
            178.40 <span>→</span> 195.00
          </p>
          <small>Entry · Stop · Target · Reasoning</small>
        </div>
        <div className={s.revealCommunity}>
          <small>02 · TRADE WITH A COMMUNITY</small>
          <div className={s.avatars}>
            <i>R</i>
            <i>T</i>
            <i>J</i>
            <span>12 discussing NVDA</span>
          </div>
          <p>“Watching the retest.”</p>
        </div>
        <div className={s.revealChart}>
          <small>03 · INVEST OR TRADE</small>
          <MarketChart />
          <span>Long term · Swing · Day trade</span>
        </div>
        <div className={s.revealLearn}>
          <small>04 · LEARN WITH KAI</small>
          <strong>Beginner → Trade-ready</strong>
          <div className={s.miniPath}>
            <i />—<i />—<i />—<i />
          </div>
        </div>
        <div className={s.connectingOrb}>
          <KaiOrb size={44} />
        </div>
      </div>
      <p className={s.connection}>Kai connects all of it.</p>
    </div>
  );
}
export function FeatureDemo({
  feature,
  onReady,
}: {
  feature: Feature;
  onReady: (ready: boolean) => void;
}) {
  const [acted, setActed] = useState(false);
  const [tiles, setTiles] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  function act() {
    setActed(true);
    onReady(true);
  }
  if (feature === "lesson")
    return (
      <div className={s.demo}>
        <h1>
          A stock is
          <br />
          <em>ownership.</em>
        </h1>
        <p className={s.sub}>Imagine a company with just 100 equal shares.</p>
        <div className={s.companyName}>
          ACME <span>100 shares total</span>
        </div>
        <div className={s.tiles}>
          {Array.from({ length: 100 }, (_, i) => (
            <button
              key={i}
              aria-label={`Share ${i + 1}`}
              aria-pressed={tiles.includes(i)}
              className={tiles.includes(i) ? s.owned : ""}
              disabled={!tiles.includes(i) && tiles.length === 10}
              onClick={() => {
                const next = tiles.includes(i)
                  ? tiles.filter((t) => t !== i)
                  : [...tiles, i];
                setTiles(next);
                onReady(next.length === 10);
              }}
            />
          ))}
        </div>
        <div className={s.ownership}>
          <strong>{tiles.length}%</strong>
          <span>
            {tiles.length === 10
              ? "of this example company is yours."
              : `Tap ${10 - tiles.length} more shares.`}
          </span>
        </div>
        {tiles.length === 10 ? (
          <Kai>That’s a stock. Ownership, not a lottery ticket.</Kai>
        ) : (
          <p className={s.sub}>Choose 10 tiles. Watch your ownership grow.</p>
        )}
      </div>
    );
  if (feature === "chart" || feature === "kai")
    return (
      <div className={s.demo}>
        <h1>
          {feature === "kai" ? "Why this setup?" : "Give your chart"}
          <br />
          <em>{feature === "kai" ? "See what Kai sees." : "a second mind."}</em>
        </h1>
        <div className={s.companyName}>
          NVDA <span>Illustrative daily chart</span>
        </div>
        <MarketChart marked={acted} />
        {acted ? (
          <>
            <div className={s.flip}>
              Old resistance <span>↓</span> Now support
            </div>
            <Kai>178 changed sides. That’s the setup.</Kai>
          </>
        ) : (
          <button className={s.action} onClick={act}>
            Analyze with Kai
          </button>
        )}
      </div>
    );
  if (feature === "alert")
    return (
      <div className={s.demo}>
        <p className={s.sub}>Today’s setup · Demo</p>
        <div className={s.ticker}>
          NVDA{" "}
          <span className={s.grade}>
            A<small>SETUP</small>
          </span>
        </div>
        <div className={s.levels}>
          {[
            ["178.40", "ENTRY"],
            ["171.90", "STOP"],
            ["195.00", "TARGET"],
          ].map(([v, l]) => (
            <div key={l}>
              <strong>{v}</strong>
              <small>{l}</small>
            </div>
          ))}
        </div>
        <div className={s.reward}>
          <span>Risk 1R</span>
          <i />
          <b>Reward 2.6R</b>
        </div>
        <p className={s.statement}>
          Breakout retest holding above former resistance.
        </p>
        <MarketChart />
        <button className={s.action} onClick={act}>
          {acted ? "Kai is ready below" : "Ask Kai why"}
        </button>
        {acted && (
          <Kai>
            Entry above 178. Stop where the idea breaks. A setup grade is not a
            promise.
          </Kai>
        )}
      </div>
    );
  if (feature === "community")
    return (
      <div className={s.demo}>
        <h1>
          Your trade.
          <br />
          <em>More perspectives.</em>
        </h1>
        <p className={s.sub}>NVDA · Example room</p>
        <div className={s.thread}>
          <p>
            <b>
              Renata <small>Black Belt</small>
            </b>
            Holding full size above 178.
          </p>
          <p>
            <b>
              Toby <small>Blue Belt</small>
            </b>
            Why not stop right under 178?
          </p>
          <p className={s.reply}>
            <b>Renata</b>I want the stop where the idea is actually wrong.
          </p>
        </div>
        <p className={s.sub}>12 traders discussing NVDA</p>
        <button className={s.action} onClick={act}>
          {acted ? "You’re in the demo room" : "Open room"}
        </button>
        {acted && (
          <Kai>
            Bring your question. The room helps you check your thinking.
          </Kai>
        )}
      </div>
    );
  if (feature === "belt")
    return (
      <div className={s.demo}>
        <h1>
          Build skill.
          <br />
          <em>Earn your place.</em>
        </h1>
        <div className={s.beltRing}>
          <strong>
            68<small>%</small>
          </strong>
          <span>WHITE BELT</span>
        </div>
        <p className={s.sub}>Illustrative progress · Next milestones</p>
        <div className={s.milestones}>
          <p>Read a chart correctly</p>
          <p>Build a trade plan</p>
          <p>Complete 3 clean practice trades</p>
        </div>
        <div className={s.distant}>
          BLACK BELT <span>On the horizon</span>
        </div>
        <Kai>Progress comes from demonstrated skill.</Kai>
      </div>
    );
  if (feature === "company")
    return (
      <div className={s.demo}>
        <h1>
          Buy a business.
          <br />
          <em>Not just a ticker.</em>
        </h1>
        <div className={s.business}>
          <strong>AAPL</strong>
          <span>Apple</span>
          <div>Products → Customers → Revenue</div>
        </div>
        <p className={s.statement}>Before you buy, what would you check?</p>
        <div className={s.choices}>
          {[
            "How the business earns money",
            "Whether the ticker looks popular",
          ].map((a) => (
            <button
              key={a}
              onClick={() => {
                setAnswer(a);
                if (a.startsWith("How")) onReady(true);
              }}
            >
              {a}
            </button>
          ))}
        </div>
        {answer && (
          <Kai>
            {answer.startsWith("How")
              ? "Exactly. Start with the business, then what you pay for it."
              : "Popularity is not the business. Try the other answer."}
          </Kai>
        )}
      </div>
    );
  if (feature === "path")
    // Three steps, not seven days. The app's path is `PATH_STEPS` in
    // apps/mobile/src/features/training/path.ts — 01 written, 02 and 03 marked
    // "Coming next" — and audit F02 is what happens when a demo promises the
    // seven-day version of the same curriculum. The rail below shows all three
    // rather than hiding the unwritten two: seeing where it is going is fine,
    // being surprised in week one is not.
    return (
      <div className={s.demo}>
        <h1>
          Your first step.
          <br />
          <em>Written and waiting.</em>
        </h1>
        <div className={s.learningPath}>
          <strong>01</strong>
          <div>
            <b>Own a piece of a company</b>
            <span>Your first lesson</span>
          </div>
          <i>02</i>
          <i>03</i>
        </div>
        <button className={s.action} onClick={act}>
          {acted ? "Step 01 selected" : "Open step 01"}
        </button>
        {acted && <Kai>Learn what you own. Then practice explaining it. Steps 02 and 03 are being written.</Kai>}
      </div>
    );
  if (feature === "track")
    return (
      <div className={s.demo}>
        <h1>
          A setup moves.
          <br />
          <em>Stay with it.</em>
        </h1>
        <div className={s.companyName}>
          NVDA <span>178.40 entry</span>
        </div>
        <div className={s.timeline}>
          <p>
            Setup published <b>Entry · Stop · Target</b>
          </p>
          <p>
            Added to your watch{" "}
            <b>{acted ? "Tracking enabled in this demo" : "Your next move"}</b>
          </p>
          <p>
            Level changes <b>Get an update</b>
          </p>
        </div>
        <button className={s.action} onClick={act}>
          {acted ? "Tracking NVDA ✓" : "Track this setup"}
        </button>
        {acted && <Kai>You’re following the setup. No trade was placed.</Kai>}
      </div>
    );
  if (feature === "plan")
    return (
      <div className={s.demo}>
        <h1>
          Know your risk.
          <br />
          <em>Before you enter.</em>
        </h1>
        <div className={s.companyName}>
          NVDA <span>Practice plan</span>
        </div>
        <div className={s.planNumbers}>
          <p>
            Entry <b>$178.40</b>
          </p>
          <p>
            Stop <b>$171.90</b>
          </p>
          <p>
            Risk per share <b>$6.50</b>
          </p>
          <p>
            Risk budget <b>$65</b>
          </p>
        </div>
        <button className={s.action} onClick={act}>
          {acted ? "Practice plan built" : "Build my practice plan"}
        </button>
        {acted && (
          <>
            <div className={s.ownership}>
              <strong>10</strong>
              <span>shares · $65 planned risk</span>
            </div>
            <Kai>Size follows risk. Actual losses can exceed a stop.</Kai>
          </>
        )}
      </div>
    );
  return (
    <div className={s.demo}>
      <h1>
        Better decisions.
        <br />
        <em>Trade after trade.</em>
      </h1>
      <p className={s.sub}>Example execution review</p>
      <div className={s.reviewScore}>
        A<small>PROCESS GRADE</small>
      </div>
      <div className={s.milestones}>
        <p>✓ Entry followed the plan</p>
        <p>✓ Position stayed within risk</p>
        <p>✓ Stop respected</p>
      </div>
      <button className={s.action} onClick={act}>
        {acted ? "Your takeaway" : "Show my takeaway"}
      </button>
      {acted && (
        <Kai>
          You followed the plan. Keep that habit—even on a losing trade.
        </Kai>
      )}
    </div>
  );
}
