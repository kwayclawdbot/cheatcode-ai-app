/**
 * The chart, given the whole screen.
 *
 * TWO MODES, ONE SURFACE.
 *
 *   TOOL. You expanded it. The chart fills the screen, takes the full gesture
 *   set — vertical drag pans the price axis, pinch scales both — and keeps the
 *   controls it needs. Turn the phone and it goes wide, because a chart is
 *   wider than it is tall and holding one sideways is what looking at a chart
 *   has always meant.
 *
 *   BROADCAST. Kai starts answering and the room goes quiet: the header and the
 *   timeframe rail fade back, and his words run along the bottom in time with
 *   his voice. Nothing is disabled — the chart is still yours, and touching it
 *   interrupts him exactly as it does anywhere else — but there is nothing
 *   asking to be tapped, so watching is the obvious thing to do. When he
 *   finishes, the chrome comes back and it is a tool again.
 *
 * WHY THE MODE IS NOT A BUTTON. A "presentation mode" the user has to enter is
 * a mode they will forget exists. This one is a consequence: Kai is talking, so
 * the furniture gets out of the way. The only decision the user makes is to ask
 * a question, which they were making anyway.
 *
 * THE CAPTION IS A LOWER THIRD, NOT A CHAT BUBBLE. It sits over the chart along
 * the bottom edge, one or two lines, on a scrim heavy enough to stay legible
 * over candles. A bubble above the chart would be a transcript of a thing that
 * already happened; a lower third is the thing happening, and your eye never
 * leaves the chart to read it.
 */
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChartView } from './ChartView';
import type { DraftAnnotation } from './ChartView';
import { DrawTray, type DrawToolName } from './DrawTray';
import type { ChartHandle } from './apply';
import { allowLandscape, lockPortrait } from './orientation';
import type { Annotation, PortalTimeframe } from '../portal/types';
import type { Candle } from '../../lib/types';
import { T, Num } from '../../ui/Text';
import { alpha, color, radius } from '../../ui/tokens';

export type ChartStageProps = {
  open: boolean;
  onClose: () => void;

  symbol: string;
  name?: string | null;
  timeframe: PortalTimeframe;
  timeframes?: PortalTimeframe[];
  candles: Candle[];
  annotations: Annotation[];
  lastPrice?: number | null;
  focusTs?: string | null;
  hideAnnotations?: boolean;

  onTimeframeChange?: (tf: PortalTimeframe) => void;
  onSelectAnnotation?: (a: Annotation) => void;
  /** The stage hands its chart up so Kai's commands perform on THIS one. */
  onChart?: (h: ChartHandle | null) => void;

  /** Kai is answering. Drives broadcast mode. */
  live?: boolean;
  /** What he is saying, for the lower third. */
  caption?: string | null;
  /**
   * WHAT IS HAPPENING WHEN HE IS NOT SAYING ANYTHING.
   *
   * THE BUG THIS EXISTS FOR: pressing "Kai, read this chart" opens this stage
   * AND asks the question. The stage arriving IS the chart moving. If the
   * answer then fails, `caption` stays null, the lower third never appears, and
   * the user is left looking at a full-screen chart that moved and then did
   * nothing — with the explanation sitting in a chat panel behind this modal
   * where it cannot be read. Reproduced in fixtures; it is the owner's exact
   * sentence.
   *
   * So the stage now carries the state of the ask: "Kai is reading SPY…" while
   * he works, and the reason in his own words if he could not.
   */
  notice?: string | null;
  /** `failed` tints the hairline gold — a problem, not Kai talking. */
  noticeTone?: 'working' | 'failed' | null;

  /**
   * DRAWING BY HAND. Omit them and the tray does not appear — a chart with no
   * way to save what you draw should not offer to let you draw it.
   */
  onDrawCreate?: (a: DraftAnnotation) => void;
  onDrawChange?: (a: DraftAnnotation) => void;
  onDrawDelete?: (id: string) => void;
};

