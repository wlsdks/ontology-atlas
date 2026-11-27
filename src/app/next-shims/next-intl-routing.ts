/** `defineRouting` only types and returns its options; the router owns matching. */
export function defineRouting<const Routing extends { locales: readonly string[]; defaultLocale: string }>(
  routing: Routing,
): Routing {
  return routing;
}
