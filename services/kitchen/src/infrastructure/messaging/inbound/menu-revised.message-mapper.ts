import { fromBinary } from '@bufbuild/protobuf';
import { PermanentMessageFailure, type InboundMessage } from '@fd/chassis-kafka';
import {
  MenuRevisedSchema,
  type MenuRevised,
} from '@fd/contracts/fooddelivery/restaurant/v1/events_pb.js';
import type { ApplyMembershipRevisionCommand } from '#application/commands/apply-membership-revision/apply-membership-revision.command.ts';
import {
  parseStaffMemberId,
  type StaffMemberId,
} from '#domain/membership/staff-member-id.value-object.ts';
import { parseRestaurantId, type RestaurantId } from '#domain/ticket/restaurant-id.value-object.ts';

function decode(message: InboundMessage): MenuRevised {
  const { messageType } = message.headers;
  if (messageType !== MenuRevisedSchema.typeName) {
    throw new PermanentMessageFailure(`unknown restaurant state message ${messageType}`);
  }
  try {
    return fromBinary(MenuRevisedSchema, message.payload);
  } catch (error) {
    throw new PermanentMessageFailure(`payload is not a valid ${MenuRevisedSchema.typeName}`, {
      cause: error,
    });
  }
}

function requireRestaurantId(rawRestaurantId: string): RestaurantId {
  const restaurantId = parseRestaurantId(rawRestaurantId);
  if (restaurantId.isLeft()) throw new PermanentMessageFailure('MenuRevised without a restaurant');
  return restaurantId.success;
}

function requireStaffMemberId(rawStaffMemberId: string): StaffMemberId {
  const staffMemberId = parseStaffMemberId(rawStaffMemberId);
  if (staffMemberId.isLeft()) {
    throw new PermanentMessageFailure('MenuRevised with a member who is not a staff member id');
  }
  return staffMemberId.success;
}

export function toApplyMembershipRevisionCommand(
  message: InboundMessage,
): ApplyMembershipRevisionCommand {
  const { restaurant, members } = decode(message);
  const restaurantId = requireRestaurantId(restaurant?.restaurantId ?? '');
  const version = restaurant?.version ?? 0;
  if (version <= 0) throw new PermanentMessageFailure('MenuRevised without a positive version');
  return {
    membership: {
      restaurantId,
      version,
      staffMemberIds: members.map(({ staffMemberId }) => requireStaffMemberId(staffMemberId)),
    },
  };
}
