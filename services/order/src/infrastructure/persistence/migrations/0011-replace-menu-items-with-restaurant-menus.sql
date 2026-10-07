-- The slice 1 seed goes: menus now arrive as MenuRevised snapshots (roadmap 2g).
drop table menu_items;

-- One row per restaurant, so a placement always reads one consistent snapshot.
create table restaurant_menus (
  restaurant_id uuid primary key,
  version integer not null check (version > 0),
  time_zone text not null,
  opening_hours jsonb not null check (jsonb_typeof(opening_hours) = 'array'),
  minimum_order_in_cents bigint not null check (minimum_order_in_cents >= 0),
  menu_items jsonb not null check (jsonb_typeof(menu_items) = 'array')
);
