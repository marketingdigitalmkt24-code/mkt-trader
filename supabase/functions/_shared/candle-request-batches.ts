// Yield between small bursts, not between every asset. Keep full-market ranking.
export async function sendCandleRequestBatches<T>(
  requests: Iterable<T>,
  send: (request: T) => void,
  pause: () => Promise<void> = () => new Promise(resolve => setTimeout(resolve, 15)),
): Promise<void> {
  let count = 0;
  for (const request of requests) {
    if (count > 0 && count % 16 === 0) await pause();
    send(request);
    count++;
  }
}