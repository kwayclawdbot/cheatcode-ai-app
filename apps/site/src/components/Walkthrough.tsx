"use client";
import { useEffect, useRef, useState } from "react";
import { PERSONAS, type PathId } from "@/sim/personas";
import {
  CHAPTER,
  FIRST,
  INTERESTS,
  priorityChoices,
  type Choice,
  type Feature,
} from "@/sim/journey";
import { getAppHref } from "@/sim/handoff";
import { FeatureDemo, ValueReveal } from "./JourneySurfaces";
import s from "./Walkthrough.module.css";
import j from "./Journey.module.css";

export function Walkthrough({
  path,
  onExit,
  framed = false,
}: {
  path: PathId;
  onExit: () => void;
  framed?: boolean;
}) {
  const [step, setStep] = useState(0);
  const [interest, setInterest] = useState<Choice>();
  const [priority, setPriority] = useState<Choice>();
  const [ready, setReady] = useState(false);
  const surface = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLSpanElement>(null);
  const feature: Feature =
    step === 1
      ? FIRST[path]
      : step === 3
        ? interest!.id
        : (priority?.id ?? "belt");
  const question = step === 2 || step === 4;
  const done = step === 6;
  const chapter =
    step === 0
      ? "MEET CHEATCODE"
      : question
        ? "YOUR CALL"
        : done
          ? "YOUR PLAN"
          : CHAPTER[feature];
  const options =
    step === 2 ? INTERESTS[path] : priorityChoices(path, interest?.id);
  const canContinue = step === 0 || ready || feature === "belt";
  useEffect(() => {
    surface.current?.scrollTo({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [step]);
  function move(n: number) {
    setReady(false);
    setStep(n);
  }
  function choose(choice: Choice) {
    if (step === 2) {
      setInterest(choice);
      setPriority(undefined);
    } else setPriority(choice);
    move(step + 1);
  }
  const body = (
    <div className={s.stage} data-path={path} data-step={step}>
      <div className={s.rail}>
        <div className={s.railTop}>
          <button
            className={j.back}
            onClick={() => (step ? move(step - 1) : onExit())}
            aria-label="Go back"
          >
            ←
          </button>
          <span className={s.railCaption} ref={heading} tabIndex={-1}>
            {chapter}
          </span>
          <button className={j.back} onClick={onExit}>
            Exit
          </button>
        </div>
        <div className={s.ticks} aria-label={`Step ${step + 1} of 7`}>
          {Array.from({ length: 7 }, (_, i) => (
            <span
              key={i}
              className={`${s.tick} ${i <= step ? s.tickDone : ""}`}
            >
              <span className={s.tickFill} />
            </span>
          ))}
        </div>
      </div>
      <div className={s.surface} ref={surface}>
        <div className={s.beat} key={`${step}-${feature}`}>
          {step === 0 ? (
            <ValueReveal />
          ) : question ? (
            <div className={j.demo}>
              <p className={j.sub}>
                {step === 2 ? "Follow your curiosity." : "One more thing."}
              </p>
              <h1>
                {step === 2 ? "What do you want" : "What matters most"}
                <br />
                <em>{step === 2 ? "to see next?" : "to you?"}</em>
              </h1>
              <div className={j.choices}>
                {options.map((c, i) => (
                  <button key={c.id} onClick={() => choose(c)}>
                    <span className={j.choiceNumber}>0{i + 1}</span>
                    {c.label}
                    <span aria-hidden="true">↗</span>
                  </button>
                ))}
              </div>
            </div>
          ) : done ? (
            <div className={j.demo}>
              <h1>
                Built around
                <br />
                <em>what you told us.</em>
              </h1>
              <p className={j.sub}>You want:</p>
              <ul className={j.recap}>
                <li>{PERSONAS[path].title}</li>
                {interest && <li>{interest.benefit}</li>}
                {priority && <li>{priority.benefit}</li>}
              </ul>
              <div className={j.offer}>
                <p>{PERSONAS[path].plan.name}</p>
                <div className={j.price}>
                  ${PERSONAS[path].plan.price}
                  <span>/mo</span>
                </div>
                <p className={j.sub}>Planned membership · Private testing</p>
                <a
                  className={j.action}
                  href={getAppHref(path, {
                    interest: interest?.id,
                    priority: priority?.id,
                  })}
                >
                  Explore early access
                </a>
              </div>
            </div>
          ) : (
            <FeatureDemo feature={feature} onReady={setReady} />
          )}
        </div>
      </div>
      <div className={s.cueBar}>
        {!question && !done && (
          <button
            className={s.cue}
            data-cue
            disabled={!canContinue}
            onClick={() => move(step + 1)}
          >
            {step === 0
              ? "Show me"
              : step === 5
                ? "See my plan"
                : canContinue
                  ? "Continue"
                  : "Try it above"}{" "}
            <span aria-hidden="true">→</span>
          </button>
        )}
        <p className={j.disclosure}>Interactive demo · Illustrative data</p>
      </div>
    </div>
  );
  return framed ? (
    <div className={s.device}>
      <div className={s.deviceInner}>{body}</div>
    </div>
  ) : (
    body
  );
}
