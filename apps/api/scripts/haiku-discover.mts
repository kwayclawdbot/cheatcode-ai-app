import 'dotenv/config';
import { serviceClient } from '../src/lib/db.ts';
const db = serviceClient();

// owner
const { data: users } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
const owner = users.users.find((u) => u.email === 'kcoffie90@gmail.com');
console.log('OWNER', owner?.id, owner?.email);

if (owner) {
  const { data: prof } = await db.from('profiles').select('*').eq('user_id', owner.id).maybeSingle();
  console.log('PROFILE', JSON.stringify(prof));
  const { data: rp } = await db.from('risk_policies').select('*').eq('user_id', owner.id).maybeSingle();
  console.log('RISK', JSON.stringify(rp));
  const { data: acct } = await db.from('accounts').select('*').eq('user_id', owner.id).maybeSingle();
  console.log('ACCOUNT', JSON.stringify(acct));
  const { data: convs } = await db.from('conversations').select('id,mode,context,created_at').eq('user_id', owner.id).order('created_at', { ascending: false }).limit(10);
  console.log('CONVS', JSON.stringify(convs, null, 1));
}

const { data: setups } = await db
  .from('setups')
  .select('id,symbol,mode,intent,state,grade_display,grade_band,score,entry_condition,stop,targets,valid_until,created_at')
  .order('created_at', { ascending: false })
  .limit(30);
console.log('RECENT SETUPS');
for (const s of setups ?? []) console.log(' ', (s as any).symbol, (s as any).mode, (s as any).state, (s as any).grade_display, (s as any).created_at);

for (const sym of ['SPY','AAPL','NVDA','SLB','VRNS','GTLB','DELL','SNOW','CNH']) {
  const { data } = await db.from('setups').select('symbol,mode,grade_display,state,stop,targets').eq('symbol', sym);
  console.log('SETUP?', sym, JSON.stringify(data));
}
