alter table orders
  drop constraint orders_status_check,
  add constraint orders_status_check check (status in ('APPROVAL_PENDING', 'APPROVED', 'REJECTED')),
  add column rejected_at timestamptz,
  add column rejection_reason text check (
    rejection_reason in ('CONSUMER_NOT_FOUND', 'CONSUMER_BLOCKED', 'TICKET_REFUSED', 'PAYMENT_DECLINED')
  ),
  add constraint orders_rejection_check check (
    (status = 'REJECTED') = (rejected_at is not null)
    and (status = 'REJECTED') = (rejection_reason is not null)
  );
