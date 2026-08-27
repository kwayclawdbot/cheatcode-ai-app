# `packages/shared`

Types and schemas shared by `apps/api` and `apps/mobile`. **No build step** —
plain `.ts`, consumed by relative import or a `tsconfig` path. There are no npm
workspaces in this repo (Expo + Metro hoisting): each app installs its own
dependencies, and anything declared here must also be installed by every app
that imports it.

## `db.types.ts` — generated, do not edit

Generated from the **local** database by the SCHEMA lane:

```bash
supabase gen types typescript --local > packages/shared/db.types.ts
```

Regenerate it after **any** migration in `supabase/migrations/`. Editing it by
hand guarantees it will disagree with the database on the next reset.

Usage:

```ts
import type { Database } from '../../packages/shared/db.types';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient<Database>(url, key);

type Setup   = Database['public']['Tables']['setups']['Row'];
type Profile = Database['public']['Tables']['profiles']['Row'];
type AppMode = Database['public']['Enums']['app_mode'];   // 'day_trade' | 'swing' | 'invest'
```

Views are under `Database['public']['Views']` — `profiles_public`,
`messages_public` (deleted bodies nulled) and `messages_moderation`
(service-role only).

## Zod schemas (`api.ts`)

The API lane owns `api.ts` — the request/response zod schemas for the
`/api/v1` bodies and the types derived from them. Keep hand-written schemas out
of `db.types.ts` so the generated file stays a clean artifact that can be
overwritten at any time.

## Where the schema is defined

`docs/01_DATA_MODEL.md` is canonical. `supabase/migrations/` implements it
verbatim; `docs/SCHEMA-NOTES.md` records every interpretation and every known
gap. Change the doc first, then the migration, then regenerate these types.
