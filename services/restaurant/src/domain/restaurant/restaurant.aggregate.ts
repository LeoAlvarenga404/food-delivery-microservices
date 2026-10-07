import { AggregateRoot, left, right, type Either } from '@fd/domain';
import type { MenuItem } from './menu-item.value-object.ts';
import type { MenuRevised } from './menu-revised.event.ts';
import { emptyMenu, type Menu } from './menu.value-object.ts';
import type { RestaurantId } from './restaurant-id.value-object.ts';
import {
  parseRestaurantProfile,
  type InvalidRestaurantProfile,
  type RawRestaurantProfile,
  type RestaurantProfile,
} from './restaurant-profile.value-object.ts';
import type { NotRestaurantMember } from './restaurant.errors.ts';
import type { StaffMemberId } from './staff-member-id.value-object.ts';

export type RestaurantEvent = MenuRevised;

export type MembershipRole = 'OWNER';

export interface RestaurantMember {
  readonly staffMemberId: StaffMemberId;
  readonly role: MembershipRole;
}

export interface RestaurantSnapshot extends RestaurantProfile {
  readonly restaurantId: RestaurantId;
  readonly menuItems: readonly MenuItem[];
  readonly members: readonly RestaurantMember[];
  readonly version: number;
}

export interface OnboardRestaurantInput {
  readonly restaurantId: RestaurantId;
  readonly owner: StaffMemberId;
  readonly profile: RawRestaurantProfile;
  readonly onboardedAt: Date;
}

export class Restaurant extends AggregateRoot<RestaurantEvent> {
  readonly #restaurantId: RestaurantId;
  readonly #profile: RestaurantProfile;
  readonly #members: readonly RestaurantMember[];
  readonly #version: number;
  #menuItems: readonly MenuItem[];

  private constructor(snapshot: RestaurantSnapshot) {
    super();
    const { restaurantId, menuItems, members, version, ...profile } = snapshot;
    this.#restaurantId = restaurantId;
    this.#profile = profile;
    this.#menuItems = menuItems;
    this.#members = members;
    this.#version = version;
  }

  static onboard(input: OnboardRestaurantInput): Either<InvalidRestaurantProfile, Restaurant> {
    const profile = parseRestaurantProfile(input.profile);
    if (profile.isLeft()) return profile;
    const restaurant = new Restaurant({
      restaurantId: input.restaurantId,
      ...profile.success,
      menuItems: emptyMenu,
      members: [{ staffMemberId: input.owner, role: 'OWNER' }],
      version: 0,
    });
    restaurant.#recordMenuRevision(input.onboardedAt);
    return right(restaurant);
  }

  static restore(snapshot: RestaurantSnapshot): Restaurant {
    return new Restaurant(snapshot);
  }

  verifyMember(staffMemberId: StaffMemberId): Either<NotRestaurantMember, undefined> {
    if (this.#members.some((member) => member.staffMemberId === staffMemberId)) {
      return right(undefined);
    }
    return left({ type: 'NotRestaurantMember', restaurantId: this.#restaurantId, staffMemberId });
  }

  reviseMenu(
    staffMemberId: StaffMemberId,
    menu: Menu,
    revisedAt: Date,
  ): Either<NotRestaurantMember, undefined> {
    const membership = this.verifyMember(staffMemberId);
    if (membership.isLeft()) return membership;
    this.#menuItems = menu;
    this.#recordMenuRevision(revisedAt);
    return right(undefined);
  }

  toSnapshot(): RestaurantSnapshot {
    return {
      restaurantId: this.#restaurantId,
      ...this.#profile,
      menuItems: this.#menuItems,
      members: this.#members,
      version: this.#version,
    };
  }

  #recordMenuRevision(occurredAt: Date): void {
    this.recordEvent({
      eventType: 'MenuRevised',
      occurredAt,
      restaurantId: this.#restaurantId,
      ...this.#profile,
      menuItems: this.#menuItems,
      staffMemberIds: this.#members.map(({ staffMemberId }) => staffMemberId),
      version: this.#version + 1,
    });
  }
}
