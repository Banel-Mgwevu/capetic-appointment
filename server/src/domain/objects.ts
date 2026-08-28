/**
 * Drops keys whose value is `undefined`. Needed because a Zod `.partial()`
 * result types each field as `T | undefined` (the key can be present *and*
 * explicitly undefined), while consumers built under `exactOptionalPropertyTypes`
 * expect "omit the key" to mean "don't change this field" -- there's no
 * meaningful difference between the two here, so this normalises to the
 * stricter shape rather than loosening every consumer's types.
 */
export function omitUndefined<T extends Record<string, unknown>>(obj: T): { [K in keyof T]: Exclude<T[K], undefined> } {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) result[key] = value;
  }
  return result as { [K in keyof T]: Exclude<T[K], undefined> };
}
