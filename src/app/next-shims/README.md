# src/app/next-shims

`next/navigation`, `next/dynamic`, `next/image` and `next-intl` answered over TanStack Router and
`use-intl`, so one source tree builds with Next and with Vite. `vite.config.ts` aliases the Next
names to these files; the Next build never loads them. A shim is deleted when Next is.
