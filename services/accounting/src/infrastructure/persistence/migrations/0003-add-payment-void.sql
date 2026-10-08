-- A payment voids its authorization once: the void time and the gateway reference come together.
alter table payments drop constraint payments_status_check;

alter table payments
  add constraint payments_status_check check (status in ('AUTHORIZED', 'VOIDED')),
  add column voided_at timestamptz,
  add column gateway_void_id text,
  add constraint payments_void_check check (
    (status = 'VOIDED') = (voided_at is not null)
    and (voided_at is null) = (gateway_void_id is null)
  );
