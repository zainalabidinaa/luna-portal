import { useState } from 'react';

/**
 * Renders one poster slot from a shared pool, cycling to the next backup
 * candidate on a real image load failure (some picked poster URLs 404 —
 * see useFolderPreviewPosters' pickPoster comment — and there's no way to
 * know that ahead of an actual `<img>` load attempt). Each slot steps
 * through the pool at `totalSlots` intervals (slot 0: pool[0], pool[4], …)
 * so sibling slots don't compete over the same backups.
 */
export function FallbackPosterImg({
  pool, slot, totalSlots, className,
}: {
  pool: string[];
  slot: number;
  totalSlots: number;
  className: string;
}) {
  const [attempt, setAttempt] = useState(0);
  const src = pool[slot + attempt * totalSlots];
  return src ? (
    <img src={src} alt="" className={className} onError={() => setAttempt((a) => a + 1)} />
  ) : (
    <div className={`${className} bg-surface-2`} />
  );
}
