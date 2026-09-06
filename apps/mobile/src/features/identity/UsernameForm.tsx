import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { checkHandle, suggestFromDisplayName } from '@shared/handles';
import { Field } from '../../ui/Field';
import { Button, Chip } from '../../ui/Button';
import { T } from '../../ui/Text';
import { Rule } from '../../ui/DataRow';
import { color } from '../../ui/tokens';
import { api } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { env } from '../../lib/env';

/**
 * PICK A USERNAME. One form, used in two places — the onboarding step and the
 * Account screen — because two copies of a rule is how the two copies drift.
 *
 * WHAT IT PROMISES
 *   * The rules are the SHARED ones (`@shared/handles`), so what turns the box
 *     red here is the same thing the API refuses and the same thing the
 *     database trigger refuses. Nobody gets past one lock and stopped at the
 *     next with a different sentence.
 *   * Availability is asked of the server while you type, debounced. It is a
 *     COURTESY: the save asks again, and the database asks again after that.
 *   * A SUGGESTION IS NEVER SAVED FOR YOU. If we have one it starts in the
 *     box, where you can type over it, and nothing is written until you press
 *     the button. And it never comes from an email address: being called by
 *     your login is not having a name.
 *
 * WHERE IT WRITES
 * Through the API when there is one, because that is where the plain-English
 * refusals come from. If the API is not reachable it falls back to writing
 * `profiles` directly — the same door the app already uses for every other
 * profile field — and the DATABASE TRIGGER still enforces every rule, so the
 * fallback cannot store something the API would have refused. It can only give
 * a rougher message.
 */
export function UsernameForm({
  current,
  suggested,
  displayName,
  onSaved,
  ctaLabel = 'Save username',
  autoFocus = true,
  testID = 'username-form',
}: {
  /** The handle on the account now, or null. */
  current: string | null;
  /** The server's suggestion, or null. Pre-filled, never auto-saved. */
  suggested?: string | null;
  /** Only used to seed a suggestion when the server did not send one. */
  displayName?: string | null;
  onSaved: (handle: string) => void;
  ctaLabel?: string;
  autoFocus?: boolean;
  testID?: string;
}) {
  const seed = current ?? suggested ?? suggestFromDisplayName(displayName) ?? '';
  const [value, setValue] = useState(seed);
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [remoteProblem, setRemoteProblem] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const latest = useRef(0);

  const trimmed = value.trim();
  const shape = checkHandle(trimmed);
  const unchanged = current !== null && trimmed.toLowerCase() === current.toLowerCase();

  /** Ask the server, but only once the shape is right — never on every key. */
  useEffect(() => {
    setSaveError(null);
    if (!shape.ok || unchanged) {
      setAvailable(null);
      setRemoteProblem(null);
      setSuggestions([]);
      return;
    }
    if (!api.available()) return;

    const ticket = ++latest.current;
    setChecking(true);
    const timer = setTimeout(async () => {
      try {
        const r = await api.checkHandle(trimmed);
        if (ticket !== latest.current) return;
        setAvailable(r.available);
        setRemoteProblem(r.available ? null : r.plain);
        setSuggestions(r.suggestions ?? []);
      } catch {
        // A check we could not make is NOT a refusal. Leave the button live and
        // let the save be the thing that answers — the server and the database
        // both check again, so nothing wrong can be written because of this.
        if (ticket === latest.current) {
          setAvailable(null);
          setRemoteProblem(null);
        }
      } finally {
        if (ticket === latest.current) setChecking(false);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [trimmed, shape.ok, unchanged]);

  const save = useCallback(async () => {
    if (!shape.ok) return;
    setSaving(true);
    setSaveError(null);
    try {
      if (api.available()) {
        await api.putHandle(trimmed);
      } else if (supabase && !env.FIXTURES) {
        const { data: sess } = await supabase.auth.getSession();
        const uid = sess.session?.user.id;
        if (!uid) throw new Error('You are not signed in.');
        const { error } = await supabase.from('profiles').update({ handle: trimmed }).eq('user_id', uid);
        if (error) throw new Error(plainFromDatabase(error.message));
      }
      onSaved(trimmed);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'I could not save that just now. Please try again.');
    } finally {
      setSaving(false);
    }
  }, [shape.ok, trimmed, onSaved]);

  const problem = !trimmed ? null : !shape.ok ? shape.plain : remoteProblem;
  const good = shape.ok && (unchanged || available === true);

  return (
    <View testID={testID} style={{ gap: 14 }}>
      <Field
        testID="username-input"
        label="Username"
        value={value}
        onChangeText={setValue}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        maxLength={20}
        placeholder="e.g. marcust"
        returnKeyType="done"
        onSubmitEditing={good ? save : undefined}
        error={saveError ?? problem}
      />

      {/* The rules, always on screen. Not a placeholder that vanishes the
          moment somebody types, and not a message that only appears once they
          have got it wrong. */}
      <T size={12} lh={18} c={color.muted} testID="username-rules">
        3 to 20 characters. Letters, numbers and underscores, starting with a letter.
      </T>

      {/* The status line, which never claims more than it knows. Blank while
          the name is refused — the refusal is already under the box. */}
      <T size={12} lh={18} c={color.volt} testID="username-status">
        {checking
          ? 'Checking\u2026'
          : good
            ? unchanged
              ? 'That is the username you already have.'
              : `${trimmed} is free.`
            : ''}
      </T>

      {suggestions.length ? (
        <View style={{ gap: 9 }}>
          <T size={12} c={color.muted}>These are free:</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {suggestions.map((s) => (
              <Chip key={s} label={s} testID={`username-suggestion-${s}`} onPress={() => setValue(s)} />
            ))}
          </View>
        </View>
      ) : null}

      <Rule />

      <T size={12} lh={18} c={color.dim}>
        Your username is what your posts are signed with, and what other members can mention
        you by. You can change it later. A few names are held back for the Cheat Code team and
        for the app itself.
      </T>

      <Button
        testID="username-save"
        label={ctaLabel}
        kind="volt"
        height={52}
        disabled={!shape.ok || saving || (available === false && !unchanged)}
        loading={saving}
        onPress={save}
      />
    </View>
  );
}

/**
 * The direct-to-database fallback raises the trigger's own message, which is
 * already written for a person (0034). Anything else — a unique-index
 * violation, a network error — is turned into one sentence rather than shown
 * raw, because "duplicate key value violates unique constraint" is not
 * something a member should ever read.
 */
function plainFromDatabase(message: string): string {
  if (/duplicate key|profiles_handle/i.test(message)) return 'Somebody already has that username.';
  if (/username|avatar|display name/i.test(message)) return message;
  return 'I could not save that just now. Please try again.';
}
