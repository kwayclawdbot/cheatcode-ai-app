/**
 * SCHEMA-2 command RPCs (migration 0018).
 *
 * Every one of these is a `plpgsql` function, which is one transaction — that
 * is how the domain write and its `user_events` row land together (01 §3).
 *
 * FALLBACKS. Each caller in this app pairs its RPC with a documented
 * PostgREST fallback used only when the function is not present yet
 * (`isMissingObject`). The fallback does the same work in several round-trips,
 * so it is NOT atomic; it is logged as `rpc.fallback` and exists so the lane is
 * demonstrable before 0018 lands. When 0018 is applied the RPC path takes over
 * with no code change. See apps/api/README.md "Known gaps".
 */
import { serviceClient, isMissingObject } from './db';
import { log } from './log';

export type RpcOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; missing: true }
  | { ok: false; missing: false; message: string; code?: string };

export async function callRpc<T = unknown>(
  name: string,
  args: Record<string, unknown>,
  requestId = '-'
): Promise<RpcOutcome<T>> {
  try {
    const db = serviceClient();
    const { data, error } = await db.rpc(name, args);
    if (error) {
      if (isMissingObject(error)) {
        log('warn', requestId, 'rpc.missing', { name });
        return { ok: false, missing: true };
      }
      log('warn', requestId, 'rpc.failed', { name, code: error.code, message: error.message });
      return { ok: false, missing: false, message: error.message, code: error.code };
    }
    return { ok: true, data: data as T };
  } catch (e) {
    log('error', requestId, 'rpc.threw', { name, message: e instanceof Error ? e.message : String(e) });
    return { ok: false, missing: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export function noteFallback(requestId: string, rpcName: string, why = 'rpc not present') {
  log('warn', requestId, 'rpc.fallback', { rpc: rpcName, why });
}
