create table menu_items (
  restaurant_id uuid not null,
  menu_item_id uuid not null,
  name text not null,
  price_in_cents bigint not null check (price_in_cents > 0),
  currency text not null check (currency = 'BRL'),
  primary key (restaurant_id, menu_item_id)
);
