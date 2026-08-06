const ISO8601_DURATION = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/;

export function parseIsoDuration(iso: string): number {
  const match = ISO8601_DURATION.exec(iso);
  if (!match) return 0;
  const [, days, hours, minutes, seconds] = match;
  return (
    (Number(days) || 0) * 86400 +
    (Number(hours) || 0) * 3600 +
    (Number(minutes) || 0) * 60 +
    (Number(seconds) || 0)
  );
}

export const SHORT_MAX_SECONDS = 180;

export function isShort(durationSeconds: number): boolean {
  return durationSeconds > 0 && durationSeconds <= SHORT_MAX_SECONDS;
}

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}
