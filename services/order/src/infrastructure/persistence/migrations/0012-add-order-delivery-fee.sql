-- Orders placed before the delivery fee (roadmap 3c, Q6) were charged their items only.
alter table orders
  add column delivery_fee_in_cents bigint not null default 0
    check (delivery_fee_in_cents >= 0);

alter table orders alter column delivery_fee_in_cents drop default;
