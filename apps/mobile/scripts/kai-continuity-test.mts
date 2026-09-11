/**
 * THE CONVERSATION YOU ARE IN IS THE CONVERSATION YOU ARE TALKING TO.
 *
 *   cd apps/mobile && npx tsx scripts/kai-continuity-test.mts
 *
 * WHAT WENT WRONG, AND WHY A TEST. `useKaiWall(mode, seed)` took no
 * conversation id. Home stored the selected `ConversationRow` and changed the
 * seed sentence; the wall kept its own `convoId` in a ref and sent every turn
 * there. So the header could say "NVIDIA Earnings Research" while the answer
 * was being written into the conversation Home made when it loaded, and the
 * saved messages were never fetched, so nothing on screen contradicted it.
 * "New conversation" changed the seed and reset nothing at all.
 *
 * That is not a bug you fix by remembering to clear a ref. It is fixed by
 * making the thread an input and making every write to the screen carry the
 * identity of the thread it was started for — which is `lib/kai-continuity.ts`,
 * and which is what the first half of this file drives directly, through a
 * miniature of the real wall against a fake server.
 *
 * The audit's acceptance test for F04 is the shape of section 3:
 *   "Create A and B with distinct topics; switch between them and send a turn.
 *    Check transcript and server ID. Refresh, resume B, then start New; no
 *    history or response may cross between them."
 *
 * The second half is a source check on `lib/useKai.ts`, `ui/Composer.tsx` and
 * `app/(tabs)/home.tsx`. The engine itself cannot be imported here — it reaches
 * react-native through the API client — and the properties that matter are
 * structural: ONE stream reader rather than two drifting copies, no `convoId`
 * ref anywhere, every screen write behind the generation gate, and a Stop the
 * member can actually press. A regression on any of those is a rewrite of the
 * thing this lane repaired, so it should have to be done on purpose.
 */
import {
  createThreadBinding, readTranscript, retryableTurn, sameTarget, suggestedQuestions,
  targetKey, transcriptItems,
  type FailedTurn, type ThreadTarget,
} from '../src/lib/kai-continuity';
import type { WallItem } from '../src/lib/types';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let failures = 0;
function ok(name: string, cond: unknown, detail?: unknown): void {
  if (cond) { console.log(`  ok   ${name}`); return; }
  failures += 1;
  console.log(`  FAIL ${name}${detail === undefined ? '' : `\n       ${JSON.stringify(detail)}`}`);
}
function head(title: string): void {
  console.log(`\n${title}\n${'-'.repeat(title.length)}`);
}

/* ==================================================================== */
/* A fake server, and a miniature of the wall that runs on the binding   */
/* ==================================================================== */

type StoredTurn = { seq: number; role: 'user' | 'kai'; content: { text: string } };

/** `conversations` + `conversation_messages`, small enough to read. */
function makeServer() {
  const rows = new Map<string, { topic: string; turns: StoredTurn[] }>();
  let n = 0;
  return {
    rows,
    /** POST /kai/conversations */
    create(topic: string): string {
      const id = `conv-${++n}-${topic}`;
      rows.set(id, { topic, turns: [] });
      return id;
    },
    record(id: string, role: 'user' | 'kai', text: string): void {
      const row = rows.get(id);
      if (!row) return;
      row.turns.push({ seq: row.turns.length + 1, role, content: { text } });
    },
    /** what a transcript read would hand back */
    transcript(id: string): unknown {
      return rows.get(id)?.turns ?? [];
    },
  };
}
type Server = ReturnType<typeof makeServer>;

/**
 * The wall, minus React and minus the network: the same `head` / `live` split
 * and the same `owns(generation)` gate the engine in `useKai.ts` uses, so the
 * ordering this exercises is the ordering that ships.
 */
