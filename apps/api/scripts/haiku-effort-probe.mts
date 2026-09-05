import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
const c = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
for (const model of ['claude-haiku-4-5', 'claude-sonnet-5']) {
  for (const withEffort of [true, false]) {
    try {
      const r = await c.messages.create({
        model, max_tokens: 16,
        ...(withEffort ? { output_config: { effort: 'low' as const } } : null),
        messages: [{ role: 'user', content: 'Say OK.' }],
      });
      console.log(model, 'effort=' + withEffort, 'OK', JSON.stringify(r.usage));
    } catch (e: any) {
      console.log(model, 'effort=' + withEffort, 'FAILED', e?.status, e?.message?.slice(0, 300));
    }
  }
}
