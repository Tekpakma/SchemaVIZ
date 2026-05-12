export function hasKey<T extends object>(
  obj: T,
  key: PropertyKey,
): key is keyof T {
  return Object.hasOwn(obj, key)
}