function makeWall(server: Server, base: WallItem[] = []) {
  const binding = createThreadBinding();
  let head: WallItem[] = base;
  let live: WallItem[] = [];
  let streaming = false;
  let failed: FailedTurn | null = null;
  let cancelCurrent: (() => void) | null = null;
  let ids = 0;
  const nextId = () => `w${++ids}`;

  /** The transcript fetch, split so the test can make it land LATE. */
  type Pending = { apply: () => void };
  const open = (target: ThreadTarget): { changed: boolean; load: Pending | null } => {
    const move = binding.point(target, streaming);
    if (!move.changed) return { changed: false, load: null };
    if (move.abort) cancelCurrent?.();
    cancelCurrent = null;
    streaming = false;
    failed = null;
    live = [];
    head = base;
    if (!move.load) return { changed: true, load: null };
    const id = move.load;
    const gen = move.generation;
    return {
      changed: true,
      load: {
        apply: () => {
          if (!binding.owns(gen)) return;          // the wall moved on
          head = transcriptItems(id, readTranscript(server.transcript(id)));
        },
      },
    };
  };

  type Turn = {
    generation: number;
    /** the server answered the create; false when the wall has moved on */
    bind: (conversationId: string) => boolean;
    deliver: (chunk: string) => void;
    finish: (transportError?: string) => void;
  };

  const send = (text: string): Turn | null => {
    const body = text.trim();
    if (!body || streaming) return null;
    const gen = binding.generation();
    const owns = () => binding.owns(gen);
    const userId = nextId();
    const typingId = nextId();
    const replyId = nextId();
    let started = false;
    let cancelled = false;
    let bound: string | null = binding.conversationId();
    let reply = '';

    live = [...live, { kind: 'user_text', id: userId, text: body }, { kind: 'typing', id: typingId }];
    streaming = true;
    failed = null;
    if (bound) server.record(bound, 'user', body);
    cancelCurrent = () => { cancelled = true; };

    const finish = (transportError?: string) => {
      streaming = false;
      cancelCurrent = null;
      // The server persists the turn whatever the client is showing.
      if (bound && reply) server.record(bound, 'kai', reply);
      if (!owns()) return;
      live = live
        .filter((it) => it.id !== typingId)
        .map((it) => (it.kind === 'kai_text' && it.id === replyId ? { ...it, streaming: false } : it));
      if (cancelled) {
        live = [...live, { kind: 'notice', id: nextId(), text: 'Stopped.' }];
        return;
      }
      if (transportError && !started) {
        live = live.filter((it) => it.id !== userId);
        failed = { generation: gen, text: body, plain: transportError, restore: true };
        return;
      }
      if (transportError) failed = { generation: gen, text: body, plain: transportError, restore: false };
    };

    return {
      generation: gen,
      bind: (conversationId: string) => {
        if (!binding.adopt(gen, conversationId)) return false;
        bound = conversationId;
        server.record(conversationId, 'user', body);
        return true;
      },
      deliver: (chunk: string) => {
        if (cancelled) return;
        reply += chunk;
        if (!owns()) return;
        if (!started) {
          started = true;
          live = live.map((it) => (it.id === typingId
            ? { kind: 'kai_text', id: replyId, text: '', streaming: true }
            : it));
        }
        live = live.map((it) => (it.kind === 'kai_text' && it.id === replyId
          ? { ...it, text: it.text + chunk }
          : it));
      },
      finish,
    };
  };

  return {
    binding,
    open,
    send,
    stop: () => { cancelCurrent?.(); },
    items: (): WallItem[] => [...head, ...live],
    texts: (): string[] => [...head, ...live]
      .map((it) => ('text' in it ? it.text : `<${it.kind}>`)),
    failed: () => retryableTurn(failed, binding.generation()),
    streaming: () => streaming,
    conversationId: () => binding.conversationId(),
  };
}

/* ==================================================================== */
/* 1. A target is an identity, not a label                              */
/* ==================================================================== */

