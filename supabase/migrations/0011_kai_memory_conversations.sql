-- 0011_kai_memory_conversations
-- Source: docs/01_DATA_MODEL.md §11.
-- Extraction policy: no balances, position sizes, or account numbers may be written to kai_user_memory.

create table market_memory (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('news','filing','internals','setup_outcome','kai_analysis','community_signal','weekly_synthesis')),
  as_of date not null, symbols text[], entities text[],
  summary text not null, source jsonb,
  embedding extensions.vector(1536), created_at timestamptz default now()
);
-- ⚙ ivfflat index on the embedding
create index market_memory_embedding_idx on market_memory
  using ivfflat (embedding extensions.vector_cosine_ops);
create index market_memory_symbols_idx on market_memory using gin (symbols);

create table kai_user_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  kind text not null check (kind in ('preference','pattern','mistake','goal','note')),
  content text not null, refs jsonb, embedding extensions.vector(1536),
  created_at timestamptz default now(), superseded_by uuid
);
create index kai_user_memory_user_idx on kai_user_memory (user_id, created_at desc);

create table conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles on delete cascade,
  mode app_mode, title text, context jsonb, created_at timestamptz default now(),
  updated_at timestamptz
);
create index conversations_user_idx on conversations (user_id, created_at desc);

create table conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations on delete cascade,
  seq int not null, role text not null check (role in ('user','kai')),
  content jsonb not null, created_at timestamptz default now(),
  unique (conversation_id, seq)
);
