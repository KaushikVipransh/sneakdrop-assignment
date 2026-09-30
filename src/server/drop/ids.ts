const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Guards queries on uuid columns so a malformed id is "not found", not a DB error. */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
