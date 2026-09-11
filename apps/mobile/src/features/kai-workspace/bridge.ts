/**
 * THE BRIDGE — Kai's stream on one side, the workspace on the other.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * WHAT CROSSES IT, IN BOTH DIRECTIONS
 * ═════════════════════════════════════════════════════════════════════════════
 *   UP    what the member has on screen, read at SEND time, so "zoom in" and
 *         "what are they saying" resolve to something.
 *   DOWN  three kinds of frame, each handled differently:
 *           `workspace_action`  Kai opening a surface.
 *           `chart_command`     one mark, drawn in place.
 *           `chart_answer`      a whole answer, performed against a clock.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * `chart_answer` IS NOT OPTIONAL AND IGNORING IT IS SILENCE
 * ═════════════════════════════════════════════════════════════════════════════
 * This is the trap worth naming. When a chart is open, the server offers the
 * DIRECTED answer protocol, and a directed answer's prose is carried INSIDE the
 * frame — it is deliberately not also streamed as `text_delta`, because
 * streaming it twice would print the answer twice under a chart that performed
 * it once.
 *
 * So a host that handles `text_delta` and ignores `chart_answer` does not get a
 * degraded answer. It gets NO ANSWER: a chart that moves and a conversation that
 * says nothing. That is exactly the shape of the bug the owner once reported as
 * "the chart moves but nothing happens", and it is why this file exists rather
 * than a two-line frame handler on Home.
 *
 * ═════════════════════════════════════════════════════════════════════════════
 * ONE ANSWER AT A TIME
 * ═════════════════════════════════════════════════════════════════════════════
 * A second question abandons the first. Two answers performing on one chart race
 * for the same canvas and `applyChartCommand` keeps a queue of one, so half of
 * each is silently superseded — the level it was drawing is simply never drawn.
 * The older run is cancelled the moment a new question goes out, and again on
 * unmount so a run does not keep drawing on a screen that is gone.
 */
import { useCallback, useEffect, useRef } from 'react';
import type { KaiWorkspaceAction, WorkspaceState } from '@cheatcode/shared';
import { runChartAnswer, type AnswerRun } from '../chart/answer';
import { playAnswer } from '../chart/answer-audio';
import { readCommand } from '../portal/plan-command';
import { readAnswer } from '../portal/useKaiPortal';
import type { PortalCommandResult } from '../portal/useKaiPortal';
import type { ChartCommand } from '../portal/types';
import { workspace } from './store';

export type WorkspaceBridge = {
  /** Read at send time. See `EngineOpts.workspace`. */
  state: () => WorkspaceState | null;
  onAction: (a: KaiWorkspaceAction) => void;
  /** Every non-text frame the workspace cares about. */
  onChartFrame: (f: unknown) => void;
  /** Called before each question goes out, so a running answer is abandoned. */
  beginTurn: () => void;
};

export type WorkspaceBridgeOpts = {
  /**
   * Kai narrating what he just drew, and speaking a directed answer.
   *
   * The host puts these into the conversation. Kept as a callback rather than
   * writing to the wall from here because the wall is the host's — a bridge that
   * appended turns would be a second thing with an opinion about the transcript.
   */
  onNarrate: (text: string) => void;
  /** A directed answer's prose, which arrives in one piece rather than streamed. */
  onAnswer: (text: string) => void;
};

export function useWorkspaceBridge(opts: WorkspaceBridgeOpts): WorkspaceBridge & {
  /** Bound by the chart surface the moment it mounts. */
  bindApply: (apply: ((c: ChartCommand) => PortalCommandResult | null) | null) => void;
} {
  /**
   * The live chart's applier.
   *
   * A REF, NOT STATE. The frame handler lives inside a stream callback that was
   * created when the turn started; closing over a value would perform this
   * turn's commands against the chart that existed when the question was asked,
   * which is the wrong chart the moment Kai's own `open_chart` is what put the
   * new one there — and that is the ordinary case, not the edge case.
   */
  const apply = useRef<((c: ChartCommand) => PortalCommandResult | null) | null>(null);
  const run = useRef<AnswerRun | null>(null);
  const cb = useRef(opts);
  cb.current = opts;

  useEffect(() => () => { run.current?.cancel(); }, []);

  const bindApply = useCallback((fn: ((c: ChartCommand) => PortalCommandResult | null) | null) => {
    apply.current = fn;
  }, []);

  const perform = useCallback((c: ChartCommand): Promise<unknown> => {
    const r = apply.current?.(c);
    if (!r) return Promise.resolve();
    if (r.narration) cb.current.onNarrate(r.narration);
    return r.done;
  }, []);

  const onChartFrame = useCallback((f: unknown) => {
    const type = (f as { type?: string })?.type;

    if (type === 'chart_command') {
      const c = readCommand(f);
      if (c) void perform(c);
      return;
    }

    if (type === 'chart_answer') {
      const answer = readAnswer(f);
      if (!answer) return;
      // The words first and whole. The chart then catches up to them against
      // the clock the server timed the gestures on.
      cb.current.onAnswer(answer.spoken);
      run.current?.cancel();
      run.current = runChartAnswer<ChartCommand>({
        actions: answer.actions.map((a) => ({ t_offset_ms: a.t_offset_ms, frame: a.command })),
        perform,
      });
      // Voice is a switch over a feature that has always worked silently: with
      // no audio the chart still performs and the words are still on screen.
      if (answer.audioUrl) void playAnswer(answer.audioUrl);
    }
  }, [perform]);

  const onAction = useCallback((a: KaiWorkspaceAction) => {
    workspace.apply(a);
  }, []);

  /**
   * An EMPTY workspace is still a workspace, and it is always sent.
   *
   * "Nothing is open" is a fact Kai needs: it is how he knows that answering
   * "where is it sitting" means putting a chart up first. Sending null instead
   * would tell the server this client has no workspace at all, and the whole
   * vocabulary for opening one would go unoffered — the screen would be empty
   * and Kai would have no way to fill it.
   */
  const state = useCallback((): WorkspaceState => workspace.toState(), []);

  const beginTurn = useCallback(() => {
    run.current?.cancel();
    run.current = null;
  }, []);

  return { state, onAction, onChartFrame, beginTurn, bindApply };
}
