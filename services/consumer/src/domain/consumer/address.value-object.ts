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
const controlCharacterPattern = /\p{Cc}/u;
const addressFields: readonly (keyof Address)[] = ['street', 'number', 'city', 'postalCode'];

function isValidField(fieldText: string): boolean {
  return (
    fieldText.length > 0 &&
    fieldText.length <= maximumFieldLength &&
    !controlCharacterPattern.test(fieldText)
  );
}

export function parseAddress(rawAddress: Address): Either<InvalidAddress, Address> {
  const address: Address = {
    street: rawAddress.street.trim(),
    number: rawAddress.number.trim(),
    city: rawAddress.city.trim(),
    postalCode: rawAddress.postalCode.trim(),
  };
  const invalidField = addressFields.find((field) => !isValidField(address[field]));
  return invalidField === undefined
    ? right(address)
    : left({ type: 'InvalidAddress', field: invalidField });
}
