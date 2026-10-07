import type { Selectable } from 'kysely';
import type { MenuItemId } from '#domain/restaurant/menu-item-id.value-object.ts';
import type { MenuItem } from '#domain/restaurant/menu-item.value-object.ts';
import type { OpeningPeriod } from '#domain/restaurant/opening-period.value-object.ts';
import type { RestaurantCategory } from '#domain/restaurant/restaurant-category.value-object.ts';
import type { RestaurantId } from '#domain/restaurant/restaurant-id.value-object.ts';
import type { RestaurantName } from '#domain/restaurant/restaurant-name.value-object.ts';
import {
  Restaurant,
  type MembershipRole,
  type RestaurantMember,
} from '#domain/restaurant/restaurant.aggregate.ts';
import type { StaffMemberId } from '#domain/restaurant/staff-member-id.value-object.ts';
import type { TimeZone } from '#domain/restaurant/time-zone.value-object.ts';
import type { MenuItems, RestaurantMembers, Restaurants } from './generated/database.ts';

export type RestaurantRow = Selectable<Restaurants>;
export type RestaurantMemberRow = Selectable<RestaurantMembers>;
export type MenuItemRow = Selectable<MenuItems>;

export interface RestaurantRows {
  readonly restaurant: RestaurantRow;
  readonly members: readonly RestaurantMemberRow[];
  readonly menuItems: readonly MenuItemRow[];
}

function toMember(row: RestaurantMemberRow): RestaurantMember {
  return { staffMemberId: row.staffMemberId as StaffMemberId, role: row.role as MembershipRole };
}

function toMenuItem(row: MenuItemRow): MenuItem {
  return {
    menuItemId: row.menuItemId as MenuItemId,
    name: row.name,
    priceInCents: row.priceInCents,
    isAvailable: row.isAvailable,
  };
}

function toRestaurantRow(restaurant: Restaurant): RestaurantRow {
  const { address, openingHours, ...snapshot } = restaurant.toSnapshot();
  return {
    restaurantId: snapshot.restaurantId,
    name: snapshot.name,
    category: snapshot.category,
    street: address.street,
    number: address.number,
    city: address.city,
    postalCode: address.postalCode,
    latitude: address.location.latitude,
    longitude: address.location.longitude,
    timeZone: snapshot.timeZone,
    openingHours: openingHours.map(({ dayOfWeek, opensAt, closesAt }) => ({
      dayOfWeek,
      opensAt,
      closesAt,
    })),
    minimumOrderInCents: snapshot.minimumOrderInCents,
    version: snapshot.version,
  };
}

export const restaurantPersistenceMapper = {
  toDomain(rows: RestaurantRows): Restaurant {
    const { restaurant } = rows;
    return Restaurant.restore({
      restaurantId: restaurant.restaurantId as RestaurantId,
      name: restaurant.name as RestaurantName,
      category: restaurant.category as RestaurantCategory,
      address: {
        street: restaurant.street,
        number: restaurant.number,
        city: restaurant.city,
        postalCode: restaurant.postalCode,
        location: { latitude: restaurant.latitude, longitude: restaurant.longitude },
      },
      timeZone: restaurant.timeZone as TimeZone,
      openingHours: restaurant.openingHours as unknown as readonly OpeningPeriod[],
      minimumOrderInCents: restaurant.minimumOrderInCents,
      menuItems: rows.menuItems.map(toMenuItem),
      members: rows.members.map(toMember),
      version: restaurant.version,
    });
  },

  toPersistence(restaurant: Restaurant): RestaurantRows {
    const { restaurantId, menuItems, members } = restaurant.toSnapshot();
    return {
      restaurant: toRestaurantRow(restaurant),
      members: members.map((member) => ({ restaurantId, ...member })),
      menuItems: menuItems.map((menuItem, index) => ({
        restaurantId,
        position: index + 1,
        ...menuItem,
      })),
    };
  },
};
