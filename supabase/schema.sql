-- Run this once in the Supabase SQL editor.
create table if not exists public.leads (
  id uuid primary key,
  created_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  category text not null,
  category_other text,
  company_name text not null,
  city text not null,
  services text not null,
  employees text not null,
  departments text[] not null default '{}',
  departments_other text,
  intent text not null check (intent in ('known', 'discover')),
  tasks text[] not null default '{}',
  automate_notes text,
  tools text,
  contact_name text not null,
  contact_email text not null,
  contact_role text,
  contact_phone text,
  agent_key text not null,
  source text,
  approved_at timestamptz,
  trial_sent_at timestamptz
);

create index if not exists leads_status_created_idx on public.leads (status, created_at desc);

-- Row level security on with no policies: the public anon key can read and write
-- nothing. Only the server-side service role key can reach this table.
alter table public.leads enable row level security;

-- Agent trials. Same rule as leads: row level security on with no policies, so only
-- the server-side service role key can reach these tables.
create table if not exists public.agent_workspaces (
  id uuid primary key,
  lead_id uuid not null unique references public.leads (id),
  agent_key text not null,
  profile jsonb not null,
  budget_units bigint not null,
  used_units bigint not null default 0,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.agent_sessions (
  id uuid primary key,
  workspace_id uuid not null references public.agent_workspaces (id),
  title text not null,
  started_by text not null,
  last_input_tokens integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_sessions_recent_idx on public.agent_sessions (workspace_id, updated_at desc);

create table if not exists public.agent_messages (
  id uuid primary key,
  session_id uuid not null references public.agent_sessions (id),
  workspace_id uuid not null references public.agent_workspaces (id),
  seq integer not null,
  role text not null check (role in ('user', 'assistant')),
  content json not null, -- Plain json, not jsonb: jsonb reorders keys, and this is replayed exactly as the API returned it. Never edit it.
  author text,
  text text, -- Plain readable text, used for the transcript and search. Empty for tool steps.
  created_at timestamptz not null default now(),
  unique (session_id, seq)
);
create index if not exists agent_messages_workspace_idx on public.agent_messages (workspace_id);

create table if not exists public.agent_memories (
  id uuid primary key,
  workspace_id uuid not null references public.agent_workspaces (id),
  title text not null,
  content text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, title)
);

alter table public.agent_workspaces enable row level security;
alter table public.agent_sessions enable row level security;
alter table public.agent_messages enable row level security;
alter table public.agent_memories enable row level security;
