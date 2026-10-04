-- Consumers register themselves since slice 2e: the slice 1 seed has no name, email or addresses.
delete from consumers where consumer_id = '0199a5d0-0000-7000-8000-0000000000c1';

alter table consumers
  add column name text not null check (char_length(name) between 1 and 100),
  add column email text not null check (char_length(email) between 3 and 254),
  add column addresses jsonb not null check (
    jsonb_typeof(addresses) = 'array' and jsonb_array_length(addresses) between 1 and 5
  );
