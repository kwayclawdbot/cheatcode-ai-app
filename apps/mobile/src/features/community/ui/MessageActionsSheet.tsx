/**
 * What you can do about somebody else's post.
 *
 * TWO SHEETS IN ONE, AND THE DIFFERENCE IS THE PERSON HOLDING THE PHONE.
 * A member sees one row: Report. A member of staff sees three: Remove, Mute,
 * and Leave it up — the last one because a moderator who reads a report and
 * decides the post is fine has made a real decision, and there has to be
 * somewhere to put it, or the queue only ever grows.
 *
 * THE ROWS ARE A COURTESY, NOT A LOCK. `staff` here comes from `/me.staff`,
 * which is re-derived from `staff_members` on every call. It decides what is
 * DRAWN. Every one of these actions is a `staffed()` route that asks the
 * database again on its own request and refuses whatever this component
 * believed. A hidden button is decoration; the server is the control.
 *
 * A REASON IS REQUIRED FOR EVERY ACTION, INCLUDING LEAVING A POST UP. Three
 * weeks later "why is this member muted" has to have an answer, and the only
 * moment anybody knows it is now.
 *
 * Design: ruled rows, no card grid. Volt is the user's own action (Report is
 * the member's), red is the destructive one, gold is the reversible warning.
 */
import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { Sheet } from '../../../ui/Sheet';
import { T } from '../../../ui/Text';
import { alpha, color, radius } from '../../../ui/tokens';
import { family } from '../../../ui/fonts';

export type MessageActionsTarget = {
  messageId: string;
  roomId: string;
  authorUserId: string | null;
  authorName: string;
  /** Shown back so the moderator can see what they are deciding about. */
  excerpt: string;
  /** true when the poster is the person holding the phone. */
  mine: boolean;
};

type ActionKey = 'report' | 'remove' | 'mute' | 'keep';

const ACTION_COPY: Record<ActionKey, { title: string; hint: string; verb: string; tone: string }> = {
  report: {
    title: 'Report this post',
    hint: 'A moderator reads it. The post stays up until they decide.',
    verb: 'Send the report',
    tone: color.volt,
  },
  remove: {
    title: 'Remove this post',
    hint: 'It keeps its place in the thread and loses its words. Nothing is deleted — the original stays where only staff can read it.',
    verb: 'Remove it',
    tone: color.red,
  },
  mute: {
    title: `Mute this member here`,
    hint: 'They can still read the room. It lifts itself after a day — this is not a ban.',
    verb: 'Mute for a day',
    tone: color.gold,
  },
  keep: {
    title: 'Leave this post up',
    hint: 'Closes every open report on it, with your reason attached.',
    verb: 'Leave it up',
    tone: color.muted,
  },
};

function Row({
  label, note, tone, onPress, testID,
}: { label: string; note: string; tone: string; onPress: () => void; testID: string }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={note}
      onPress={onPress}
      style={{
        paddingVertical: 13,
        gap: 3,
        borderTopWidth: 1,
        borderTopColor: alpha.ivory07,
      }}
    >
      <T size={14.5} weight="semibold" c={tone}>{label}</T>
      <T size={11.5} lh={16} c={color.dim}>{note}</T>
    </Pressable>
  );
}

