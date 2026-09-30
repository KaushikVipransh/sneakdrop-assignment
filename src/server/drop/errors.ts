export class DropNotFound extends Error {
  constructor(public readonly dropId: string) {
    super(`Drop ${dropId} not found`);
    this.name = "DropNotFound";
  }
}

/** Thrown when a transaction would commit a state that oversells the drop. */
export class InvariantViolation extends Error {
  constructor(message: string) {
    super(`Invariant violated: ${message}`);
    this.name = "InvariantViolation";
  }
}
