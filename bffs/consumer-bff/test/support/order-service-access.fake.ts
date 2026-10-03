import { left, right } from '@fd/domain';
import type { OrderServiceAccess } from '../../src/http/order-service-access.adapter.ts';

export const fakeOrderServiceAccess: OrderServiceAccess = (authorization) => {
  if (authorization === 'Bearer staff-token') return Promise.resolve(left({ status: 403 }));
  return Promise.resolve(
    authorization === 'Bearer consumer-token'
      ? right('order-service-token')
      : left({ status: 401 }),
  );
};
