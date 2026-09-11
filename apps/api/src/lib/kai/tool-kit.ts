/**
 * THE FOUR THINGS EVERY KAI TOOL AGREES ON.
 *
 * They lived in `tools.ts` while `tools.ts` was the only file with tools in it.
 * It is not any more — the desk tools and the room tools are their own modules,
 * and all three need this shape. Extracting it is what stops them importing each
 * other in a circle, and it is the reason `found: false` means the same thing in
 * every one of them.
 *
 * `found: false` IS AN ANSWER. That is the whole contract. A tool that cannot
 * answer returns a plain sentence saying why, Kai says that sentence, and the
 * user gets the truth. The failure mode this shape exists to prevent is a tool
 * that throws, a turn that dies, and a reply that either never arrives or
 * arrives as a guess.
 */

import type { AppMode } from '@shared/api';

/** Who is asking, in what mode, on which request. Never supplied by the model. */
export type ToolCtx = { userId: string; mode: AppMode; requestId: string };

/** The shape every tool answers in. `found:false` is a real answer, not an error. */
export type ToolResult = Record<string, unknown> & { found: boolean };

export const NOT_FOUND = (why: string): ToolResult => ({ found: false, plain: why });

/** A ticker as the rest of the system stores it, or '' when there is none. */
export const sym = (v: unknown): string => String(v ?? '').trim().toUpperCase();
