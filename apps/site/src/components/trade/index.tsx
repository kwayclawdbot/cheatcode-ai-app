"use client";
import { useId, useState, type FormEvent, type ReactNode } from "react";
import {
  LEVEL_LABEL,
  STATUS_LABEL,
  STATUS_STEPS,
  price,
  riskReward,
  tradeGeometry,
  type TradeIdea,
  type LevelKind,
  type TradeStatus,
  type KaiNote,
  type ConversationMessage,
} from "./model.generated";
import s from "./trade.module.css";
export type { TradeIdea, LevelKind, TradeStatus, KaiNote, ConversationMessage };
const ink: Record<LevelKind, string> = {
  entry: "var(--cyan)",
  stop: "var(--red)",
  target: "var(--green)",
};
export function TradeSymbol({
  idea,
  small = false,
}: {
  idea: TradeIdea;
  small?: boolean;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <div className={s.symbol}>
      <span className={s.logo}>
        {idea.logoUrl && failed !== idea.logoUrl ? (
          <img
            alt=""
            src={idea.logoUrl}
            onError={() => setFailed(idea.logoUrl!)}
          />
        ) : (
          <span>{idea.symbol}</span>
        )}
      </span>
      <div>
        <strong className={small ? s.smallSymbol : ""}>{idea.symbol}</strong>
        <span className={s.muted}>{idea.company}</span>
      </div>
    </div>
  );
}
export function KaiAnnotation({
  note,
  onAsk,
}: {
  note: KaiNote;
  onAsk?: (level: LevelKind) => void;
}) {
  return (
    <aside className={s.kai} aria-label={`Kai on ${LEVEL_LABEL[note.level]}`}>
      <span className={s.kaiMark} aria-hidden="true">
        ✦
      </span>
      <div>
        <small>Kai · {LEVEL_LABEL[note.level]}</small>
        <p>{note.text}</p>
        {onAsk && (
          <button onClick={() => onAsk(note.level)}>
            Ask about this level ↗
          </button>
        )}
      </div>
    </aside>
  );
}
export function TradeMap({
  idea,
  compact = false,
  selectedLevel = "entry",
  onLevelSelect,
  annotation,
}: {
  idea: TradeIdea;
  compact?: boolean;
  selectedLevel?: LevelKind;
  onLevelSelect?: (level: LevelKind) => void;
  annotation?: KaiNote;
}) {
  const g = tradeGeometry(idea, compact),
    id = useId().replace(/:/g, "");
  const labels =
    g?.levels.filter(
      (l) =>
        l.kind === selectedLevel ||
        g.levels.every(
          (other) => other.kind === l.kind || Math.abs(other.y - l.y) > 30,
        ),
    ) ?? [];
  return (
    <section
      className={s.map}
      aria-label={`${idea.symbol} ${idea.direction} trade map`}
    >
      {g ? (
        <svg
          viewBox={`0 0 ${g.width} ${g.height}`}
          role="img"
          aria-labelledby={`chart-${id}`}
        >
          <title
            id={`chart-${id}`}
          >{`${idea.symbol}. ${idea.candles.length ? "Price history with trade levels." : "Price history unavailable; levels only."} ${g.levels.map((l) => `${LEVEL_LABEL[l.kind]} ${price(l.value, idea.pricePrecision)}`).join(". ")}`}</title>
          {g.grid.map((y) => (
            <line
              key={y}
              x1="8"
              x2="278"
              y1={y}
              y2={y}
              stroke="var(--ivory08)"
            />
          ))}
          {riskReward(idea) &&
            (["stop", "target"] as const).map((kind) => {
              const a = g.levels.find((l) => l.kind === "entry"),
                b = g.levels.find((l) => l.kind === kind);
              return a && b ? (
                <rect
                  key={kind}
                  x="8"
                  width="270"
                  y={Math.min(a.y, b.y)}
                  height={Math.abs(a.y - b.y)}
                  fill={ink[kind]}
                  opacity=".05"
                />
              ) : null;
            })}
          {compact ? (
            <path d={g.line} fill="none" stroke="var(--cyan)" strokeWidth="2" />
          ) : (
            g.candles.map((c) => (
              <g
                key={c.time}
                stroke={c.close >= c.open ? "var(--cyan)" : "var(--red)"}
                fill={c.close >= c.open ? "var(--cyan)" : "var(--red)"}
              >
                <line x1={c.x} x2={c.x} y1={c.yHigh} y2={c.yLow} />
                <rect
                  x={c.x - c.bodyWidth / 2}
                  y={Math.min(c.yOpen, c.yClose)}
                  width={c.bodyWidth}
                  height={Math.max(1, Math.abs(c.yClose - c.yOpen))}
                />
              </g>
            ))
          )}
          {g.levels.map((l) => (
            <line
              key={l.kind}
              x1="8"
              x2="278"
              y1={l.y}
              y2={l.y}
              stroke={ink[l.kind]}
              strokeWidth={selectedLevel === l.kind ? 1.7 : 1}
              strokeDasharray="5 4"
            />
          ))}
          {labels.map((l) => (
            <g key={l.kind} fill={ink[l.kind]}>
              <text
                x="286"
                y={l.y - 3}
                fontSize="12"
                fontFamily="var(--font-mono-stack)"
              >
                {price(l.value, idea.pricePrecision)}
              </text>
              <text x="286" y={l.y + 12} fontSize="10">
                {LEVEL_LABEL[l.kind].toUpperCase()}
              </text>
            </g>
          ))}
          {g.candles.length > 0 &&
            g.levels
              .filter((l) => l.kind === selectedLevel)
              .map((l) => (
                <circle
                  key={l.kind}
                  cx={g.candles[g.candles.length - 1].x}
                  cy={l.y}
                  r="5"
                  fill="var(--bg)"
                  stroke="var(--violet-light)"
                  strokeWidth="2"
                />
              ))}
          {!compact && g.candles.length > 1 && (
            <>
              <text x="8" y={g.height - 6} fill="var(--muted)" fontSize="11">
                {new Date(g.candles[0].time).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </text>
              <text
                x="278"
                y={g.height - 6}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="11"
              >
                {new Date(
                  g.candles[g.candles.length - 1].time,
                ).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  timeZone: "UTC",
                })}
              </text>
            </>
          )}
        </svg>
      ) : (
        <p className={s.empty}>Chart and levels unavailable</p>
      )}
      {g && !g.candles.length && (
        <p className={s.muted}>Price history unavailable</p>
      )}
      {!compact && (
        <div className={s.levels}>
          {(["entry", "stop", "target"] as const).map((kind) =>
            onLevelSelect ? (
              <button
                key={kind}
                aria-pressed={selectedLevel === kind}
                onClick={() => onLevelSelect(kind)}
                style={{ color: ink[kind] }}
              >
                <small>{LEVEL_LABEL[kind]}</small>
                <strong>{price(idea[kind], idea.pricePrecision)}</strong>
              </button>
            ) : (
              <div key={kind} style={{ color: ink[kind] }}>
                <small>{LEVEL_LABEL[kind]}</small>
                <strong>{price(idea[kind], idea.pricePrecision)}</strong>
              </div>
            ),
          )}
        </div>
      )}
      {annotation && <KaiAnnotation note={annotation} />}
    </section>
  );
}
export function RiskRewardRuler({ idea }: { idea: TradeIdea }) {
  const r = riskReward(idea);
  return r ? (
    <div
      className={s.risk}
      aria-label={`Planned risk 1R, reward ${r.ratio.toFixed(1)}R`}
    >
      <div className={s.riskBar}>
        <i style={{ width: `${r.riskFraction * 100}%` }} />
        <b style={{ width: `${(1 - r.riskFraction) * 100}%` }} />
      </div>
      <div className={s.row}>
        <span>Risk 1R</span>
        <span>Reward {r.ratio.toFixed(1)}R</span>
      </div>
    </div>
  ) : (
    <p className={s.muted}>Risk/reward unavailable · Check trade levels</p>
  );
}
export function TradeStatusStrip({ status }: { status: TradeStatus }) {
  const index = STATUS_STEPS.indexOf(status);
  return index < 0 ? (
    <p className={s.terminal}>{STATUS_LABEL[status]}</p>
  ) : (
    <ol
      className={s.status}
      aria-label={`Trade status: ${STATUS_LABEL[status]}`}
    >
      {STATUS_STEPS.map((step, i) => (
        <li
          key={step}
          aria-current={step === status ? "step" : undefined}
          data-current={step === status}
          data-past={i < index}
        >
          <i />
          {STATUS_LABEL[step]}
        </li>
      ))}
    </ol>
  );
}
export function SetupPreview({
  idea,
  onExplore,
}: {
  idea: TradeIdea;
  onExplore?: (idea: TradeIdea) => void;
}) {
  return (
    <article className={s.setup}>
      <header className={s.row}>
        <TradeSymbol idea={idea} />
        {idea.grade && (
          <span
            className={s.grade}
            style={
              idea.grade.startsWith("A")
                ? undefined
                : { color: "var(--muted)", borderColor: "var(--ivory20)" }
            }
          >
            {idea.grade} setup
          </span>
        )}
      </header>
      <h2>{idea.title}</h2>
      <TradeMap idea={idea} />
      <RiskRewardRuler idea={idea} />
      <p className={s.summary}>{idea.summary}</p>
      <div className={s.row}>
        <small className={s.muted}>
          {idea.direction === "long" ? "Long" : "Short"} ·{" "}
          {STATUS_LABEL[idea.status]}
        </small>
      </div>
      {onExplore && (
        <button className={s.primary} onClick={() => onExplore(idea)}>
          Explore this idea <span>→</span>
        </button>
      )}
      <small className={s.source}>{idea.dataLabel}</small>
    </article>
  );
}
/**
 * Slots, not features — see the native twin for the full argument. The kit owns
 * what a trade object IS; `meta` and `children` carry what one caller happens to
 * know, so the kit does not grow a prop it would owe every other surface.
 */
