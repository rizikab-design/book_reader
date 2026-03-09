import { useState, useRef, useEffect } from 'react';

export function useAutoHideBars(timeout = 3000) {
  const [barsVisible, setBarsVisible] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function resetTimer() {
    setBarsVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setBarsVisible(false), timeout);
  }

  useEffect(() => {
    let lastReset = 0;
    function handleMouseMove() {
      const now = Date.now();
      if (now - lastReset > 100) {
        resetTimer();
        lastReset = now;
      }
    }
    window.addEventListener('mousemove', handleMouseMove);
    resetTimer();
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { barsVisible, resetTimer };
}
