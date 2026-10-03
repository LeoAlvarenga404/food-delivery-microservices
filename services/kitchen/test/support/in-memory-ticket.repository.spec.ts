import { InMemoryTicketRepository } from './in-memory-ticket.repository.ts';
import { describeTicketRepositoryContract } from './ticket-repository.contract.ts';

describeTicketRepositoryContract('in-memory', () => new InMemoryTicketRepository());
