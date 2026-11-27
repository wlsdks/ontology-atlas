import { createFileRoute, notFound } from '@tanstack/react-router';

/** An address under a language that no screen owns is answered inside the shell, not outside it. */
export const Route = createFileRoute('/$locale/_app/$')({
  beforeLoad: () => {
    throw notFound();
  },
});
