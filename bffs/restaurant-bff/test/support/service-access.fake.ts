import { left, right } from '@fd/domain';
import type { ServiceAccess } from '../../src/http/service-access.adapter.ts';

export const fakeServiceAccess: ServiceAccess = (authorization, audience) => {
  if (authorization === 'Bearer consumer-token') return Promise.resolve(left({ status: 403 }));
  return Promise.resolve(
    authorization === 'Bearer staff-token' ? right(`${audience}-token`) : left({ status: 401 }),
  );
};
