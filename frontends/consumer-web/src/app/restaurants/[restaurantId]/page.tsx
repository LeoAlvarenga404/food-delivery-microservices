import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { AddToCartButton } from '../../../cart/add-to-cart.component.tsx';
import { createConsumerApi, isUuid } from '../../../consumer-api/consumer-api.adapter.ts';
import { formatAmount } from '../../../consumer-api/consumer-api-view.message-mapper.ts';

async function readRestaurant(restaurantId: string) {
  if (!isUuid(restaurantId)) notFound();
  const { data: restaurant, response } = await createConsumerApi().GET(
    '/v1/restaurants/{restaurantId}',
    { params: { path: { restaurantId } } },
  );
  if (response.status === 404) notFound();
  if (restaurant === undefined) {
    throw new Error(`reading the restaurant answered ${String(response.status)}`);
  }
  return restaurant;
}

export default async function RestaurantPage({
  params,
}: {
  readonly params: Promise<{ readonly restaurantId: string }>;
}): Promise<ReactNode> {
  const restaurant = await readRestaurant((await params).restaurantId);
  const { restaurantId, name: restaurantName, currency } = restaurant;
  return (
    <main>
      <h1>{restaurantName}</h1>
      <p>
        {restaurant.category}, minimum order{' '}
        {formatAmount(restaurant.minimumOrderInCents, currency)}
      </p>
      <ul aria-label="Menu">
        {restaurant.menuItems
          .filter((menuItem) => menuItem.isAvailable)
          .map((menuItem) => (
            <li key={menuItem.menuItemId}>
              {menuItem.name} {formatAmount(menuItem.priceInCents, currency)}{' '}
              <AddToCartButton addition={{ ...menuItem, restaurantId, restaurantName, currency }} />
            </li>
          ))}
      </ul>
    </main>
  );
}
