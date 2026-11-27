import { lazy, Suspense, type ComponentType } from 'react';

type Loaded<Props> = ComponentType<Props> | { default: ComponentType<Props> };

interface DynamicOptions {
  ssr?: boolean;
  loading?: ComponentType;
}

/** Every use in Atlas passes `ssr: false`, which in a client-only app is what `lazy` already does. */
export default function dynamic<Props extends object>(load: () => Promise<Loaded<Props>>, options: DynamicOptions = {}) {
  const Lazy = lazy(async () => {
    const loaded = await load();
    return 'default' in loaded ? loaded : { default: loaded };
  });
  const Loading = options.loading;
  return function Dynamic(props: Props) {
    return (
      <Suspense fallback={Loading ? <Loading /> : null}>
        <Lazy {...(props as Props & object)} />
      </Suspense>
    );
  };
}
