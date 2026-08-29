/**
 * ONE way to turn notifications on, used by both surfaces allowed to reach the
 * prompt (§4.3): the notifications screen, and the priming sheet right after
 * an alert is armed. Two code paths to one OS prompt is two chances to prompt
 * cold, and a permission prompt can only be spent once.
 */
import { Platform } from 'react-native';
import { api } from '../../lib/api';
import { registerNative } from './register';
import { subscribeWeb } from './web-push';

export type TurnOnResult = { ok: boolean; plain: string };

const ON_COPY = 'This device will get notifications. You can turn it off here any time.';

export async function turnOnPush(vapidPublicKey?: string | null): Promise<TurnOnResult> {
  if (!api.available()) {
    return { ok: false, plain: 'The service is not connected here, so there is nothing to register with.' };
  }

  let result: { ok: boolean; plain?: string };
  if (Platform.OS === 'web') {
    // The server's own key, never an assumed one: a subscription minted
    // against a key it cannot sign for silently never delivers.
    let key = vapidPublicKey ?? null;
    if (key === undefined || key === null) {
      try {
        key = (await api.pushRegistry()).vapid_public_key;
      } catch {
        key = null;
      }
    }
    const web = await subscribeWeb(key);
    result = web.ok ? { ok: true } : { ok: false, plain: web.plain };
  } else {
    const native = await registerNative();
    result = native.ok ? { ok: true } : { ok: false, plain: native.plain };
  }

  if (!result.ok) return { ok: false, plain: result.plain ?? 'Notifications could not be turned on.' };

  // The user just asked for this; leaving the master switch off would send
  // them away having done nothing.
  try {
    await api.putSettings({ push_enabled: true });
  } catch {
    /* the device is registered either way; the switch reconciles on reload */
  }
  return { ok: true, plain: ON_COPY };
}
