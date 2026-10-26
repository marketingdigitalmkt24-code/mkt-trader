export const FORCA_ANTECIPADA = 'FORCA_ANTECIPADA_V1';
type Candle = { t: number; o: number; c: number; h: number; l: number };
const ema = (xs: number[], n: number) => { const k = 2 / (n + 1); let e = xs[0]; for (const x of xs.slice(1)) e = x * k + e * (1 - k); return e; };
function rsi(cl: number[], n = 14) {
  let g = 0, l = 0;
  for (let i = cl.length - n; i < cl.length; i++) { const d = cl[i] - cl[i - 1]; if (d > 0) g += d; else l -= d; }
  return l === 0 ? 100 : 100 - 100 / (1 + g / l);
}
// User (Oct 26 2026): Demo-only combination trying to enter one minute before a Force candle.
// Uses only closed candles before the entry minute; never principal, Telegram or copy.
// IQ candles carry no volume here, so range expansion stands in for rising volume.
export function forcaAntecipada(candles: Candle[], entry: number) {
  if (!Number.isFinite(entry) || entry % 60 !== 0) return null;
  const cs = candles.filter(k => k.t < entry).slice(-100);
  if (cs.length !== 100 || cs.some((k, i) => k.t !== entry - (100 - i) * 60
    || ![k.t, k.o, k.c, k.h, k.l].every(Number.isFinite) || k.o <= 0 || k.c <= 0
    || k.h < Math.max(k.o, k.c) || k.l > Math.min(k.o, k.c))) return null;
  const last3 = cs.slice(-3);
  const dir = last3.every(k => k.c > k.o) ? 'CALL' : last3.every(k => k.c < k.o) ? 'PUT' : null;
  if (!dir) return null;
  const s = dir === 'CALL' ? 1 : -1;
  // 1) Pressure: bodies growing and closes near the extreme (counter wick <= 25% of range).
  for (let i = 0; i < 3; i++) {
    const k = last3[i], range = k.h - k.l;
    if (!(range > 0)) return null;
    const wick = dir === 'CALL' ? k.h - k.c : k.c - k.l;
    if (wick / range > 0.25) return null;
    if (i > 0 && s * (k.c - k.o) < s * (last3[i - 1].c - last3[i - 1].o)) return null;
  }
  // 2) Activity: last range above 20-candle average range.
  const prior = cs.slice(-21, -1), avg = prior.reduce((a, k) => a + k.h - k.l, 0) / prior.length;
  const lastRange = cs[99].h - cs[99].l;
  if (!(avg > 0 && lastRange > avg)) return null;
  // 3) Trend aligned.
  const cl = cs.map(k => k.c), e9 = ema(cl, 9), e21 = ema(cl, 21), sma50 = cl.slice(-50).reduce((a, b) => a + b, 0) / 50;
  if (dir === 'CALL' ? !(e9 > e21 && e21 > sma50) : !(e9 < e21 && e21 < sma50)) return null;
  // 4) RSI with strength but not stretched.
  const r = rsi(cl);
  if (dir === 'CALL' ? !(r >= 50 && r <= 65) : !(r >= 35 && r <= 50)) return null;
  return { direction: dir as 'CALL' | 'PUT', expansion: lastRange / avg, rsi: r };
}
