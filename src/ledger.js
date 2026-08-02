export const MOVEMENT_TYPES = ['buyIn', 'topUp', 'cashOut'];

export function emptyState() {
  return {
    version: 1,
    players: [],
    movements: [],
    audit: [],
    conversionRate: null,
    conversionChips: null,
    conversionAmount: null,
  };
}

function sumByType(movements, type) {
  return movements
    .filter((movement) => movement.type === type)
    .reduce((total, movement) => total + movement.amount, 0);
}

export function playerSummary(player, movements) {
  const ownMovements = movements.filter((movement) => movement.playerId === player.id);
  const buyIn = sumByType(ownMovements, 'buyIn');
  const topUp = sumByType(ownMovements, 'topUp');
  const topUpCount = ownMovements.filter((movement) => movement.type === 'topUp').length;
  const cashOut = sumByType(ownMovements, 'cashOut');
  const netBuyIn = buyIn + topUp - cashOut;
  const remainingChips = player.remainingChips ?? 0;

  return {
    buyIn,
    topUp,
    topUpCount,
    cashOut,
    netBuyIn,
    remainingChips,
    profitLoss: remainingChips - netBuyIn,
  };
}

export function globalNetBuyIn(state) {
  return state.players.reduce(
    (total, player) => total + playerSummary(player, state.movements).netBuyIn,
    0,
  );
}

export function reconciliationSummary(state) {
  const summaries = state.players.map((player) => playerSummary(player, state.movements));
  const totalAbove = summaries.reduce((total, summary) => total + Math.max(summary.profitLoss, 0), 0);
  const totalBelow = summaries.reduce((total, summary) => total + Math.max(-summary.profitLoss, 0), 0);
  const allSettled = state.players.length > 0 && state.players.every((player) => player.remainingChips !== null);
  return { totalAbove, totalBelow, allSettled, isBalanced: allSettled && totalAbove === totalBelow };
}

export function settlementRankings(state) {
  const rows = state.players.map((player) => ({ player, ...playerSummary(player, state.movements) }));
  const byAbsoluteValue = (left, right) => Math.abs(right.profitLoss) - Math.abs(left.profitLoss);
  return {
    above: rows.filter((row) => row.profitLoss > 0).sort(byAbsoluteValue),
    below: rows.filter((row) => row.profitLoss < 0).sort(byAbsoluteValue),
  };
}

export function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value);
}

export function isPositiveInteger(value) {
  return Number.isInteger(value) && value > 0;
}

export function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}
