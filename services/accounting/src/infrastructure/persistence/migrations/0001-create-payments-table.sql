create table payments (
  payment_id uuid primary key,
  order_id uuid not null unique,
  consumer_id uuid not null,
  amount_in_cents bigint not null check (amount_in_cents > 0),
  currency text not null check (currency = 'BRL'),
  gateway_authorization_id text not null,
  status text not null check (status in ('AUTHORIZED')),
  authorized_at timestamptz not null,
  version integer not null check (version > 0)
);
