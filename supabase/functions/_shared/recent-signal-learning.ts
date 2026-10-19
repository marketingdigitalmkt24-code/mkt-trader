export type LearningOutcome = {
  asset: string; direction: string; entry_strategy: string | null;
  result: string; created_at: string;
};

// Statistical feedback, not model training; newest-first settled TEST evidence.
export function recentLearningAdjustment(
  history: LearningOutcome[], candidate: { asset: string; direction: string; entry_strategy: string },
  candidateMs: number,
): number {
  let wins = 0, losses = 0;
  let comboWins = 0, comboLosses = 0;
  const settled = history.filter(row => (row.result === 'win' || row.result === 'loss')
    && Date.parse(row.created_at) < candidateMs).slice(0, 500);
  settled.forEach((row, index) => {
    if (row.direction !== candidate.direction) return;
    // Strategy+direction across ALL assets: proven combos (e.g. Reversão RSI CALL)
    // rank up and losing combos (e.g. Força Invertida CALL) rank down.
    if (row.entry_strategy === candidate.entry_strategy) {
      if (row.result === 'win') comboWins++; else comboLosses++;
    }
    const sameAsset = row.asset === candidate.asset;
    const sameStrategy = row.entry_strategy === candidate.entry_strategy;
    if (!sameAsset && !sameStrategy) return;
    const weight = (index < 50 ? 2 : 1) * (sameAsset && sameStrategy ? 3 : 1);
    if (row.result === 'win') wins += weight;
    else losses += weight;
  });
  const local = ((wins + 5) / (wins + losses * 1.25 + 10) - 0.5) * 0.2;
  const combo = ((comboWins + 5) / (comboWins + comboLosses * 1.25 + 10) - 0.5) * 0.3;
  return local + combo;
}