update saga_instances set deadline_at = now() where status = 'RUNNING' and deadline_at is null;

alter table saga_instances
  add constraint saga_instances_deadline_check check ((status = 'RUNNING') = (deadline_at is not null));

create index saga_instances_deadline_at_index on saga_instances (deadline_at)
  where deadline_at is not null;
