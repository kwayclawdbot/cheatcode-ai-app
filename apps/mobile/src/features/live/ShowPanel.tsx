/**
 * The show panel — what the chart structurally cannot say.
 *
 * WHAT BELONGS HERE AND WHAT DOES NOT. Anything about a price belongs ON the
 * chart, drawn at the price it is about. Moving it into a box beside the chart
 * is a downgrade: the number loses the one piece of context that made it mean
 * something. So this panel carries only the four things a candlestick cannot
 * express — whether the business is growing, what has been written about the
 * name, which of the setup's conditions are actually met, and the plan as a
 * whole.
 *
 * NOT A CARD GRID. The house rule is no boxed rounded rectangles in rows; the
 * structure here is hairlines and type. A quarter is a row with a rule under
 * it, not a tile. The only chrome is the panel's own edge, and even that is one
 * violet rule down the left — Kai's colour, because this is Kai's aside.
 *
 * MOTION IS INHERITED, NOT INVENTED. The timings come from the show that ran on
 * air for months (`trading-stream/src/core/overlay.js`): 540ms for the panel,
 * 380ms staggered for rows, 720ms for a bar growing, all on the same
 * cubic-bezier(0.22, 1, 0.36, 1). They are reused rather than re-guessed
 * because they were tuned against a person talking, which is the same clock
 * this panel is cut to.
 *
 * EVERY FIGURE IS CARRIED, NEVER COMPUTED. The frame arrives with its quarters
 * and its headlines already on it. This file formats; it does not do
 * arithmetic, and it never fetches — a panel that could reach the network is a
 * panel that could show a number nobody in the app can account for.
 */
import { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { T, Num } from '../../ui/Text';
import { color, alpha } from '../../ui/tokens';

/** The curve the old show used for everything. One easing, so nothing fights. */
const CURVE = Easing.bezier(0.22, 1, 0.36, 1);
const PANEL_MS = 540;
const ROW_MS = 380;
const BAR_MS = 720;

export type PanelName = 'fundamentals' | 'news' | 'evidence' | 'scorecard';

type Quarter = {
  fiscal_period: string;
  fiscal_year: string;
  end_date: string;
  revenue: number | null;
  net_income: number | null;
  eps_basic: number | null;
};

type Headline = {
  id: string;
  title: string;
  publisher: string | null;
  published_utc: string;
  sentiment: 'positive' | 'neutral' | 'negative' | null;
};

type Condition = { label: string; ok: boolean; detail: string | null };

/** "60.8B". The unit a person says, never the unit a filing uses. */
function big(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Number(n.toFixed(2)));
}

const SENTIMENT: Record<string, string> = {
  positive: color.green,
  negative: color.red,
  neutral: color.dim,
};

/** A row that arrives a beat after the one above it. */
function Row({ index, children }: { index: number; children: React.ReactNode }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = Animated.timing(a, {
      toValue: 1,
      duration: ROW_MS,
      delay: Math.min(index, 6) * 55,
      easing: CURVE,
      useNativeDriver: true,
    });
    t.start();
    return () => t.stop();
  }, [a, index]);
  return (
    <Animated.View
      style={{ opacity: a, transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}
    >
      {children}
    </Animated.View>
  );
}

/** A hairline, not a card border. The only structure this panel uses. */
function Rule() {
  return <View style={{ height: 1, backgroundColor: alpha.ivory06 ?? 'rgba(255,247,232,0.06)' }} />;
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <T size={10} weight="semibold" c={color.dim} style={{ letterSpacing: 1.4, textTransform: 'uppercase' }}>
      {children}
    </T>
  );
}

/**
 * Revenue as a bar that grows from nothing.
 *
 * Scaled against the LARGEST quarter on screen, not against zero and not
 * against some absolute: the comparison a viewer is making is "bigger or
 * smaller than the last few", and a bar scaled any other way answers a question
 * nobody asked.
 */
function Bar({ share, delay }: { share: number; delay: number }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = Animated.timing(a, { toValue: 1, duration: BAR_MS, delay, easing: CURVE, useNativeDriver: false });
    t.start();
    return () => t.stop();
  }, [a, delay]);
  return (
    <View style={{ height: 3, backgroundColor: 'rgba(255,247,232,0.05)', marginTop: 7 }}>
      <Animated.View
        style={{
          height: 3,
          backgroundColor: color.cyan,
          width: a.interpolate({ inputRange: [0, 1], outputRange: ['0%', `${Math.max(4, Math.round(share * 100))}%`] }),
        }}
      />
    </View>
  );
}

function Fundamentals({ payload }: { payload: Record<string, unknown> }) {
  const quarters = ((payload.quarters as Quarter[]) ?? []).slice(0, 4);
  const peak = Math.max(...quarters.map((q) => Math.abs(q.revenue ?? 0)), 1);
  return (
    <View style={{ gap: 2 }}>
      <Label>The business, as filed</Label>
      <View style={{ height: 10 }} />
      {quarters.map((q, i) => (
        <Row key={`${q.fiscal_year}${q.fiscal_period}`} index={i}>
          <View style={{ paddingVertical: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10 }}>
              <Num size={11} c={color.dim}>{`${q.fiscal_period} ${q.fiscal_year}`}</Num>
              <View style={{ flex: 1 }} />
              <Num size={19} weight="bold" c={color.text}>{big(q.revenue)}</Num>
              <Num size={11} c={color.muted}>{`EPS ${q.eps_basic === null ? '—' : q.eps_basic.toFixed(2)}`}</Num>
            </View>
            <Bar share={Math.abs(q.revenue ?? 0) / peak} delay={i * 55} />
          </View>
          <Rule />
        </Row>
      ))}
    </View>
  );
}

