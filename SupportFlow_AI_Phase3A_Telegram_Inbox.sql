-- SupportFlow AI Phase 3A: Telegram inbox extension for EXISTING Phase 2 database.
-- Run ONCE in Supabase SQL Editor. No existing order/customer rows are removed.

create table if not exists public.telegram_conversations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  external_chat_id text not null,
  display_name text not null default 'Telegram user',
  username text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (business_id, external_chat_id),
  unique (business_id, id)
);
create index if not exists telegram_conversations_recent_idx
  on public.telegram_conversations(business_id, last_message_at desc);

create table if not exists public.telegram_messages (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  conversation_id uuid not null,
  direction text not null check (direction in ('inbound', 'outbound')),
  text text not null check (length(text) between 1 and 4096),
  telegram_message_id text,
  sent_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (business_id, conversation_id)
    references public.telegram_conversations(business_id, id) on delete cascade
);
create unique index if not exists telegram_messages_unique_external_idx
  on public.telegram_messages(business_id, conversation_id, telegram_message_id);
create index if not exists telegram_messages_recent_idx
  on public.telegram_messages(conversation_id, created_at, id);

alter table public.telegram_conversations enable row level security;
alter table public.telegram_messages enable row level security;

drop policy if exists telegram_conversations_member_read on public.telegram_conversations;
create policy telegram_conversations_member_read on public.telegram_conversations
  for select to authenticated using (
    exists (select 1 from public.business_members m
      where m.business_id = telegram_conversations.business_id
      and m.user_id = (select auth.uid()))
  );

drop policy if exists telegram_messages_member_read on public.telegram_messages;
create policy telegram_messages_member_read on public.telegram_messages
  for select to authenticated using (
    exists (select 1 from public.business_members m
      where m.business_id = telegram_messages.business_id
      and m.user_id = (select auth.uid()))
  );

revoke all on public.telegram_conversations, public.telegram_messages from anon, authenticated;
grant select on public.telegram_conversations, public.telegram_messages to authenticated;
-- Inserts and updates are performed by server-side API routes only.
-- Never expose the Supabase secret/service_role key in NEXT_PUBLIC_* variables.
