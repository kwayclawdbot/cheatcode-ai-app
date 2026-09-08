"use client";
import { useState } from "react";
import {
  SetupPreview,
  TradeMap,
  TradeStatusStrip,
  PinnedTradePreview,
  ConversationPreview,
  ConversationComposer,
  type LevelKind,
  type TradeStatus,
  type ConversationMessage,
} from "@/components/trade";
import {
  DEMO_TRADE,
  DEMO_MESSAGES,
} from "@/components/trade/fixtures.generated";
import s from "./showcase.module.css";
const explanations: Record<LevelKind, string> = {
  entry:
    "178 is the level being tested. Watch whether former resistance holds as support.",
  stop: "171.90 is the planned invalidation level. A stop does not guarantee the execution price.",
  target: "195 is the planned target. The price may never reach it.",
};
export default function ComponentLab() {
  const [selected, setSelected] = useState<LevelKind>("entry"),
    [status, setStatus] = useState<TradeStatus>("watching"),
    [messages, setMessages] = useState<ConversationMessage[]>(DEMO_MESSAGES);
  const idea = { ...DEMO_TRADE, status };
  function explore() {
    document
      .getElementById("understand")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <main className={s.page}>
      <header className={s.header}>
        <div>
          <strong>CheatCode</strong>
          <span>A clearer way to trade</span>
        </div>
        <p>Working components · Illustrative data</p>
      </header>
      <div className={s.controls}>
        <label>
          Preview state{" "}
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as TradeStatus)}
          >
            {[
              "watching",
              "entry_reached",
              "active",
              "closed",
              "invalidated",
              "expired",
            ].map((v) => (
              <option key={v} value={v}>
                {v.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <span>Tap a level. Open a trade. Try the chat.</span>
      </div>
      <div className={s.grid}>
        <section>
          <p className={s.chapter}>01 / DISCOVER</p>
          <div className={s.screen}>
            <h1>Trade ideas</h1>
            <p className={s.mode}>
              Swing <span>Invest</span>
              <span>Day trade</span>
            </p>
            <SetupPreview idea={idea} onExplore={explore} />
          </div>
        </section>
        <section id="understand">
          <p className={s.chapter}>02 / UNDERSTAND</p>
          <div className={s.screen}>
            <h1>See the setup.</h1>
            <p className={s.sub}>NVDA · Nvidia</p>
            <TradeMap
              idea={idea}
              selectedLevel={selected}
              onLevelSelect={setSelected}
              annotation={{ level: selected, text: explanations[selected] }}
            />
            <TradeStatusStrip status={status} />
            <p className={s.sub}>
              Tap Entry, Stop or Target for its explanation.
            </p>
          </div>
        </section>
        <section>
          <p className={s.chapter}>03 / DISCUSS</p>
          <div className={s.screen}>
            <h1>NVDA discussion</h1>
            <p className={s.sub}>Example conversation</p>
            <PinnedTradePreview idea={idea} onOpen={explore} />
            <ConversationPreview
              messages={messages}
              composer={
                <ConversationComposer
                  onSend={async (text) => {
                    setMessages((m) => [
                      ...m,
                      {
                        id: crypto.randomUUID(),
                        name: "You",
                        text,
                        timeLabel: "Now",
                      },
                    ]);
                  }}
                />
              }
            />
            <p className={s.disclaimer}>
              Demo messages stay on this page. Nothing is sent.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
