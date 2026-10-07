-- Payments authorized before slice 3c name no restaurant (the nil UUID) and no delivery fee.
alter table payments
  add column restaurant_id uuid not null default '00000000-0000-0000-0000-000000000000',
  add column delivery_fee_in_cents bigint not null default 0,
  add constraint payments_delivery_fee_check
    check (delivery_fee_in_cents >= 0 and delivery_fee_in_cents < amount_in_cents);

alter table payments
  alter column restaurant_id drop default,
  alter column delivery_fee_in_cents drop default;
