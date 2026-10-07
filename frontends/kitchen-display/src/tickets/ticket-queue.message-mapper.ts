import type { Ticket } from '../restaurant-api/restaurant-api.adapter.ts';

export interface TicketGroup {
  readonly status: Ticket['status'];
  readonly heading: string;
  readonly tickets: readonly Ticket[];
}

const kitchenSteps: readonly Omit<TicketGroup, 'tickets'>[] = [
  { status: 'AWAITING_ACCEPTANCE', heading: 'Awaiting acceptance' },
  { status: 'ACCEPTED', heading: 'Accepted' },
  { status: 'PREPARING', heading: 'Preparing' },
  { status: 'READY_FOR_PICKUP', heading: 'Ready for pickup' },
];

export function groupTicketsByStatus(tickets: readonly Ticket[]): readonly TicketGroup[] {
  return kitchenSteps.map((step) => ({
    ...step,
    tickets: tickets.filter((ticket) => ticket.status === step.status),
  }));
}

export function formatReadyBy(readyBy: string, timeZone: string | undefined): string {
  const timeFormat = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  });
  return timeFormat.format(new Date(readyBy));
}
