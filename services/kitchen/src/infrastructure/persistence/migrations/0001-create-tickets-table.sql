create table tickets (
  ticket_id uuid primary key,
  order_id uuid not null unique,
  restaurant_id uuid not null,
  line_items jsonb not null check (jsonb_typeof(line_items) = 'array' and jsonb_array_length(line_items) > 0),
  status text not null check (status in ('CREATE_PENDING', 'AWAITING_ACCEPTANCE')),
  version integer not null check (version > 0)
);
