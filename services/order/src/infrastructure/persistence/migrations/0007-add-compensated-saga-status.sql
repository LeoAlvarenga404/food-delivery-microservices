alter table saga_instances
  drop constraint saga_instances_status_check,
  add constraint saga_instances_status_check check (status in ('RUNNING', 'COMPLETED', 'COMPENSATED'));
