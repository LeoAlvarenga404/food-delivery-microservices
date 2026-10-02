create table orders (
  order_id uuid primary key,
  consumer_id uuid not null,
  restaurant_id uuid not null,
  status text not null check (status in ('APPROVAL_PENDING', 'APPROVED')),
  total_in_cents bigint not null check (total_in_cents > 0),
  currency text not null check (currency = 'BRL'),
  delivery_street text not null,
  delivery_number text not null,
  delivery_city text not null,
  delivery_postal_code text not null,
  placed_at timestamptz not null,
  approved_at timestamptz,
  version integer not null check (version > 0)
);

create table order_line_items (
  order_id uuid not null references orders (order_id),
  line_number integer not null check (line_number > 0),
  menu_item_id uuid not null,
  name text not null,
  unit_price_in_cents bigint not null check (unit_price_in_cents > 0),
  quantity integer not null check (quantity > 0),
  primary key (order_id, line_number),
  unique (order_id, menu_item_id)
);
