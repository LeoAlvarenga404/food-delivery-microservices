import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { Alert } from '../alert.component.tsx';
import {
  acceptTicket,
  markTicketReady,
  problemOf,
  startPreparingTicket,
  type Refusal,
  type RestaurantApi,
  type Ticket,
  type TicketAddress,
} from '../restaurant-api/restaurant-api.adapter.ts';
import { formatReadyBy } from './ticket-queue.message-mapper.ts';

type TicketStep = (api: RestaurantApi, address: TicketAddress) => Promise<Ticket | Refusal>;

interface TicketActionProps {
  readonly ticket: Ticket;
  readonly isPending: boolean;
  readonly onStep: (step: TicketStep) => void;
}

interface TicketCardProps {
  readonly api: RestaurantApi;
  readonly restaurantId: string;
  readonly ticket: Ticket;
}

function AcceptanceForm({ isPending, onStep }: Omit<TicketActionProps, 'ticket'>): ReactNode {
  const [preparationTimeText, setPreparationTimeText] = useState('10');
  const accept: TicketStep = (api, address) =>
    acceptTicket(api, address, Number(preparationTimeText));
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onStep(accept);
      }}
    >
      <label>
        Preparation time in minutes{' '}
        <input
          type="number"
          min={1}
          max={120}
          required
          value={preparationTimeText}
          onChange={(event) => {
            setPreparationTimeText(event.currentTarget.value);
          }}
        />
      </label>{' '}
      <button type="submit" disabled={isPending}>
        Accept
      </button>
    </form>
  );
}

function StepButton({
  label,
  step,
  isPending,
  onStep,
}: Omit<TicketActionProps, 'ticket'> & {
  readonly label: string;
  readonly step: TicketStep;
}): ReactNode {
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        onStep(step);
      }}
    >
      {label}
    </button>
  );
}

function TicketAction({ ticket, isPending, onStep }: TicketActionProps): ReactNode {
  switch (ticket.status) {
    case 'AWAITING_ACCEPTANCE':
      return <AcceptanceForm isPending={isPending} onStep={onStep} />;
    case 'ACCEPTED':
      return (
        <StepButton
          label="Start preparing"
          step={startPreparingTicket}
          isPending={isPending}
          onStep={onStep}
        />
      );
    case 'PREPARING':
      return (
        <StepButton
          label="Mark ready"
          step={markTicketReady}
          isPending={isPending}
          onStep={onStep}
        />
      );
    case 'READY_FOR_PICKUP':
      return <p>Waiting for the courier.</p>;
  }
}

export function TicketCard({ api, restaurantId, ticket }: TicketCardProps): ReactNode {
  const queryClient = useQueryClient();
  const address = { restaurantId, ticketId: ticket.ticketId };
  const advance = useMutation({
    mutationFn: (step: TicketStep) => step(api, address),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['tickets', restaurantId] }),
  });
  return (
    <article aria-label={`Order ${ticket.orderId}`}>
      <h3>Order {ticket.orderId}</h3>
      <ul>
        {ticket.lineItems.map(({ menuItemId, name, quantity }) => (
          <li key={menuItemId}>
            {quantity} x {name}
          </li>
        ))}
      </ul>
      {ticket.readyBy === undefined ? null : (
        <p>Ready by {formatReadyBy(ticket.readyBy, undefined)}</p>
      )}
      <TicketAction ticket={ticket} isPending={advance.isPending} onStep={advance.mutate} />
      <Alert message={problemOf(advance.data)} />
    </article>
  );
}
