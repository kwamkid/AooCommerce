import { useEffect, useRef } from 'react';

/**
 * Runs a callback exactly once when `ready` becomes true.
 * Prevents duplicate API calls caused by React re-renders
 * or context object reference changes.
 *
 * Usage:
 *   useFetchOnce(() => {
 *     fetchData();
 *     fetchOtherData();
 *   }, !!currentCompany?.id);
 */
export function useFetchOnce(callback: () => void, ready: boolean) {
  const calledRef = useRef(false);
  useEffect(() => {
    if (!ready) return;
    if (calledRef.current) return;
    calledRef.current = true;
    callback();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
}