head('Pointing the wall somewhere else is a different thing from re-rendering');
{
  const b = createThreadBinding();
  ok('starts on today, knowing no conversation',
    b.target().kind === 'today' && b.conversationId() === null && b.generation() === 0);

  const first = b.point({ kind: 'saved', id: 'A' });
  ok('opening a saved row binds its server id at once, before a word is sent',
    first.changed && b.conversationId() === 'A' && first.load === 'A', first);

  const again = b.point({ kind: 'saved', id: 'A' });
  ok('re-rendering on the same row is not a switch',
    !again.changed && again.load === null && b.generation() === first.generation, again);

  const toNew = b.point({ kind: 'new', nonce: 1 });
  ok('New forgets the conversation and asks for no transcript',
    toNew.changed && b.conversationId() === null && toNew.load === null, toNew);

  const secondNew = b.point({ kind: 'new', nonce: 2 });
  ok('a SECOND New is a different thread from the first',
    secondNew.changed && secondNew.generation > toNew.generation, secondNew);

  ok('two news with the same nonce are the same thread',
    sameTarget({ kind: 'new', nonce: 2 }, { kind: 'new', nonce: 2 }));
  ok('today, new and saved cannot collide in the key space',
    new Set([
      targetKey({ kind: 'today' }),
      targetKey({ kind: 'new', nonce: 0 }),
      targetKey({ kind: 'saved', id: '0' }),
    ]).size === 3);

  ok('a stream running when the switch happens is reported for abandonment',
    b.point({ kind: 'saved', id: 'B' }, true).abort === true);
  ok('and nothing is abandoned when nothing was running',
    b.point({ kind: 'saved', id: 'C' }, false).abort === false);
}

head('Work stamped with an old generation cannot reach the screen');
{
  const b = createThreadBinding();
  const stale = b.point({ kind: 'new', nonce: 1 }).generation;
  ok('it owns its own generation', b.owns(stale));
  b.point({ kind: 'new', nonce: 2 });
  ok('and owns it no longer once the wall has moved', !b.owns(stale));
  ok('a conversation the server made for the old thread is refused',
    b.adopt(stale, 'conv-late') === false && b.conversationId() === null);
  ok('one made for the current thread is taken',
    b.adopt(b.generation(), 'conv-now') && b.conversationId() === 'conv-now');
}

/* ==================================================================== */
/* 2. Saved messages                                                    */
/* ==================================================================== */

head('A transcript is read honestly or not at all');
{
  const rows = [
    { seq: 2, role: 'kai', content: { text: 'It broke the range.' } },
    { seq: 1, role: 'user', content: { text: 'What is NVDA doing?' } },
    { seq: 3, role: 'kai', content: { text: '   ' } },
    { seq: 4, role: 'kai', content: {} },
    { seq: 'nonsense', role: 'user', content: { text: 'dropped' } },
  ];
  const turns = readTranscript(rows);
  ok('sequence order is the server’s, not the array’s',
    turns.map((t) => t.seq).join(',') === '1,2', turns);
  ok('a message with nothing readable in it is dropped, not drawn blank',
    turns.length === 2, turns);
  ok('a row with no usable sequence is dropped', !turns.some((t) => t.text === 'dropped'));
  ok('nothing at all is an empty transcript, not a crash',
    readTranscript(null).length === 0 && readTranscript({}).length === 0);

  const items = transcriptItems('conv-A', turns);
  ok('roles survive the trip', items.map((i) => i.kind).join(',') === 'user_text,kai_text', items);
  ok('ids are derived from the conversation, so a reload cannot duplicate it',
    JSON.stringify(transcriptItems('conv-A', turns)) === JSON.stringify(items));
  ok('and an id from one thread can never collide with another’s',
    transcriptItems('conv-B', turns).every((i) => !items.some((j) => j.id === i.id)));
}

/* ==================================================================== */
/* 3. The audit's acceptance test for F04                               */
/* ==================================================================== */

