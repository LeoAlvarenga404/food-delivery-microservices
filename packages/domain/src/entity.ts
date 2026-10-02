export abstract class Entity<Identity> {
  protected readonly identity: Identity;

  protected constructor(identity: Identity) {
    this.identity = identity;
  }

  hasSameIdentityAs(other: Entity<Identity>): boolean {
    return this.identity === other.identity;
  }
}
