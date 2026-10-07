create table restaurants (
  restaurant_id uuid primary key,
  name text not null check (char_length(name) between 1 and 100),
  category text not null check (char_length(category) between 1 and 50),
  street text not null,
  number text not null,
  city text not null,
  postal_code text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  time_zone text not null,
  opening_hours jsonb not null check (
    jsonb_typeof(opening_hours) = 'array' and jsonb_array_length(opening_hours) between 1 and 21
  ),
  minimum_order_in_cents bigint not null check (minimum_order_in_cents between 0 and 10000000),
  version integer not null check (version > 0)
);

-- Restaurant owns staff membership (roadmap Q7): the owner is recorded at onboarding.
create table restaurant_members (
  restaurant_id uuid not null references restaurants (restaurant_id),
  staff_member_id uuid not null,
  role text not null check (role in ('OWNER')),
  primary key (restaurant_id, staff_member_id)
);

create index restaurant_members_staff_member_id_index on restaurant_members (staff_member_id);

create table menu_items (
  restaurant_id uuid not null references restaurants (restaurant_id),
  menu_item_id uuid not null,
  position integer not null check (position > 0),
  name text not null check (char_length(name) between 1 and 100),
  price_in_cents bigint not null check (price_in_cents between 1 and 10000000),
  is_available boolean not null,
  primary key (restaurant_id, menu_item_id),
  unique (restaurant_id, position)
);
