create table if not exists public.amyfx_live_quotes (
  symbol text primary key,
  price double precision not null check (price > 0),
  provider_timestamp bigint not null check (provider_timestamp > 0),
  captured_at timestamptz not null,
  source text not null,
  updated_at timestamptz not null default now()
);

alter table public.amyfx_live_quotes enable row level security;
revoke all on table public.amyfx_live_quotes from anon, authenticated;
grant select, insert, update, delete on table public.amyfx_live_quotes to service_role;

create index if not exists amyfx_live_quotes_captured_at_idx
  on public.amyfx_live_quotes (captured_at desc);

comment on table public.amyfx_live_quotes is
  'Last sanitized Twelve Data WebSocket tick used by Amy FX PWA; service-role only.';
