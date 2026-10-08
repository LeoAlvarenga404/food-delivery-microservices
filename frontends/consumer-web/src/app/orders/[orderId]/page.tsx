import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { createConsumerApi, isUuid } from '../../../consumer-api/consumer-api.adapter.ts';
import {
  describeProblem,
  describeRejectionReason,
  formatAmount,
} from '../../../consumer-api/consumer-api-view.message-mapper.ts';
import { redirectToSignIn, requireAccessToken } from '../../../session/session-cookie.adapter.ts';

const refreshIntervalInSeconds = 1;
const busyStatuses = new Set([503, 504]);

async function readOrder(orderId: string) {
  const accessToken = await requireAccessToken(`/orders/${orderId}`);
  if (!isUuid(orderId)) notFound();
  const { data: order, response } = await createConsumerApi(accessToken).GET(
    '/v1/orders/{orderId}',
    { params: { path: { orderId } } },
  );
  if (response.status === 401) redirectToSignIn(`/orders/${orderId}`);
  if (response.status === 404) notFound();
  if (order !== undefined) return order;
  if (!busyStatuses.has(response.status)) {
    throw new Error(`reading the order answered ${String(response.status)}`);
  }
  return { problem: describeProblem(response.status, undefined) };
}

function Reload({ isPending }: { readonly isPending: boolean }): ReactNode {
  return isPending ? <meta httpEquiv="refresh" content={String(refreshIntervalInSeconds)} /> : null;
}

function BusyOrder({ problem }: { readonly problem: string }): ReactNode {
  return (
    <main>
      <Reload isPending />
      <p role="alert">{problem}</p>
    </main>
  );
}

export default async function OrderPage({
  params,
}: {
  readonly params: Promise<{ readonly orderId: string }>;
}): Promise<ReactNode> {
  const order = await readOrder((await params).orderId);
  if ('problem' in order) return <BusyOrder problem={order.problem} />;
  return (
    <main>
      <Reload isPending={order.status === 'APPROVAL_PENDING'} />
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
      <p>Delivery fee {formatAmount(order.deliveryFeeInCents, order.currency)}</p>
      <p>Total {formatAmount(order.totalInCents, order.currency)}</p>
    </main>
  );
}
