import { create } from '@bufbuild/protobuf';
import {
  GetRestaurantResponseSchema,
  ListMembershipsResponseSchema,
  MembershipRole as ContractMembershipRole,
  type GetRestaurantResponse,
  type ListMembershipsResponse,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import type { RestaurantMembership } from '#application/queries/list-memberships/list-memberships.query.ts';
import type {
  MembershipRole,
  RestaurantSnapshot,
} from '#domain/restaurant/restaurant.aggregate.ts';
import { toRestaurantContract } from '#infrastructure/messaging/outbound/restaurant-event.message-mapper.ts';

const contractMembershipRoles: Readonly<Record<MembershipRole, ContractMembershipRole>> = {
  OWNER: ContractMembershipRole.OWNER,
};

export function toGetRestaurantResponse(snapshot: RestaurantSnapshot): GetRestaurantResponse {
  return create(GetRestaurantResponseSchema, { restaurant: toRestaurantContract(snapshot) });
}

export function toListMembershipsResponse(
  memberships: readonly RestaurantMembership[],
): ListMembershipsResponse {
  return create(ListMembershipsResponseSchema, {
    memberships: memberships.map(({ restaurantId, restaurantName, role }) => ({
      restaurantId,
      restaurantName,
      role: contractMembershipRoles[role],
    })),
  });
}
