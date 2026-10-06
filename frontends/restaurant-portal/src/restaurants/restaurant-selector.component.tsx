import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import {
  listMemberships,
  problemOf,
  type Memberships,
  type RestaurantApi,
} from '../restaurant-api/restaurant-api.adapter.ts';
import { Alert } from './alert.component.tsx';

function MembershipList({ memberships }: { readonly memberships: Memberships }): ReactNode {
  if (memberships.memberships.length === 0) return <p>You have no restaurant yet.</p>;
  return (
    <ul aria-label="Your restaurants">
      {memberships.memberships.map(({ restaurantId, restaurantName }) => (
        <li key={restaurantId}>
          <Link to="/restaurants/$restaurantId" params={{ restaurantId }}>
            {restaurantName}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function RestaurantSelector({ api }: { readonly api: RestaurantApi }): ReactNode {
  const memberships = useQuery({ queryKey: ['memberships'], queryFn: () => listMemberships(api) });
  if (memberships.data === undefined) return <p>Loading your restaurants…</p>;
  return (
    <main>
      <h1>Your restaurants</h1>
      {'problem' in memberships.data ? (
        <Alert message={problemOf(memberships.data)} />
      ) : (
        <MembershipList memberships={memberships.data} />
      )}
      <Link to="/restaurants/new">Onboard a restaurant</Link>
    </main>
  );
}
