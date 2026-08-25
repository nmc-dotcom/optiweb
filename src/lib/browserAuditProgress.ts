const ESTIMATED_SECONDS_PER_URL = 8;

export interface BrowserAuditEstimate {
  percent: number;
  elapsedSeconds: number;
  remainingSeconds: number;
}

export function estimateBrowserAuditProgress(
  completed: number,
  total: number,
  elapsedMs: number,
  running: boolean,
): BrowserAuditEstimate {
  const safeTotal = Math.max(0, total);
  const safeCompleted = Math.min(Math.max(0, completed), safeTotal);
  const elapsedSeconds = Math.max(0, Math.floor(elapsedMs / 1_000));

  if (!running) {
    return {
      percent: safeTotal > 0 && safeCompleted >= safeTotal ? 100 : 0,
      elapsedSeconds,
      remainingSeconds: 0,
    };
  }

  if (safeTotal === 0) {
    return { percent: 5, elapsedSeconds, remainingSeconds: 0 };
  }

  const expectedTotalSeconds = safeTotal * ESTIMATED_SECONDS_PER_URL;
  const actualPercent = (safeCompleted / safeTotal) * 100;
  const timePercent = (elapsedSeconds / expectedTotalSeconds) * 100;
  const secondsPerUrl =
    safeCompleted > 0
      ? Math.max(ESTIMATED_SECONDS_PER_URL, elapsedSeconds / safeCompleted)
      : ESTIMATED_SECONDS_PER_URL;
  const remainingSeconds =
    safeCompleted > 0
      ? Math.ceil((safeTotal - safeCompleted) * secondsPerUrl)
      : Math.max(1, expectedTotalSeconds - elapsedSeconds);

  return {
    percent: Math.min(
      95,
      Math.max(2, Math.round(actualPercent), Math.round(timePercent)),
    ),
    elapsedSeconds,
    remainingSeconds: Math.max(1, remainingSeconds),
  };
}
