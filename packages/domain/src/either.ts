export class Left<Failure> {
  readonly failure: Failure;

  constructor(failure: Failure) {
    this.failure = failure;
  }

  isLeft(): this is Left<Failure> {
    return true;
  }

  isRight(): this is never {
    return false;
  }
}

export class Right<Success> {
  readonly success: Success;

  constructor(success: Success) {
    this.success = success;
  }

  isLeft(): this is never {
    return false;
  }

  isRight(): this is Right<Success> {
    return true;
  }
}

export type Either<Failure, Success> = Left<Failure> | Right<Success>;

export interface EitherHandlers<Failure, Success, Outcome> {
  readonly onLeft: (failure: Failure) => Outcome;
  readonly onRight: (success: Success) => Outcome;
}

export function left<Failure>(failure: Failure): Left<Failure> {
  return new Left(failure);
}

export function right<Success>(success: Success): Right<Success> {
  return new Right(success);
}

export function matchEither<Failure, Success, Outcome>(
  either: Either<Failure, Success>,
  handlers: EitherHandlers<Failure, Success, Outcome>,
): Outcome {
  if (either.isLeft()) return handlers.onLeft(either.failure);
  return handlers.onRight(either.success);
}
