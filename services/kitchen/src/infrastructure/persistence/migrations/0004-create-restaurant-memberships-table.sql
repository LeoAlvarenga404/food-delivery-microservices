-- The members of each restaurant, replicated from its MenuRevised snapshots (roadmap 3a Q1, ADR-0015).
-- One row per restaurant, applied only when newer (design 4.5 and 6.6: the version guard, no inbox).
create table restaurant_memberships (
  restaurant_id uuid primary key,
  version integer not null check (version > 0),
  staff_member_ids jsonb not null check (jsonb_typeof(staff_member_ids) = 'array')
);