export function MessageActionsSheet({
  visible, target, staff, onClose, onReport, onRemove, onMute, onKeep,
}: {
  visible: boolean;
  target: MessageActionsTarget | null;
  /** From `/me.staff`. Controls what is drawn and nothing else. */
  staff: boolean;
  onClose: () => void;
  /**
   * Each handler is given the TARGET as well as the reason.
   *
   * Not a convenience: the React Compiler is on in this app, and it hoists the
   * property reads inside an inline closure into its memo cache — so a screen
   * that wrote `onRemove={() => remove(target!.messageId)}` crashed on render
   * with "Cannot read properties of null" the moment the sheet was mounted
   * with no target. Passing the target through the call keeps every screen's
   * handler free of a nullable dereference.
   */
  onReport: (target: MessageActionsTarget, reason: string) => Promise<string>;
  onRemove: (target: MessageActionsTarget, reason: string) => Promise<string>;
  onMute: (target: MessageActionsTarget, reason: string) => Promise<string>;
  onKeep: (target: MessageActionsTarget, reason: string) => Promise<string>;
}) {
  const [action, setAction] = useState<ActionKey | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setAction(null);
    setReason('');
    setBusy(false);
    setResult(null);
    setError(null);
  };

  const close = () => { reset(); onClose(); };

  const run = async () => {
    if (!action || !target) return;
    const r = reason.trim();
    if (r.length < 3) {
      setError('Say why in a few words. It goes on the record with your name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fn = action === 'report' ? onReport : action === 'remove' ? onRemove : action === 'mute' ? onMute : onKeep;
      // The server's own sentence, shown verbatim. The app does not narrate an
      // outcome it did not witness.
      setResult(await fn(target, r));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not go through. Nothing was changed.');
    } finally {
      setBusy(false);
    }
  };

  if (!target) return null;
  const copy = action ? ACTION_COPY[action] : null;

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={copy ? copy.title : target.mine ? 'Your post' : target.authorName}
      testID="message-actions-sheet"
    >
      {/* What is being acted on. Always visible, so nobody moderates a row they
          scrolled past. */}
      <View style={{ borderLeftWidth: 2, borderLeftColor: alpha.ivory12, paddingLeft: 11, gap: 2 }}>
        <T size={10.5} c={color.dim}>{target.mine ? 'You wrote' : `${target.authorName} wrote`}</T>
        <T size={12.5} lh={18} c={color.muted} numberOfLines={4}>{target.excerpt || '(no text)'}</T>
      </View>

      {result ? (
        <>
          <T size={13} lh={19} testID="message-action-result">{result}</T>
          <Pressable
            testID="message-action-done"
            accessibilityRole="button"
            accessibilityLabel="Done"
            onPress={close}
            style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: alpha.ivory07 }}
          >
            <T size={14.5} weight="semibold" c={color.volt}>Done</T>
          </Pressable>
        </>
      ) : !action ? (
        <View>
          {!target.mine ? (
            <Row
              testID="action-report"
              label="Report it"
              note={ACTION_COPY.report.hint}
              tone={color.volt}
              onPress={() => setAction('report')}
            />
          ) : null}

          {staff ? (
            <>
              <Row
                testID="action-remove"
                label="Remove it"
                note={ACTION_COPY.remove.hint}
                tone={color.red}
                onPress={() => setAction('remove')}
              />
              {target.authorUserId && !target.mine ? (
                <Row
                  testID="action-mute"
                  label={`Mute ${target.authorName} in this room`}
                  note={ACTION_COPY.mute.hint}
                  tone={color.gold}
                  onPress={() => setAction('mute')}
                />
              ) : null}
              <Row
                testID="action-keep"
                label="Leave it up, and close the reports"
                note={ACTION_COPY.keep.hint}
                tone={color.muted}
                onPress={() => setAction('keep')}
              />
            </>
          ) : null}

          {target.mine && !staff ? (
            <T size={12.5} lh={18} c={color.dim} style={{ paddingTop: 12 }}>
              This is your own post. There is nothing to report.
            </T>
          ) : null}
        </View>
      ) : (
        <View style={{ gap: 11 }}>
          <T size={12.5} lh={18} c={color.muted}>{copy?.hint}</T>

          <View style={{ gap: 7 }}>
            <T size={11} c={color.muted}>Why</T>
            <TextInput
              testID="message-action-reason"
              accessibilityLabel="Why"
              value={reason}
              onChangeText={setReason}
              editable={!busy}
              multiline
              placeholder={action === 'report' ? 'What is wrong with it?' : 'For the record.'}
              placeholderTextColor={color.dim}
              style={{
                minHeight: 68,
                borderRadius: radius.lg,
                paddingHorizontal: 14,
                paddingTop: 11,
                paddingBottom: 11,
                borderWidth: 0.5,
                borderColor: alpha.ivory20,
                backgroundColor: alpha.ivory06,
                fontFamily: family.regular,
                fontSize: 14,
                color: color.text,
                textAlignVertical: 'top',
              }}
            />
          </View>

          {error ? <T size={12} lh={17} c={color.red} testID="message-action-error">{error}</T> : null}

          <Pressable
            testID="message-action-confirm"
            accessibilityRole="button"
            accessibilityLabel={copy?.verb ?? 'Confirm'}
            disabled={busy}
            onPress={() => { void run(); }}
            style={{ paddingVertical: 13, borderTopWidth: 1, borderTopColor: alpha.ivory07, opacity: busy ? 0.5 : 1 }}
          >
            <T size={14.5} weight="semibold" c={copy?.tone ?? color.volt}>
              {busy ? 'Working…' : (copy?.verb ?? 'Confirm')}
            </T>
          </Pressable>
          <Pressable
            testID="message-action-back"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => { setAction(null); setError(null); }}
          >
            <T size={12.5} c={color.dim}>Back</T>
          </Pressable>
        </View>
      )}
    </Sheet>
  );
}
