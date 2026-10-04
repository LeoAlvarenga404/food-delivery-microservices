import type { MessageInitShape } from '@bufbuild/protobuf';
import { Code, ConnectError, type HandlerContext, type ServiceImpl } from '@connectrpc/connect';
import { ConcurrencyConflictError } from '@fd/chassis-postgres';
import { correlationIdKey, principalOf } from '@fd/chassis-rpc';
import {
  OnboardRestaurantFailureSchema,
  ReviseMenuFailureSchema,
  type GetRestaurantRequest,
  type GetRestaurantResponse,
  type OnboardRestaurantRequest,
  type OnboardRestaurantResponseSchema,
  type ReviseMenuRequest,
  type RestaurantService,
} from '@fd/contracts/fooddelivery/restaurant/v1/service_pb.js';
import { left, type Either } from '@fd/domain';
import type { OnboardRestaurantError } from '#application/commands/onboard-restaurant/onboard-restaurant.command.ts';
import type { OnboardRestaurantCommandHandler } from '#application/commands/onboard-restaurant/onboard-restaurant.command-handler.ts';
import type {
  ReviseMenuCommand,
  ReviseMenuError,
  RevisedMenu,
} from '#application/commands/revise-menu/revise-menu.command.ts';
import type { ReviseMenuCommandHandler } from '#application/commands/revise-menu/revise-menu.command-handler.ts';
import type { MessageMetadata } from '#application/ports/unit-of-work.port.ts';
import type { GetRestaurantError } from '#application/queries/get-restaurant/get-restaurant.query.ts';
import type { GetRestaurantQueryHandler } from '#application/queries/get-restaurant/get-restaurant.query-handler.ts';
import type { ListMembershipsQueryHandler } from '#application/queries/list-memberships/list-memberships.query-handler.ts';
import { parsePrincipal, type Principal } from '#domain/identity/principal.value-object.ts';
import {
  parseRestaurantId,
  type RestaurantId,
} from '#domain/restaurant/restaurant-id.value-object.ts';
import { toRawMenuItems, toRawRestaurantProfile } from './restaurant-request.message-mapper.ts';
import {
  toGetRestaurantResponse,
  toListMembershipsResponse,
} from './restaurant-response.message-mapper.ts';

export interface RestaurantRpcServiceSettings {
  readonly onboardRestaurant: OnboardRestaurantCommandHandler;
  readonly reviseMenu: ReviseMenuCommandHandler;
  readonly getRestaurant: GetRestaurantQueryHandler;
  readonly listMemberships: ListMembershipsQueryHandler;
}

interface ConcurrentMenuRevision {
  readonly type: 'ConcurrentMenuRevision';
}

type RestaurantRequestFailure =
  OnboardRestaurantError | ReviseMenuError | GetRestaurantError | ConcurrentMenuRevision;

const refusalCodes: ReadonlyMap<RestaurantRequestFailure['type'], Code> = new Map([
  ['RestaurantNotFound', Code.NotFound],
  ['NotRestaurantMember', Code.PermissionDenied],
  ['ConcurrentMenuRevision', Code.Aborted],
]);

function toConnectCode(failure: RestaurantRequestFailure): Code {
  return refusalCodes.get(failure.type) ?? Code.InvalidArgument;
}

function toMetadata(context: HandlerContext, principal: Principal): MessageMetadata {
  return {
    correlationId: context.values.get(correlationIdKey),
    causationId: undefined,
    actorId: principal.staffMemberId,
    actorType: 'restaurant_staff',
  };
}

function requestedRestaurantId(rawRestaurantId: string): RestaurantId {
  const restaurantId = parseRestaurantId(rawRestaurantId);
  if (restaurantId.isLeft()) throw new ConnectError('restaurant_id', Code.InvalidArgument);
  return restaurantId.success;
}

function toReviseMenuCommand(
  request: ReviseMenuRequest,
  context: HandlerContext,
): ReviseMenuCommand {
  const principal = principalOf(context, parsePrincipal);
  return {
    principal,
    restaurantId: requestedRestaurantId(request.restaurantId),
    menuItems: toRawMenuItems(request.menuItems),
    metadata: toMetadata(context, principal),
  };
}

async function reviseMenu(
  handler: ReviseMenuCommandHandler,
  command: ReviseMenuCommand,
): Promise<Either<ReviseMenuError | ConcurrentMenuRevision, RevisedMenu>> {
  try {
    return await handler.execute(command);
  } catch (error) {
    if (!(error instanceof ConcurrencyConflictError)) throw error;
    return left({ type: 'ConcurrentMenuRevision' });
  }
}

function restaurantRequestFailure(
  error: RestaurantRequestFailure,
  failureSchema: typeof OnboardRestaurantFailureSchema | typeof ReviseMenuFailureSchema,
): ConnectError {
  return new ConnectError(error.type, toConnectCode(error), undefined, [
    { desc: failureSchema, value: { reason: error.type } },
  ]);
}

async function onboardRestaurant(
  handler: OnboardRestaurantCommandHandler,
  request: OnboardRestaurantRequest,
  context: HandlerContext,
): Promise<MessageInitShape<typeof OnboardRestaurantResponseSchema>> {
  const principal = principalOf(context, parsePrincipal);
  const outcome = await handler.execute({
    principal,
    profile: toRawRestaurantProfile(request),
    metadata: toMetadata(context, principal),
  });
  if (outcome.isLeft())
    throw restaurantRequestFailure(outcome.failure, OnboardRestaurantFailureSchema);
  return { restaurantId: outcome.success.restaurantId };
}

async function getRestaurant(
  handler: GetRestaurantQueryHandler,
  request: GetRestaurantRequest,
  context: HandlerContext,
): Promise<GetRestaurantResponse> {
  const principal = principalOf(context, parsePrincipal);
  const restaurantId = requestedRestaurantId(request.restaurantId);
  const outcome = await handler.execute({ principal, restaurantId });
  if (outcome.isLeft())
    throw new ConnectError(outcome.failure.type, toConnectCode(outcome.failure));
  return toGetRestaurantResponse(outcome.success);
}

export function createRestaurantRpcService(
  settings: RestaurantRpcServiceSettings,
): ServiceImpl<typeof RestaurantService> {
  return {
    onboardRestaurant: (request, context) =>
      onboardRestaurant(settings.onboardRestaurant, request, context),

    async reviseMenu(request, context) {
      const outcome = await reviseMenu(settings.reviseMenu, toReviseMenuCommand(request, context));
      if (outcome.isLeft())
        throw restaurantRequestFailure(outcome.failure, ReviseMenuFailureSchema);
      return { version: outcome.success.version };
    },

    getRestaurant: (request, context) => getRestaurant(settings.getRestaurant, request, context),

    async listMemberships(request, context) {
      const principal = principalOf(context, parsePrincipal);
      return toListMembershipsResponse(await settings.listMemberships.execute({ principal }));
    },
  };
}
