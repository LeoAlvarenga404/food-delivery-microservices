alter table tickets
  drop constraint tickets_status_check,
  add constraint tickets_status_check check (status in ('CREATE_PENDING', 'AWAITING_ACCEPTANCE', 'REJECTED'));
