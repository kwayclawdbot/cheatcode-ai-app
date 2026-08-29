/**
 * Structured logging, plus one thing the API's logger does not need: a human
 * console. A show is watched while it is made, so the operator gets a readable
 * line and the JSON goes to the same stream for anything parsing it later.
 *
 * NEVER LOGS: keys, tokens, or the full text of a prompt. Narration IS logged —
 * it is about to be said out loud on YouTube, so it is not a secret, and being
 * able to read what Kai is about to say before it is said is the whole point of
 * having a console.
 */
export type Level = 'info' | 'warn' | 'error';

const START = Date.now();

function clock(): string {
  const s = Math.round((Date.now() - START) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

let jsonMode = process.env.LIVE_LOG_JSON === '1';

export function setJsonLogging(on: boolean): void {
  jsonMode = on;
}

export function log(level: Level, event: string, fields: Record<string, unknown> = {}): void {
  if (jsonMode) {
    const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
    if (level === 'error') console.error(line);
    else if (level === 'warn') console.warn(line);
    else console.log(line);
    return;
  }
  const tail = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
    .join('  ');
  const line = `[${clock()}] ${event.padEnd(26)} ${tail}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

/** A line the operator is meant to read, not a machine. */
export function say(text: string): void {
  console.log(text);
}

export function money(usd: number): string {
  return `$${usd.toFixed(4)}`;
}