head('Create A and B with distinct topics, and keep them apart');
{
  const server = makeServer();
  const A = server.create('spy');
  const B = server.create('nvda');
  server.record(A, 'user', 'Is SPY worth watching?');
  server.record(A, 'kai', 'SPY is in the middle of its range.');
  server.record(B, 'user', 'What about NVDA earnings?');
  server.record(B, 'kai', 'NVDA reports after the close on Wednesday.');

  const wall = makeWall(server);

  // --- open A: the transcript is restored and the id is bound
  const openA = wall.open({ kind: 'saved', id: A });
  openA.load?.apply();
  ok('opening A shows A’s own words', wall.texts().join(' | ').includes('SPY is in the middle'), wall.texts());
  ok('and binds A’s server id', wall.conversationId() === A, wall.conversationId());
  ok('nothing of B is on screen', !wall.texts().join(' ').includes('NVDA'), wall.texts());

  // --- a turn in A goes to A
  const turnA = wall.send('And the level above?');
  turnA?.deliver('Just under the prior high.');
  turnA?.finish();
  ok('the turn was persisted to A', JSON.stringify(server.transcript(A)).includes('And the level above?'));
  ok('and not to B', !JSON.stringify(server.transcript(B)).includes('And the level above?'));

  // --- switch to B while A is still streaming
  const slow = wall.send('One more thing');
  slow?.deliver('I am still writ');
  ok('A is streaming', wall.streaming());
  const openB = wall.open({ kind: 'saved', id: B });
  openB.load?.apply();
  ok('switching abandoned the stream', !wall.streaming());
  ok('B shows B’s words', wall.texts().join(' ').includes('NVDA reports after the close'), wall.texts());
  ok('and not one character of A', !wall.texts().join(' ').includes('I am still writ'), wall.texts());

  // --- A's answer arrives AFTER the switch. It has nowhere to land.
  slow?.deliver('ing this out.');
  slow?.finish();
  ok('a late reply from A cannot appear in B',
    !wall.texts().join(' ').includes('ing this out'), wall.texts());
  ok('B’s transcript is untouched by it',
    !JSON.stringify(server.transcript(B)).includes('ing this out'));
  ok('and what A had already said stayed with A',
    JSON.stringify(server.transcript(A)).includes('I am still writ'));

  // --- a turn now goes to B and only B
  const turnB = wall.send('When exactly?');
  turnB?.deliver('Wednesday, after the bell.');
  turnB?.finish();
  ok('the new turn went to B', JSON.stringify(server.transcript(B)).includes('When exactly?'));
  ok('A never saw it', !JSON.stringify(server.transcript(A)).includes('When exactly?'));
}

head('Refresh, resume B, then start New — and nothing crosses');
{
  const server = makeServer();
  const A = server.create('spy');
  const B = server.create('nvda');
  server.record(B, 'user', 'What about NVDA earnings?');
  server.record(B, 'kai', 'NVDA reports Wednesday.');

  // "Refresh" is a fresh wall over the same server.
  const wall = makeWall(server, [{ kind: 'notice', id: 'seed', text: 'New conversation.' }]);
  wall.open({ kind: 'saved', id: B }).load?.apply();
  ok('B resumes with its history', wall.texts().join(' ').includes('NVDA reports Wednesday'), wall.texts());

  wall.open({ kind: 'new', nonce: 1 });
  ok('New shows no history at all', !wall.texts().join(' ').includes('NVDA reports Wednesday'), wall.texts());
  ok('New knows no conversation yet', wall.conversationId() === null);

  const fresh = wall.send('Start me somewhere.');
  ok('a turn in New has no conversation to send to until the server makes one',
    fresh !== null && wall.conversationId() === null);
  const made = server.create('fresh');
  ok('and it is a REAL conversation, not a relabelled old one',
    fresh?.bind(made) === true && wall.conversationId() === made && made !== A && made !== B);
  fresh?.deliver('Here is where I would start.');
  fresh?.finish();
  ok('the new conversation carries the turn', JSON.stringify(server.transcript(made)).includes('Start me somewhere.'));
  ok('B did not', !JSON.stringify(server.transcript(B)).includes('Start me somewhere.'));
  ok('A did not either', server.rows.get(A)?.turns.length === 0);
}

