/**
 * THE TWO KINDS OF ROW ON THE ACCOUNT BOARD, AND WHY THEY MUST NOT LOOK ALIKE.
 *
 * ===========================================================================
 * A ROW THAT LOOKS LIKE A DOOR MUST NOT BE A SWITCH.
 * ===========================================================================
 * Account used to hold rows that CHANGED A SETTING when you tapped them.
 * "Trading mode" cycled Day Trade → Swing → Investing, and "Experience level"
 * cycled New → Some → Pro. Both drew the same right-pointing chevron as every
 * row that opens a screen, and the mode chip four lines above them opened a
 * proper chooser — so the same setting behaved one way in one place and
 * another way in another, and a person tapping to *see* their mode silently
 * changed how Kai scans the market.
 *
 * Cycling is also unusable as a control once a setting has more than two
 * values: to go back one you have to go forward two, and nothing on screen
 * tells you what the other options even are.
 *
 * So there are exactly two row types here and they are visually different:
 *
 *   `NavRow`     — goes somewhere. Grey chevron, grey value. Changes nothing.
 *   `SettingRow` — opens a chooser. Volt value, and its accessibility label
 *                  says so out loud ("Change it").
 *
 * `SettingRow` NEVER TAKES AN ACTION OF ITS OWN. Its only job is to open a
 * `ChoiceSheet`, which lists every option with what each one actually does and
 * marks the one in force. Choosing is then a deliberate act with the
 * alternatives visible, which is what the audit asked for.
 *
 * `SaveNote` is the other half of that promise: a settings write can fail, and
 * a control that moved locally while the server refused is a lie the user
 * cannot see. It says saving, says saved, and on a failure says so with the
 * server's own sentence and a way to try again.
 */
import React from 'react';
import { View, Pressable } from 'react-native';
import { T } from '../../ui/Text';
import { Row } from '../../ui/Panel';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { ArrowRight, Check } from '../../ui/Icons';
import { alpha, color, radius } from '../../ui/tokens';

/** A row that goes somewhere. It changes nothing by being tapped. */
export function NavRow({
  icon, label, value, onPress, last = false, testID,
}: {
  icon?: React.ReactNode;
  label: string;
  value?: string | null;
  onPress: () => void;
  last?: boolean;
  testID?: string;
}) {
  return (
    <Row last={last}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, minHeight: 44 }}
      >
        {icon ? (
          <View style={{
            width: 28, height: 28, borderRadius: 8, borderWidth: 0.5, borderColor: alpha.ivory14,
            backgroundColor: alpha.ivory06, alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </View>
        ) : null}
        <T size={13.5} style={{ flex: 1 }}>{label}</T>
        {value ? <T size={12} c={color.muted}>{value}</T> : null}
        <ArrowRight size={12} color={color.muted} />
      </Pressable>
    </Row>
  );
}

/**
 * A row that opens a chooser. The value is in volt because volt means the
 * person acted, and the accessibility label says "Change it" so a screen
 * reader does not describe this as a link to a details screen.
 */
export function SettingRow({
  label, value, hint, onPress, last = false, testID,
}: {
  label: string;
  value: string;
  /** One line under the label saying what the setting does, when it needs one. */
  hint?: string | null;
  onPress: () => void;
  last?: boolean;
  testID?: string;
}) {
  return (
    <Row last={last}>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value}. Change it.`}
        accessibilityHint="Opens a list of the choices."
        onPress={onPress}
        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 }}
      >
        <View style={{ flex: 1 }}>
          <T size={13.5}>{label}</T>
          {hint ? <T size={11.5} lh={16.5} c={color.muted} style={{ marginTop: 2 }}>{hint}</T> : null}
        </View>
        <T size={12.5} weight="semibold" c={color.volt} align="right" style={{ maxWidth: '48%' }}>{value}</T>
        <ArrowRight size={12} color={color.volt} />
      </Pressable>
    </Row>
  );
}

export type Choice<K extends string> = {
  key: K;
  label: string;
  /** What picking this actually changes. Never a slogan. */
  detail: string;
};

/**
 * The explicit selection sheet. Every option, what each does, and a tick on
 * the one in force. Picking closes the sheet; the caller writes and reports
 * through `SaveNote`.
 */
export function ChoiceSheet<K extends string>({
  visible, title, intro, options, value, onChange, onClose, testID,
}: {
  visible: boolean;
  title: string;
  intro?: string;
  options: Choice<K>[];
  value: K;
  onChange: (k: K) => void;
  onClose: () => void;
  testID?: string;
}) {
  return (
    <Sheet visible={visible} onClose={onClose} title={title} testID={testID}>
      {intro ? <T size={12.5} lh={18} c={color.muted}>{intro}</T> : null}
      <View style={{ gap: 8 }}>
        {options.map((o) => {
          const on = o.key === value;
          return (
            <Pressable
              key={o.key}
              testID={`${testID ?? 'choice'}-${o.key}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${o.label}. ${o.detail}`}
              onPress={() => { onChange(o.key); onClose(); }}
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'flex-start', gap: 10,
                paddingVertical: 12, paddingHorizontal: 14,
                borderRadius: radius.xl, borderWidth: 0.5,
                borderColor: on ? alpha.volt55 : alpha.ivory14,
                backgroundColor: on ? alpha.volt08 : 'transparent',
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View style={{ flex: 1 }}>
                <T size={14} weight={on ? 'semibold' : 'regular'} c={on ? color.volt : color.text}>{o.label}</T>
                <T size={12} lh={17.5} c={color.muted} style={{ marginTop: 3 }}>{o.detail}</T>
              </View>
              {on ? <Check size={14} color={color.volt} strokeWidth={2.6} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Button label="Done" kind="ghost" height={44} onPress={onClose} />
    </Sheet>
  );
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * What happened to the last write on this section.
 *
 * A silent success is nearly as bad as a silent failure — the person has no
 * way to tell a saved setting from a tap that missed — so "Saved" is said out
 * loud, and a failure keeps the server's own sentence with a Try again beside
 * it rather than clearing itself after a second.
 */
export function SaveNote({
  status, message, onRetry, testID,
}: {
  status: SaveStatus;
  message?: string | null;
  onRetry?: () => void;
  testID?: string;
}) {
  if (status === 'idle') return null;
  if (status === 'saving') {
    return <T size={11.5} c={color.muted} testID={testID} style={{ marginTop: -4 }}>Saving…</T>;
  }
  if (status === 'saved') {
    return (
      <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -4 }}>
        <Check size={11} color={color.green} strokeWidth={2.6} />
        <T size={11.5} c={color.green}>Saved</T>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ marginTop: -4, gap: 4 }}>
      <T size={11.5} lh={17} c={color.red}>{message ?? "That didn't save."}</T>
      {onRetry ? (
        <Pressable
          testID={testID ? `${testID}-retry` : undefined}
          accessibilityRole="button"
          accessibilityLabel="Try saving again"
          onPress={onRetry}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <T size={11.5} weight="semibold" c={color.volt}>Try again</T>
        </Pressable>
      ) : null}
    </View>
  );
}
