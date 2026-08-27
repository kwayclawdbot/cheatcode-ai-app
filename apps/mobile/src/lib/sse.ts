import { Platform } from 'react-native';
import type { KaiFrame } from '@cheatcode/shared';

/**
 * SSE reader for POST /api/v1/kai/conversations/:id/messages.
 *
 * web    : global fetch + response.body.getReader() (required by the brief).
 * native : expo/fetch, which supports streaming response bodies in SDK 52+.
 * If neither can stream we fall back to reading the whole body and replaying
 * the frames at once, so the screen still renders a real reply.
 */
export type SSEHandlers = {
  onFrame: (frame: KaiFrame) => void;
  onError?: (message: string) => void;
  onDone?: () => void;
};

function parseChunk(buffer: string, onFrame: (f: KaiFrame) => void): string {
  // SSE records are separated by a blank line.
  const parts = buffer.split(/\r?\n\r?\n/);
  const tail = parts.pop() ?? '';
  for (const record of parts) {
    let event = 'message';
    const dataLines: string[] = [];
    for (const line of record.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim());
    }
    if (!dataLines.length && event !== 'done') continue;
    let data: Record<string, unknown> = {};
    const joined = dataLines.join('\n');
    if (joined) {
      try { data = JSON.parse(joined) as Record<string, unknown>; } catch { data = { text: joined }; }
    }
    // The contract puts the discriminator inside the payload; the `event:` name
    // mirrors it. Trust the payload, fall back to the event name.
    const type = typeof data.type === 'string' ? data.type : event;
    onFrame({ ...data, type } as unknown as KaiFrame);
  }
  return tail;
}

async function streamWithReader(res: Response, h: SSEHandlers) {
  const body = (res as unknown as { body?: ReadableStream<Uint8Array> }).body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    parseChunk(text.endsWith('\n\n') ? text : `${text}\n\n`, h.onFrame);
    h.onDone?.();
    return;
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    buffer = parseChunk(buffer, h.onFrame);
  }
  if (buffer.trim()) parseChunk(`${buffer}\n\n`, h.onFrame);
  h.onDone?.();
}

export async function streamSSE(
  url: string,
  init: { headers: Record<string, string>; body: string; signal?: AbortSignal },
  h: SSEHandlers,
): Promise<void> {
  const headers = { Accept: 'text/event-stream', 'Content-Type': 'application/json', ...init.headers };
  try {
    let res: Response;
    if (Platform.OS === 'web') {
      res = await fetch(url, { method: 'POST', headers, body: init.body, signal: init.signal });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const expoFetch = require('expo/fetch').fetch as typeof fetch;
      res = (await expoFetch(url, { method: 'POST', headers, body: init.body, signal: init.signal })) as Response;
    }
    if (!res.ok) {
      let msg = `Kai could not answer right now (${res.status}).`;
      try {
        const j = await res.json();
        msg = j?.error?.message_plain ?? msg;
      } catch { /* keep the generic line */ }
      h.onError?.(msg);
      h.onDone?.();
      return;
    }
    await streamWithReader(res, h);
  } catch (e) {
    const msg = e instanceof Error && e.name === 'AbortError' ? '' : "We couldn't reach Kai. Check your connection and try again.";
    if (msg) h.onError?.(msg);
    h.onDone?.();
  }
}