head('A conversation created after the member has moved on is dropped, not adopted');
{
  const server = makeServer();
  const wall = makeWall(server);
  const turn = wall.send('Ask into today');
  wall.open({ kind: 'new', nonce: 9 });
  const late = server.create('orphan');
  ok('the server’s answer to the old create is refused', turn?.bind(late) === false);
  ok('so the new thread did not silently inherit it', wall.conversationId() === null);
  turn?.deliver('an answer nobody asked for here');
  turn?.finish();
  ok('and its stream reaches no screen', !wall.texts().join(' ').includes('nobody asked'), wall.texts());
}

/* ==================================================================== */
/* 4. F05 — recovery and control                                        */
/* ==================================================================== */

head('A failed request keeps the member’s words');
{
  const server = makeServer();
  const wall = makeWall(server);
  const turn = wall.send('The question I do not want to type twice');
  turn?.finish('We couldn’t reach Kai. Check your connection and try again.');
  const f = wall.failed();
  ok('the failure is reported', !!f, f);
  ok('with the words intact', f?.text === 'The question I do not want to type twice', f);
  ok('and asks for them to be put back, because nothing streamed', f?.restore === true, f);
  ok('the half turn is not left sitting in the wall',
    !wall.texts().join(' ').includes('do not want to type twice'), wall.texts());
  ok('the wall is no longer streaming', !wall.streaming());
}

head('A failure that already produced words keeps them instead');
{
  const server = makeServer();
  const wall = makeWall(server);
  const turn = wall.send('Explain the range');
  turn?.deliver('It is the distance between');
  turn?.finish('The connection dropped.');
  const f = wall.failed();
  ok('retry is still offered', !!f, f);
  ok('but the composer is left alone', f?.restore === false, f);
  ok('and the partial answer stays on screen',
    wall.texts().join(' ').includes('It is the distance between'), wall.texts());
}

head('A failure belongs to the thread it happened in');
{
  const server = makeServer();
  const wall = makeWall(server);
  const turn = wall.send('Something that will fail');
  turn?.finish('Offline.');
  ok('retryable while you are still there', !!wall.failed());
  wall.open({ kind: 'new', nonce: 3 });
  ok('and gone the moment you are not', wall.failed() === null);

  const stray: FailedTurn = { generation: 41, text: 'x', plain: 'y', restore: true };
  ok('retryableTurn refuses a failure from another generation',
    retryableTurn(stray, 42) === null);
  ok('and returns it when the generation matches',
    retryableTurn(stray, 41) === stray);
}

head('Stop is a control the member has, and it is not an error');
{
  const server = makeServer();
  const wall = makeWall(server);
  const turn = wall.send('Write me something long');
  turn?.deliver('Starting to answer');
  wall.stop();
  turn?.finish();
  ok('streaming ends', !wall.streaming());
  ok('what had arrived stays', wall.texts().join(' ').includes('Starting to answer'), wall.texts());
  ok('the wall says it was stopped', wall.texts().includes('Stopped.'), wall.texts());
  ok('and a stop is not a failure to recover from', wall.failed() === null);
}

head('Suggested questions are questions, and never claims');
{
  const subjects = [
    suggestedQuestions({ kind: 'today' }),
    suggestedQuestions({ kind: 'new' }),
    suggestedQuestions({ kind: 'saved' }),
    suggestedQuestions({ kind: 'symbol', symbol: 'nvda' }),
    suggestedQuestions({ kind: 'setup', symbol: 'spy' }),
    suggestedQuestions({ kind: 'setup', symbol: null }),
  ];
  ok('three at most, everywhere', subjects.every((s) => s.length > 0 && s.length <= 3));
  ok('short enough to be a row of pills', subjects.every((s) => s.every((q) => q.length <= 34)),
    subjects.flat().filter((q) => q.length > 34));
  /*
    THE ONE THAT MATTERS. A suggestion is something the member could have
    typed. The moment one carries a number the app has invented a price and put
    it in their mouth — which is the house rule this repo enforces everywhere
    else with `no-fake-data-test`.
  */
  ok('and carry no numbers at all', subjects.every((s) => s.every((q) => !/\d/.test(q))),
    subjects.flat().filter((q) => /\d/.test(q)));
  ok('the symbol on screen is the one asked about',
    suggestedQuestions({ kind: 'symbol', symbol: 'nvda' }).every((q) => q.includes('NVDA') || !q.includes('nvda')));
}

