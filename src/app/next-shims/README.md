# src/app/next-shims

`next/navigation` and `next-intl/navigation` answered over TanStack Router, for the source files that
still import them until the addresses move onto the router. `vite.config.ts` aliases the two names to
these files. A shim is deleted with the last file that imports its name.
