import { notFound as tanStackNotFound, useRouter as useTanStackRouter } from '@tanstack/react-router';
import { useMemo } from 'react';

import { navigateToAddress, type AddressNavigation } from '../router/navigate-to-address';
import { useCommittedAddress } from '../router/use-committed-address';

export function usePathname(): string {
  return useCommittedAddress().pathname;
}

export function useSearchParams(): URLSearchParams {
  const { searchString } = useCommittedAddress();
  return useMemo(() => new URLSearchParams(searchString), [searchString]);
}

export function useRouter() {
  const router = useTanStackRouter();
  return useMemo(
    () => ({
      push: (address: string, options?: AddressNavigation) => navigateToAddress(router, address, options),
      replace: (address: string, options?: AddressNavigation) =>
        navigateToAddress(router, address, { ...options, replace: true }),
      back: () => router.history.back(),
      forward: () => router.history.forward(),
      prefetch: (_address: string) => undefined,
      refresh: () => void router.invalidate(),
    }),
    [router],
  );
}

export function notFound(): never {
  throw tanStackNotFound();
}
