-- Slice 3a: the kitchen accepts, prepares and readies a ticket (design 4.2); consumer_id lets the
-- consumer read their own ticket (roadmap Q11). Tickets created before keep the nil uuid, no consumer's id.
alter table tickets
  drop constraint tickets_status_check,
  add constraint tickets_status_check check (
    status in ('CREATE_PENDING', 'AWAITING_ACCEPTANCE', 'REJECTED', 'ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP')
  ),
  add column consumer_id uuid not null default '00000000-0000-0000-0000-000000000000',
  add column accepted_at timestamptz,
  add column ready_by timestamptz,
  add constraint tickets_acceptance_check check (
    (accepted_at is null) = (ready_by is null)
    and (accepted_at is null) = (status in ('CREATE_PENDING', 'AWAITING_ACCEPTANCE', 'REJECTED'))
  );

alter table tickets alter column consumer_id drop default;

create index tickets_restaurant_id_status_index on tickets (restaurant_id, status);
