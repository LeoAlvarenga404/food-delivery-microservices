import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createConsumerApi, isUuid } from '../../../consumer-api/consumer-api.adapter.ts';
import {
  describeRejectionReason,
  formatAmount,
} from '../../../consumer-api/consumer-api-view.message-mapper.ts';
import { redirectToSignIn, requireAccessToken } from '../../../session/session-cookie.adapter.ts';

const refreshIntervalInSeconds = 1;

async function readOrder(orderId: string) {
  const accessToken = await requireAccessToken(`/orders/${orderId}`);
  if (!isUuid(orderId)) notFound();
  const { data: order, response } = await createConsumerApi(accessToken).GET(
    '/v1/orders/{orderId}',
    { params: { path: { orderId } } },
  );
  if (response.status === 401) redirectToSignIn(`/orders/${orderId}`);
  if (response.status === 404) notFound();
  if (order === undefined) throw new Error(`reading the order answered ${String(response.status)}`);
  return order;
}

export default async function OrderPage({
  params,
}: {
  readonly params: Promise<{ readonly orderId: string }>;
}): Promise<ReactNode> {
  const order = await readOrder((await params).orderId);
  const isPending = order.status === 'APPROVAL_PENDING';
  return (
    <main>
      {isPending ? <meta httpEquiv="refresh" content={String(refreshIntervalInSeconds)} /> : null}
      <h1>Your order</h1>
      <p>
        Status: <strong>{order.status}</strong>
      </p>
      {order.rejectionReason === undefined ? null : (
        <p role="alert">{describeRejectionReason(order.rejectionReason)}</p>
      )}
      <ul>
        {order.lineItems.map((line) => (
          <li key={line.menuItemId}>
            {line.quantity} x {line.name} {formatAmount(line.unitPriceInCents, order.currency)}
          </li>
        ))}
      </ul>
      <p>Total {formatAmount(order.totalInCents, order.currency)}</p>
    </main>
  );
}
