alter table orders
  drop constraint orders_rejection_reason_check,
  add constraint orders_rejection_reason_check check (
    rejection_reason in (
      'CONSUMER_NOT_FOUND',
      'CONSUMER_BLOCKED',
      'TICKET_REFUSED',
      'PAYMENT_DECLINED',
      'CONSUMER_VERIFICATION_TIMED_OUT',
      'TICKET_CREATION_TIMED_OUT',
      'PAYMENT_AUTHORIZATION_TIMED_OUT'
    )
  );
