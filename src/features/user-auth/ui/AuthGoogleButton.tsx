'use client';

import { useState } from 'react';
import { Button } from '@/shared/ui';
import { signInWithGoogle } from '../model';

interface Props {
  label?: string;
  onSuccess?: () => void;
}

export function AuthGoogleButton({
  label = 'Google로 계속하기',
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);
    try {
      await signInWithGoogle();
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button type="button" variant="outline" onClick={handleClick} disabled={loading}>
        {loading ? '연결 중...' : label}
      </Button>
      {error ? (
        <p
          role="alert"
          className="text-sm text-[color:var(--color-status-danger)]"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
