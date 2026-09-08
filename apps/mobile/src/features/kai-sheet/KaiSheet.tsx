import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../ui/Text';
import { useKeyboardHeight } from '../../ui/KeyboardDock';
import { KaiOrb } from '../../ui/KaiOrb';
import { KaiBubble, UserBubble, TypingDots } from '../../ui/Bubble';
import { RichText } from '../../ui/RichText';
import { SetupObject } from '../../ui/SetupObject';
import { Composer } from '../../ui/Composer';
import { alpha, color, radius } from '../../ui/tokens';
import { api, ApiError } from '../../lib/api';
import { useSession } from '../../lib/session';
import { useKaiThread } from '../../lib/useKai';
import type { GoalMode, KaiActionPreview } from '../../lib/types';
import { NOT_ADVICE_SHORT } from '../legal/disclaimers';
import {
  closeKaiSheet, getKaiSheetState, kaiSheetPlaceholder, kaiSheetTitle,
  subscribeKaiSheet, type KaiContext,
} from './store';

/**
 * V5-W2 — the global contextual Kai sheet.
 *
 * Geometry is the artboard's: the sheet starts at 47% of the screen, 28px top
 * corners, a violet-tinted top hairline, drag handle, "Kai · about META" header
 * with a Close affordance, the streaming thread, and the composer pill.
 *
 * Behaviour that matters (audit §5): the screen underneath STAYS. Nothing here
 * navigates to Home. Action proposals Kai streams back are rendered as plain
 * language buttons and call the real endpoints from here.
 */
export function KaiSheetHost() {
  const [state, setState] = useState(getKaiSheetState);
  useEffect(() => subscribeKaiSheet(setState), []);

  // Mounting the thread only while open keeps a closed sheet at zero cost and
  // guarantees a fresh conversation per open.
  if (!state.open || !state.request) return null;
  return (
    <KaiSheet
      context={state.request.context}
      question={state.request.question}
      nonce={state.nonce}
    />
  );
}