/* ==================================================================== */
/* 5. The engine is one engine, and it is wired to the gate             */
/* ==================================================================== */

/**
 * Comments are stripped first. Half the argument for this lane is WRITTEN in
 * these files — "the `convoId` ref is gone", "this used to read Picking up" —
 * and a check that reads prose would fail on the explanation of its own fix.
 */
const code = (file: string): string => readFileSync(path.join(ROOT, file), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const useKaiSrc = code('src/lib/useKai.ts');
const composerSrc = code('src/ui/Composer.tsx');
const homeSrc = code('src/app/(tabs)/home.tsx');
const count = (src: string, needle: string) => src.split(needle).length - 1;

head('One Kai, not two that drifted apart');
{
  ok('there is exactly one stream reader', count(useKaiSrc, 'api.streamMessage(') === 1);
  ok('exactly one place a conversation is created', count(useKaiSrc, 'api.createConversation(') === 1);
  ok('exactly one abort controller', count(useKaiSrc, 'new AbortController()') === 1);
  ok('both entry points still exist for their callers',
    useKaiSrc.includes('export function useKaiWall(') && useKaiSrc.includes('export function useKaiThread('));
  ok('and both run on the shared engine', count(useKaiSrc, 'useKaiEngine({') === 2);
}

head('The wall cannot go back to owning its own conversation');
{
  ok('the `convoId` ref is gone', !useKaiSrc.includes('convoId'), 'convoId is back in useKai.ts');
  ok('the thread is an input', /useKaiWall\([\s\S]{0,200}target: ThreadTarget/.test(useKaiSrc));
  ok('switching goes through the binding', useKaiSrc.includes('binding.point('));
  ok('a late create is offered to the binding, not assigned',
    useKaiSrc.includes('binding.adopt(gen, created.id)'));
  ok('the stream targets the bound conversation',
    useKaiSrc.includes('binding.conversationId()') && useKaiSrc.includes('api.streamMessage(\n        conversationId,'));
  ok('and every write to the screen is behind the generation gate',
    count(useKaiSrc, 'owns()') >= 6 && useKaiSrc.includes('binding.owns(gen)'),
    count(useKaiSrc, 'owns()'));
  ok('the old unguarded setter is gone', !useKaiSrc.includes('setItems('));
}

head('Stop and retry are on screen, not just in the hook');
{
  ok('the composer can be a stop control', composerSrc.includes('composer-stop') && composerSrc.includes('onStop'));
  ok('and stays editable while Kai is talking',
    composerSrc.includes('editable={!disabled}') && !composerSrc.includes('editable={!disabled && !streaming}'));
  ok('it can be handed a failed turn’s words back', composerSrc.includes('draftNonce'));
  /**
   * The assertion is about the THIRD ARGUMENT, not about the call being exactly
   * three arguments long. It used to match `useKaiWall(mode, seed, target)`
   * literally, which went red the day Home started passing a fourth thing (the
   * workspace bridge) — while the fact under test, that the selected thread is
   * what the wall talks to, was still true. A test that fails on an unrelated
   * argument is a test that teaches people to edit tests.
   */
  ok('Home passes the selected thread to the wall', /useKaiWall\(\s*mode,\s*seed,\s*target\b/.test(homeSrc));
  ok('Home wires Stop to the composer', homeSrc.includes('onStop={stop}'));
  ok('Home offers a retry', homeSrc.includes('testID="kai-retry"'));
  ok('Home restores the failed words', homeSrc.includes("draft={failed?.restore ? failed.text : ''}"));
  ok('and takes them back when the retry sends them',
    homeSrc.includes('const sendAgain') && homeSrc.includes('onPress={sendAgain}'));
  ok('Home no longer seeds a saved thread with a sentence instead of its history',
    !homeSrc.includes('Picking up'));
}

console.log(failures ? `\n${failures} failed\n` : '\nall passed\n');
process.exit(failures ? 1 : 0);
