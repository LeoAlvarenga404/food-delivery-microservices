create table outbox (
  id uuid primary key,
  topic text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  message_type text not null,
  payload bytea not null,
  correlation_id uuid not null,
  causation_id uuid,
  saga_id uuid,
  traceparent text,
  actor_id text,
  actor_type text,
  occurred_at timestamptz not null
);

create publication outbox_publication for table outbox;