function KaiSheet({ context, question, nonce }: { context: KaiContext; question?: string; nonce: number }) {
  const { profile } = useSession();
  const mode: GoalMode = (profile?.primary_mode as GoalMode) ?? 'day_trade';
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const router = useRouter();
  const scroller = useRef<ScrollView | null>(null);

  const ctx = useMemo(() => ({ kind: context.kind, id: context.id, symbol: context.symbol }), [context]);
  /**
   * THE SHEET GETS THE SAME CONTRACT AS THE WALL (audit F05).
   *
   * `useKaiWall` and `useKaiThread` are two wrappers over one engine now, and
   * that engine exposes stop, retry, the failed turn and the suggested
   * questions. This sheet was reading four of those fields and ignoring the
   * rest, which is how "different Kai entry points can feel like different
   * assistants" survives a refactor that was supposed to end it: Home could
   * stop a runaway answer, get its words back after a dropped request and
   * offer something to ask; the sheet over a chart could do none of it.
   *
   * Same fields, same behaviour, same words. The only differences are the
   * `kai-sheet-` testID prefix and where they sit on screen.
   */
  const {
    items, send, streaming, stop, retry, clearFailure, failed, suggestions,
    removeItem, pushNotice,
  } = useKaiThread({ mode, context: ctx, key: nonce, opening: null });

  /**
   * A failed turn's words go back into the field. The nonce is what makes the
   * SAME text restorable twice — without it, failing the same question a
   * second time would restore nothing.
   */
  const [draftNonce, setDraftNonce] = useState(0);
  useEffect(() => { if (failed?.restore) setDraftNonce((n) => n + 1); }, [failed]);
  const sendAgain = useCallback(() => { retry(); setDraftNonce((n) => n + 1); }, [retry]);

  // The opening question (the tap that opened the sheet) is asked once.
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current || !question) return;
    asked.current = true;
    const t = setTimeout(() => { void send(question); }, 180);
    return () => clearTimeout(t);
  }, [question, send]);

  useEffect(() => {
    const t = setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(t);
  }, [items]);

  /**
   * Kai proposes, the client executes. Every branch either calls a real
   * endpoint or navigates INSIDE the current task — never back to Home.
   */
  const runAction = useCallback(async (id: string, a: KaiActionPreview) => {
    const args = a.args ?? {};
    const symbol = (typeof args.symbol === 'string' ? args.symbol : context.symbol) ?? '';
    try {
      if (a.action === 'draft_alert') {
        const nl = typeof args.natural_language === 'string' && args.natural_language
          ? args.natural_language
          : (a.summary_plain ?? `Tell me when ${symbol} moves`);
        if (!api.available()) {
          removeItem(id);
          pushNotice(`Alert set — I'll tell you when ${symbol || 'this'} does that.`);
          return;
        }
        const draftId = typeof args.alert_id === 'string' && args.alert_id
          ? args.alert_id
          : (await api.draftAlertPreview(nl, symbol ? { symbol } : {})).alert_id;
        await api.activateAlert(draftId);
        removeItem(id);
        pushNotice(`Alert set — I'll tell you when ${symbol || 'this'} does that.`);
        return;
      }
      if (a.action === 'watch_setup') {
        const setupId = typeof args.setup_id === 'string' ? args.setup_id : context.id;
        if (api.available() && setupId) await api.followSetup(setupId);
        removeItem(id);
        pushNotice(`Watching ${symbol || 'it'}. I'll tell you when it's ready.`);
        return;
      }
      if (a.action === 'build_plan') {
        const setupId = typeof args.setup_id === 'string' ? args.setup_id : context.id;
        closeKaiSheet();
        router.push(`/plan/new?symbol=${encodeURIComponent(symbol)}${setupId ? `&setup=${encodeURIComponent(setupId)}` : ''}`);
        return;
      }
      if (a.action === 'open_setup') {
        const setupId = typeof args.setup_id === 'string' ? args.setup_id : context.id;
        closeKaiSheet();
        router.push(`/symbol/${encodeURIComponent(symbol || 'META')}?tab=overview${setupId ? `&setup=${encodeURIComponent(setupId)}` : ''}`);
        return;
      }
      // compare / explain stay in the thread — they are questions, not actions.
      removeItem(id);
      await send(a.summary_plain || a.label);
    } catch (e) {
      pushNotice(e instanceof ApiError ? e.message : "I couldn't do that just now. Try again in a moment.");
    }
  }, [context.id, context.symbol, removeItem, pushNotice, router, send]);

  const title = kaiSheetTitle(context);
  /**
   * Artboard: sheet top edge at 47% of the frame — UNLESS THE KEYBOARD IS UP.
   *
   * This sheet has a fixed height, and `KeyboardAvoidingView` lifts its child
   * rather than resizing it. Lifting a panel that is 53% of the screen by a
   * ~336pt keyboard pushes the drag handle and the "Kai · about META" title
   * clean off the top of the display on any phone where the keyboard is taller
   * than 47% of the screen — which is most of them. The composer was reachable
   * and you could no longer see whose conversation you were in.
   *
   * So it SHRINKS instead: never taller than the space actually left above the
   * keyboard, less a little air so it does not sit flush against the status
   * bar. The inner thread is already `flex: 1`, so the messages give up the
   * height and the header and composer keep theirs.
   */
  const keyboardHeight = useKeyboardHeight();
  const sheetHeight = Math.min(
    Math.round(height * 0.53),
    height - keyboardHeight - Math.max(insets.top, 24) - 12,
  );

  return (
    <Modal visible transparent animationType="slide" onRequestClose={closeKaiSheet} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        {/* The screen underneath stays visible and stays put. */}
        <Pressable
          accessibilityLabel="Close Kai"
          onPress={closeKaiSheet}
          // A light scrim only: the screen underneath must stay READABLE —
          // that is the whole point of answering in place (audit §5).
          style={{ flex: 1, backgroundColor: alpha.black22 }}
        />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
          <LinearGradient
            testID="kai-sheet"
            // The artboard reaches near-opacity with backdrop-blur, which RN
            // has no equivalent for on web — a translucent sheet there just
            // bleeds the screen's text through the conversation. Opaque.
            colors={['#1C1A26', '#0F0E14']}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{
              height: sheetHeight,
              borderTopLeftRadius: 28,
              borderTopRightRadius: 28,
              borderTopWidth: 0.5,
              borderColor: 'rgba(196,181,253,0.35)',
              overflow: 'hidden',
            }}
          >
            <View style={{ alignItems: 'center', paddingTop: 10, paddingBottom: 2 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: alpha.ivory25 }} />
            </View>

            <View
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 9,
                paddingHorizontal: 18, paddingTop: 8, paddingBottom: 12,
                borderBottomWidth: 0.5, borderBottomColor: alpha.ivory08,
              }}
            >
              <KaiOrb size={26} />
              <T size={14} weight="bold" c={color.violetLight} testID="kai-sheet-title">{title}</T>
              <Pressable
                testID="kai-sheet-close"
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={closeKaiSheet}
                hitSlop={12}
                style={{ marginLeft: 'auto' }}
              >
                <T size={12} c={color.muted}>Close</T>
              </Pressable>
            </View>

            <ScrollView
              ref={scroller}
              testID="kai-sheet-thread"
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 14, paddingBottom: 6, gap: 11 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {items.length === 0 ? (
                <T size={13} lh={19} c={color.muted}>
                  {context.symbol
                    ? `Ask me anything about ${context.symbol} — I can see the chart, the levels and what changed.`
                    : 'Ask me anything — I can see what you were looking at.'}
                </T>
              ) : null}

              {items.map((it) => {
                if (it.kind === 'user_text') return <UserBubble key={it.id}>{it.text}</UserBubble>;
                if (it.kind === 'typing') return <TypingDots key={it.id} testID="kai-sheet-typing" />;
                if (it.kind === 'setup') {
                  // A card for the symbol we are already on is context, not a
                  // door: compact, no "open" that leads back to this screen.
                  const sameSymbol = !!context.symbol && it.setup.symbol === context.symbol;
                  return <SetupObject key={it.id} setup={it.setup} compact={sameSymbol} />;
                }
                if (it.kind === 'action') {
                  return (
                    <View key={it.id} style={{ gap: 8 }}>
                      {it.action.summary_plain ? (
                        <T size={12} lh={17} c={color.muted}>{it.action.summary_plain}</T>
                      ) : null}
                      <View style={{ flexDirection: 'row' }}>
                        <Pressable
                          testID="kai-sheet-action"
                          accessibilityRole="button"
                          accessibilityLabel={it.action.label}
                          onPress={() => { void runAction(it.id, it.action); }}
                          style={({ pressed }) => ({
                            height: 38, paddingHorizontal: 16, borderRadius: radius.pill,
                            backgroundColor: color.volt, alignItems: 'center', justifyContent: 'center',
                            opacity: pressed ? 0.82 : 1,
                          })}
                        >
                          <T size={13} weight="bold" c={color.bg}>{it.action.label}</T>
                        </Pressable>
                      </View>
                    </View>
                  );
                }
                if (it.kind === 'notice') {
                  return (
                    <View key={it.id} style={{ flexDirection: 'row' }}>
                      <View style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.lg, borderWidth: 0.5, borderColor: alpha.volt40, backgroundColor: alpha.volt08 }}>
                        <T size={12} c={color.volt}>{it.text}</T>
                      </View>
                    </View>
                  );
                }
                if (it.kind === 'kai_text') {
                  return (
                    <KaiBubble key={it.id}>
                      <RichText text={it.streaming ? `${it.text}▍` : it.text} size={14} lh={21} />
                    </KaiBubble>
                  );
                }
                return null;
              })}
            </ScrollView>

            {/* The home indicator is under the keyboard while it is up, so the
                floor collapses with it — same rule as `KeyboardDock`. */}
            <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: keyboardHeight > 0 ? 10 : Math.max(insets.bottom, 22) }}>
              {/*
                RECOVERY AND SUGGESTIONS SIT ABOVE THE COMPOSER, not in the
                thread. A request that never reached the server has already had
                its turn lifted back out of the wall by the engine, so what is
                left to show is why and a button. Kai DECLINING is not this —
                that arrives as his own sentence in the conversation and offers
                no retry, because retrying a refusal spends the allowance twice.
              */}
              {failed ? (
                <View style={{ gap: 6, paddingBottom: 10 }} testID="kai-sheet-failure">
                  <T size={11} lh={16} c={color.muted} align="center">{failed.plain}</T>
                  <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
                    <Pressable
                      testID="kai-sheet-retry"
                      accessibilityRole="button"
                      accessibilityLabel="Send that again"
                      onPress={sendAgain}
                      style={({ pressed }) => ({
                        paddingVertical: 7, paddingHorizontal: 14, borderRadius: radius.pill,
                        borderWidth: 0.5, borderColor: alpha.volt40, backgroundColor: alpha.volt08,
                        opacity: pressed ? 0.7 : 1,
                      })}
                    >
                      <T size={12} weight="bold" c={color.volt}>Send that again</T>
                    </Pressable>
                    <Pressable
                      testID="kai-sheet-failure-dismiss"
                      accessibilityRole="button"
                      accessibilityLabel="Dismiss"
                      onPress={clearFailure}
                      style={({ pressed }) => ({ paddingVertical: 7, paddingHorizontal: 10, opacity: pressed ? 0.6 : 1 })}
                    >
                      <T size={12} c={color.dim}>Dismiss</T>
                    </Pressable>
                  </View>
                </View>
              ) : null}

              {/*
                Short questions tied to what the sheet was opened over, offered
                only before the member has said anything — after that they are
                the app talking over them. They carry no numbers by
                construction (`suggestedQuestions`), so nothing here can invent
                a price. Hidden while a question is in flight and while a
                failure is on screen, where the only useful button is Retry.
              */}
              {!streaming && !failed && !items.some((it) => it.kind === 'user_text') ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center', paddingBottom: 10 }}>
                  {suggestions.map((q) => (
                    <Pressable
                      key={q}
                      testID="kai-sheet-suggestion"
                      accessibilityRole="button"
                      accessibilityLabel={q}
                      onPress={() => { void send(q); }}
                      style={({ pressed }) => ({
                        paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill,
                        borderWidth: 0.5, borderColor: alpha.ivory08,
                        opacity: pressed ? 0.6 : 1,
                      })}
                    >
                      <T size={11.5} c={color.violetLight}>{q}</T>
                    </Pressable>
                  ))}
                </View>
              ) : null}

              {/*
                NO `disabled={streaming}`. A composer that locks while Kai talks
                is the thing that made stopping impossible: the send circle
                becomes STOP when `streaming` and `onStop` are both present, and
                a disabled composer cannot be pressed to stop anything. Typing
                the next question while the current answer streams is also
                normal behaviour in every chat anybody has used.
              */}
              <Composer
                testID="kai-sheet-composer"
                placeholder={kaiSheetPlaceholder(context)}
                onSend={send}
                streaming={streaming}
                onStop={stop}
                draft={failed?.restore ? failed.text : ''}
                draftNonce={draftNonce}
              />
              {/*
                "KAI IS NOT AN ADVISER", WHERE HE IS ACTUALLY TALKING.
                This is the surface where he discusses entries, stops and
                sizing, so it is the surface that has to carry the line — a
                disclaimer only on a settings screen is a disclaimer nobody
                reads at the moment it matters. Small and quiet on purpose: it
                must be legible without competing with the conversation.
                Wording is a DRAFT pending the owner's legal review; see
                `features/legal/disclaimers.ts`.
              */}
              <T size={9.5} lh={14} c={color.dim} align="center" style={{ marginTop: 8 }} testID="kai-not-advice">
                {NOT_ADVICE_SHORT}
              </T>
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
