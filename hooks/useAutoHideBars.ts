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
    function handleMouseMove() { resetTimer(); }
    window.addEventListener('mousemove', handleMouseMove);
    resetTimer();
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { barsVisible, resetTimer };
}