export function PinnedTradePreview({
  idea,
  onOpen,
  meta,
  children,
}: {
  idea: TradeIdea;
  onOpen?: (idea: TradeIdea) => void;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  const body = (
    <>
      <div className={s.row}>
        <TradeSymbol idea={idea} small />
        <span className={s.pinMeta}>
          <span className={s.muted}>{STATUS_LABEL[idea.status]}</span>
          {meta}
        </span>
      </div>
      <p>{idea.title}</p>
      <div className={s.pinLevels}>
        {(["entry", "stop", "target"] as const).map((k) => (
          <span key={k} style={{ color: ink[k] }}>
            <small>{LEVEL_LABEL[k]}</small>
            <strong>{price(idea[k], idea.pricePrecision)}</strong>
          </span>
        ))}
      </div>
      {children}
    </>
  );
  return onOpen ? (
    <button
      className={s.pin}
      onClick={() => onOpen(idea)}
      aria-label={`Open ${idea.symbol} trade`}
    >
      {body}
    </button>
  ) : (
    <div className={s.pin}>{body}</div>
  );
}
export function ConversationPreview({
  messages,
  composer,
}: {
  messages: readonly ConversationMessage[];
  composer?: ReactNode;
}) {
  return (
    <section className={s.conversation} aria-label="Trade conversation">
      <div className={s.messages}>
        {messages.map((m) => (
          <div
            key={m.id}
            className={`${s.message} ${m.isKai ? s.aiMessage : ""}`}
          >
            <span className={s.avatar}>
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" />
              ) : m.isKai ? (
                "✦"
              ) : (
                m.name.charAt(0)
              )}
            </span>
            <div>
              <header>
                {/*
                 * SIGNAL IS LIT, BELT IS DYED. The belt is the name's colour,
                 * not a chip beside it — the same law the app's rooms follow,
                 * kept here so the two renderings cannot drift. White is the
                 * house ivory, so an unranked member reads exactly as before.
                 * Kai's violet comes from .aiMessage; Kai has no rung.
                 */}
                <strong
                  style={
                    m.isKai
                      ? undefined
                      : { color: `var(--belt-${m.belt ?? "white"})` }
                  }
                >
                  {m.name}
                </strong>
                {m.isKai && <span className={s.aiTag}>AI</span>}
                <small>{m.timeLabel}</small>
              </header>
              {m.replyToName && (
                <p className={s.replyTo}>Replying to {m.replyToName}</p>
              )}
              <p>{m.text}</p>
            </div>
          </div>
        ))}
      </div>
      {composer}
    </section>
  );
}
/** Caller owns network/persistence; only clears the draft after successful delivery. */
export function ConversationComposer({
  onSend,
  disabled = false,
}: {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}) {
  const [text, setText] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() || busy || disabled) return;
    setBusy(true);
    setError("");
    try {
      await onSend(text.trim());
      setText("");
    } catch {
      setError("Could not send. Your message is still here.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={s.composerForm} onSubmit={submit}>
      <div className={s.composer}>
        <input
          aria-label="Message"
          placeholder="Add to the conversation…"
          value={text}
          maxLength={2000}
          disabled={busy || disabled}
          onChange={(e) => setText(e.target.value)}
        />
        <button
          aria-label="Send message"
          disabled={!text.trim() || busy || disabled}
        >
          {busy ? "…" : "↑"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
