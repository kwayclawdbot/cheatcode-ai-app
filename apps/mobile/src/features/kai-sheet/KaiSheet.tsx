import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { T } from '../../ui/Text';
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
  const { items, send, streaming, removeItem, pushNotice } = useKaiThread({
    mode, context: ctx, key: nonce, opening: null,
  });

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
  // Artboard: sheet top edge at 47% of the frame.
  const sheetHeight = Math.round(height * 0.53);

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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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

            <View style={{ paddingHorizontal: 18, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 22) }}>
              <Composer
                testID="kai-sheet-composer"
                placeholder={kaiSheetPlaceholder(context)}
                onSend={send}
                disabled={streaming}
              />
            </View>
          </LinearGradient>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
