create table saga_instances (
  saga_id uuid primary key,
  saga_type text not null,
  order_id uuid not null,
  step text not null,
  state jsonb not null,
  status text not null check (status in ('RUNNING', 'COMPLETED')),
  deadline_at timestamptz,
  version integer not null check (version > 0)
);

create index saga_instances_order_id_index on saga_instances (order_id);
