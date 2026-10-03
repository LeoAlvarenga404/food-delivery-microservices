create table inbox (
  message_id uuid not null,
  handler_name text not null,
  processed_at timestamptz not null,
  primary key (message_id, handler_name)
);

create index inbox_processed_at_index on inbox (processed_at);
