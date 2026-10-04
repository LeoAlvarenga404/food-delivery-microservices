import { left, right } from '@fd/domain';
import type { ServiceAccess } from '../../src/http/service-access.adapter.ts';

export const fakeServiceAccess: ServiceAccess = (authorization, audience) => {
  if (authorization === 'Bearer staff-token') return Promise.resolve(left({ status: 403 }));
  return Promise.resolve(
    authorization === 'Bearer consumer-token' ? right(`${audience}-token`) : left({ status: 401 }),
  );
};
