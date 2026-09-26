import { useCallback, useInsertionEffect, useRef } from 'react';

/**
 * Returns a function with a stable identity that always calls the latest `callback`.
 * Lets memoized children (e.g. inputs) receive handlers like `onSubmitEditing` without
 * re-rendering every time the parent's state changes.
 */
export function useStableCallback<Args extends unknown[], R>(
  callback: (...args: Args) => R
): (...args: Args) => R {
  const callbackRef = useRef(callback);
  useInsertionEffect(() => {
    callbackRef.current = callback;
  });
  return useCallback((...args: Args) => callbackRef.current(...args), []);
}
