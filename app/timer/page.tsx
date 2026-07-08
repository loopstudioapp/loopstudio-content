"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./page.module.css";

function formatElapsed(ms: number) {
  const totalCentiseconds = Math.floor(ms / 10);
  const centiseconds = totalCentiseconds % 100;
  const totalSeconds = Math.floor(totalCentiseconds / 100);
  const seconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}

export default function TimerPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  const frameId = useRef<number | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    const tick = () => {
      setElapsed(performance.now() - startedAt.current);
      frameId.current = requestAnimationFrame(tick);
    };

    frameId.current = requestAnimationFrame(tick);

    return () => {
      if (frameId.current !== null) {
        cancelAnimationFrame(frameId.current);
      }
    };
  }, [isRunning]);

  const time = useMemo(() => formatElapsed(elapsed), [elapsed]);

  return (
    <main className={styles.page}>
      <time className={styles.timer} dateTime={`PT${Math.floor(elapsed / 1000)}S`}>
        {time}
      </time>
      <button
        className={styles.button}
        type="button"
        disabled={isRunning}
        onClick={() => {
          startedAt.current = performance.now();
          setIsRunning(true);
        }}
      >
        {isRunning ? "Running" : "Start"}
      </button>
    </main>
  );
}
