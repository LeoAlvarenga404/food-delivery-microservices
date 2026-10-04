import { left, right, type Either } from '@fd/domain';

export interface Address {
  readonly street: string;
  readonly number: string;
  readonly city: string;
  readonly postalCode: string;
}

export interface InvalidAddress {
  readonly type: 'InvalidAddress';
  readonly field: keyof Address;
}

const maximumFieldLength = 100;
const addressFields: readonly (keyof Address)[] = ['street', 'number', 'city', 'postalCode'];

export function parseAddress(rawAddress: Address): Either<InvalidAddress, Address> {
  const address: Address = {
    street: rawAddress.street.trim(),
    number: rawAddress.number.trim(),
    city: rawAddress.city.trim(),
    postalCode: rawAddress.postalCode.trim(),
  };
  const invalidField = addressFields.find(
    (field) => address[field].length === 0 || address[field].length > maximumFieldLength,
  );
  return invalidField === undefined
    ? right(address)
    : left({ type: 'InvalidAddress', field: invalidField });
}
