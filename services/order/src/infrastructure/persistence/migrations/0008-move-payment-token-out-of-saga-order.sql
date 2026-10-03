update saga_instances
set state = case
  when step in ('VERIFYING_CONSUMER', 'CREATING_TICKET', 'AUTHORIZING_PAYMENT')
    then (state #- '{order,paymentToken}') || jsonb_build_object('paymentToken', state #> '{order,paymentToken}')
  else state #- '{order,paymentToken}'
end
where state #> '{order,paymentToken}' is not null;
