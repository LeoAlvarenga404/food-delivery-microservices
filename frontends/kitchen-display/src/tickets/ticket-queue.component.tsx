import { useQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { z } from 'zod';
import { Alert } from '../alert.component.tsx';
import {
  listTickets,
  problemOf,
  type RestaurantApi,
} from '../restaurant-api/restaurant-api.adapter.ts';
import { TicketCard } from './ticket-card.component.tsx';
import { groupTicketsByStatus, type TicketGroup } from './ticket-queue.message-mapper.ts';

interface TicketQueueProps {
  readonly api: RestaurantApi;
  readonly restaurantId: string;
}

const refreshIntervalInMilliseconds = 2_000;
const restaurantParametersSchema = z.object({ restaurantId: z.uuid() });

function TicketSection({
  api,
  restaurantId,
  group,
}: TicketQueueProps & { readonly group: TicketGroup }): ReactNode {
  const headingId = `tickets-${group.status}`;
  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>{group.heading}</h2>
      {group.tickets.length === 0 ? <p>No tickets.</p> : null}
      {group.tickets.map((ticket) => (
        <TicketCard key={ticket.ticketId} api={api} restaurantId={restaurantId} ticket={ticket} />
      ))}
    </section>
  );
}

function TicketQueue({ api, restaurantId }: TicketQueueProps): ReactNode {
  const tickets = useQuery({
    queryKey: ['tickets', restaurantId],
    queryFn: () => listTickets(api, restaurantId),
    refetchInterval: refreshIntervalInMilliseconds,
  });
  if (tickets.data === undefined) return <p>Loading the tickets…</p>;
  if ('problem' in tickets.data) return <Alert message={problemOf(tickets.data)} />;
  return (
    <main>
      <h1>Kitchen queue</h1>
      {groupTicketsByStatus(tickets.data.tickets).map((group) => (
        <TicketSection key={group.status} api={api} restaurantId={restaurantId} group={group} />
      ))}
    </main>
  );
}

export function TicketQueuePage({ api }: { readonly api: RestaurantApi }): ReactNode {
  const parameters = restaurantParametersSchema.safeParse(useParams({ strict: false }));
  if (!parameters.success) return <Alert message="This restaurant does not exist." />;
  return <TicketQueue api={api} restaurantId={parameters.data.restaurantId} />;
}
