create table consumers (
  consumer_id uuid primary key,
  status text not null check (status in ('ACTIVE', 'BLOCKED')),
  version integer not null check (version > 0)
);
