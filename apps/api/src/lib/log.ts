/** Structured request logging. Never logs tokens, keys, or message bodies. */
export function newRequestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
}

type Fields = Record<string, unknown>;

export function log(level: 'info' | 'warn' | 'error', requestId: string, event: string, fields: Fields = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, request_id: requestId, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
