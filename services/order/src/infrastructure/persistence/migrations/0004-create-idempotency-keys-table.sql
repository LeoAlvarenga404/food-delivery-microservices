create table idempotency_keys (
  consumer_id uuid not null,
  idempotency_key text not null,
  request_hash text not null,
  order_id uuid not null,
  created_at timestamptz not null,
  primary key (consumer_id, idempotency_key)
);

create index idempotency_keys_created_at_index on idempotency_keys (created_at);