/* ------------------------------------------------------------------ */

/**
 * The lower third.
 *
 * It MATERIALISES rather than fades: the scrim rises a few points as it comes
 * in and settles, so it reads as something arriving over the chart instead of a
 * label switching on. Out the same way, along the same path — a thing that
 * appears from below and leaves upward has no physical explanation and the eye
 * notices even when the mind does not.
 */
function LowerThird({
  text, visible, bottom, tint = color.violet, testID = 'stage-lower-third',
}: {
  text: string;
  visible: boolean;
  bottom: number;
  tint?: string;
  testID?: string;
}) {
  const a = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(a, {
      toValue: visible ? 1 : 0,
      duration: visible ? 300 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [visible, a]);

  return (
    <Animated.View
      pointerEvents="none"
      testID={testID}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: bottom + 14,
        paddingTop: 26,
        paddingHorizontal: 18,
        opacity: a,
        transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
        // A scrim, not a card. A rounded rectangle floating over the chart is a
        // panel and reads as another piece of UI; a gradient the chart runs out
        // of is the chart still being the whole screen.
        backgroundColor: alpha.bg82,
      }}
    >
      {/*
        A hairline in Kai's violet, the width of the text block. It is the only
        thing on screen that says WHO is talking — the palette does the work a
        name label would otherwise have to, and takes no room doing it.
      */}
      <View
        style={{
          height: 2,
          width: 34,
          borderRadius: radius.pill,
          backgroundColor: tint,
          marginBottom: 10,
        }}
      />
      <T size={15.5} lh={22} c={color.text} numberOfLines={3}>
        {text}
      </T>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */

export function ChartStage(props: ChartStageProps) {
  const { open, onClose, live = false, caption, notice, noticeTone } = props;
  const [tool, setTool] = useState<DrawToolName>(null);
  const [selected, setSelected] = useState<{ id: string | null; provenance: string | null }>({ id: null, provenance: null });
  const canDraw = Boolean(props.onDrawCreate);

  /**
   * ONE LOWER THIRD, TWO JOBS. Kai's words win while he is speaking; when he is
   * not, the stage says what it is waiting for or why it is not going to get it.
   * The one thing it must never do is show nothing after the user asked for
   * something.
   */
  const lower = live && caption ? caption : (notice ?? caption ?? null);
  const lowerIsNotice = !(live && caption) && Boolean(notice);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const landscape = width > height;

  const chart = useRef<ChartHandle | null>(null);
  const [ready, setReady] = useState(false);

  /** Chrome recedes while Kai talks, and comes back when he stops. */
  const chrome = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!open) return;
    void allowLandscape();
    return () => {
      void lockPortrait();
    };
  }, [open]);

  useEffect(() => {
    Animated.timing(chrome, {
      toValue: live ? 0 : 1,
      duration: live ? 260 : 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [live, chrome]);

  // The chart takes its full gesture set the moment it owns the screen, and
  // hands it back on the way out — see `setGestures` in chart-web/06-chart.js.
  useEffect(() => {
    if (!ready) return;
    chart.current?.setGestures?.(open);
  }, [ready, open]);

  useEffect(() => {
    if (!ready) return;
    chart.current?.setBroadcast?.(live);
  }, [ready, live]);

  const closeStage = () => {
    chart.current?.setGestures?.(false);
    chart.current?.setBroadcast?.(false);
    onClose();
  };

  return (
    <Modal
      visible={open}
      animationType="fade"
      supportedOrientations={['portrait', 'landscape']}
      onRequestClose={closeStage}
      statusBarTranslucent
      transparent={false}
    >
      <View style={{ flex: 1, backgroundColor: color.bg }}>
        {/*
          THE CHART IS THE SCREEN. It is mounted first and sized to everything,
          and the chrome floats over it — rather than the chart being given
          whatever is left after a header and a footer have taken their cut.
        */}
        <View style={{ flex: 1 }}>
          <ChartView
            testID="stage-chart"
            ref={(h) => {
              chart.current = h;
              props.onChart?.(h);
            }}
            symbol={props.symbol}
            timeframe={props.timeframe}
            timeframes={props.timeframes}
            candles={props.candles}
            annotations={props.annotations}
            hideAnnotations={props.hideAnnotations}
            focusTs={props.focusTs}
            lastPrice={props.lastPrice ?? null}
            onSelectAnnotation={props.onSelectAnnotation}
            onTimeframeChange={props.onTimeframeChange}
            onReady={() => setReady(true)}
            onDrawCreated={props.onDrawCreate}
            onDrawChanged={props.onDrawChange}
            onDrawDeleted={props.onDrawDelete}
            onDrawSelected={(s) => setSelected({ id: s.id, provenance: s.provenance })}
            // The page puts the tool away after one shape; the tray has to hear
            // about it or it would keep showing a tool that is no longer armed.
            onDrawTool={(t) => setTool(t)}
            onDrawLongPress={() => chart.current?.deleteSelectedDrawing?.()}
          />
        </View>

        {/*
          The tools. Hidden while Kai is talking, for the same reason the header
          and the rail are: there is nothing to do but watch, so nothing asks to
          be tapped.
        */}
        {canDraw && !live ? (
          <DrawTray
            tool={tool}
            onPick={(t) => {
              setTool(t);
              chart.current?.setDrawTool?.(t);
            }}
            canDelete={selected.id !== null && selected.provenance === 'user'}
            onDelete={() => chart.current?.deleteSelectedDrawing?.()}
            left={landscape ? Math.max(insets.left, 8) : 0}
          />
        ) : null}

        {/* ---- the header, floating ---- */}
        <Animated.View
          pointerEvents={live ? 'none' : 'box-none'}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            paddingTop: (landscape ? 8 : insets.top) + 8,
            paddingHorizontal: landscape ? Math.max(insets.left, 16) + 4 : 16,
            paddingBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            opacity: chrome,
            transform: [{ translateY: chrome.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }],
          }}
        >
          <T size={15} weight="semibold" c={color.text}>{props.symbol}</T>
          {props.lastPrice != null ? (
            <Num size={13} c={color.cyan}>{props.lastPrice.toFixed(2)}</Num>
          ) : null}
          <View style={{ flex: 1 }} />
          <Pressable
            onPress={closeStage}
            hitSlop={12}
            testID="stage-close"
            accessibilityRole="button"
            accessibilityLabel="Close the full chart"
            style={{
              paddingHorizontal: 13,
              paddingVertical: 7,
              borderRadius: radius.pill,
              backgroundColor: alpha.surface75,
            }}
          >
            <T size={12} weight="semibold" c={color.muted}>Done</T>
          </Pressable>
        </Animated.View>

        {/*
          THE LIVE MARK. Violet, because that is Kai, and a dot rather than a
          word: the caption underneath already says he is talking, so this only
          has to say the chart is his for a moment.
        */}
        {live ? (
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: (landscape ? 8 : insets.top) + 14,
              right: landscape ? Math.max(insets.right, 16) + 4 : 16,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
            }}
          >
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color.violet }} />
            <T size={10.5} weight="semibold" c={color.violetLight} style={{ letterSpacing: 0.9 }}>KAI</T>
          </View>
        ) : null}

        {lower ? (
          <LowerThird
            text={lower}
            // A notice is shown whether or not he is live — that is the whole
            // point of it. `visible={live}` alone is what kept the failure off
            // the screen.
            visible={live || lowerIsNotice}
            tint={lowerIsNotice && noticeTone === 'failed' ? color.gold : color.violet}
            testID={lowerIsNotice ? 'stage-notice' : 'stage-lower-third'}
            bottom={landscape ? Math.max(insets.bottom, 8) : insets.bottom}
          />
        ) : null}
      </View>
    </Modal>
  );
}