function News({ payload }: { payload: Record<string, unknown> }) {
  const headlines = ((payload.headlines as Headline[]) ?? []).slice(0, 4);
  return (
    <View style={{ gap: 2 }}>
      <Label>What has been written</Label>
      <View style={{ height: 10 }} />
      {headlines.map((h, i) => (
        <Row key={h.id} index={i}>
          <View style={{ flexDirection: 'row', gap: 10, paddingVertical: 11 }}>
            {/* The read, in the margin — a tick of colour, not a badge. */}
            <View
              style={{
                width: 2,
                alignSelf: 'stretch',
                backgroundColor: SENTIMENT[h.sentiment ?? 'neutral'] ?? color.dim,
              }}
            />
            <View style={{ flex: 1, gap: 4 }}>
              <T size={13} c={color.text}>{h.title}</T>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Num size={10} c={color.dim}>{h.published_utc.slice(0, 10)}</Num>
                {h.publisher ? <T size={10} c={color.dim}>{h.publisher}</T> : null}
              </View>
            </View>
          </View>
          <Rule />
        </Row>
      ))}
    </View>
  );
}

function Evidence({ payload }: { payload: Record<string, unknown> }) {
  const conditions = ((payload.conditions as Condition[]) ?? []).slice(0, 7);
  const met = conditions.filter((c) => c.ok).length;
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Label>Why this name qualified</Label>
        <View style={{ flex: 1 }} />
        <Num size={11} c={color.muted}>{`${met} of ${conditions.length}`}</Num>
      </View>
      <View style={{ height: 10 }} />
      {conditions.map((c, i) => (
        <Row key={c.label} index={i}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'baseline', paddingVertical: 9 }}>
            <T size={12} c={c.ok ? color.green : color.dim}>{c.ok ? '✓' : '·'}</T>
            <T size={13} c={c.ok ? color.text : color.muted} style={{ flex: 1 }}>{c.label}</T>
          </View>
          <Rule />
        </Row>
      ))}
    </View>
  );
}

function Scorecard({ payload }: { payload: Record<string, unknown> }) {
  const levels = ((payload.levels as { name: string; price: number }[]) ?? []).slice(0, 6);
  return (
    <View style={{ gap: 2 }}>
      <Label>The plan</Label>
      <View style={{ height: 10 }} />
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12 }}>
        <T size={44} weight="bold" c={color.volt}>{String(payload.grade ?? '—')}</T>
        <View style={{ flex: 1, paddingBottom: 6 }}>
          <T size={13} c={color.text}>{String(payload.headline ?? '')}</T>
          {payload.state ? <T size={11} c={color.dim}>{String(payload.state)}</T> : null}
        </View>
      </View>
      <View style={{ height: 14 }} />
      {levels.map((l, i) => (
        <Row key={l.name} index={i}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', paddingVertical: 8 }}>
            <T size={12} c={color.muted} style={{ flex: 1, textTransform: 'capitalize' }}>{l.name}</T>
            <Num size={14} weight="semibold" c={color.cyan}>{l.price.toFixed(2)}</Num>
          </View>
          <Rule />
        </Row>
      ))}
    </View>
  );
}

/**
 * The panel itself.
 *
 * Mounted only while a panel is up, so every child's entrance animation runs
 * from the top on each raise. Keyed on the panel name by the caller, which is
 * what makes a switch read as a switch rather than as content quietly changing
 * underneath a box that never moved.
 */
export function ShowPanel({ name, payload }: { name: PanelName; payload: Record<string, unknown> }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const t = Animated.timing(a, { toValue: 1, duration: PANEL_MS, easing: CURVE, useNativeDriver: true });
    t.start();
    return () => t.stop();
  }, [a]);

  return (
    <Animated.View
      testID={`show-panel-${name}`}
      style={{
        position: 'absolute',
        right: 0,
        top: 0,
        bottom: 0,
        width: '42%',
        maxWidth: 460,
        paddingLeft: 22,
        paddingRight: 20,
        paddingVertical: 22,
        // Nearly opaque. At 0.90 the candlesticks read straight through the
        // rows and the panel looked like a bug rather than a graphic; the chart
        // behind it is not context here, it is noise over text.
        backgroundColor: 'rgba(11,11,14,0.985)',
        borderLeftWidth: 2,
        borderLeftColor: color.violet,
        opacity: a,
        transform: [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [26, 0] }) }],
      }}
    >
      {name === 'fundamentals' ? <Fundamentals payload={payload} /> : null}
      {name === 'news' ? <News payload={payload} /> : null}
      {name === 'evidence' ? <Evidence payload={payload} /> : null}
      {name === 'scorecard' ? <Scorecard payload={payload} /> : null}
    </Animated.View>
  );
}
