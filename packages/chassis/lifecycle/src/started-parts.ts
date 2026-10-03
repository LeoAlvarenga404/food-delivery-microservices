import { stopInOrder, type Stopper } from './stop-in-order.ts';

export class StartedParts {
  readonly #stoppers: Stopper[] = [];

  add(stop: Stopper): void {
    this.#stoppers.unshift(stop);
  }

  stopAll(): Promise<void> {
    return stopInOrder(this.#stoppers);
  }
}
