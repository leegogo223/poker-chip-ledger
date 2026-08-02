import test from 'node:test';
import assert from 'node:assert/strict';
import { globalNetBuyIn, playerSummary, reconciliationSummary, settlementRankings } from '../src/ledger.js';

const player = { id: 'p1', name: '阿明', remainingChips: 1400 };
const movements = [
  { playerId: 'p1', type: 'buyIn', amount: 1000 },
  { playerId: 'p1', type: 'topUp', amount: 600 },
  { playerId: 'p1', type: 'cashOut', amount: 200 },
];

test('summarises all chip movement types and settlement', () => {
  assert.deepEqual(playerSummary(player, movements), {
    buyIn: 1000,
    topUp: 600,
    topUpCount: 1,
    cashOut: 200,
    netBuyIn: 1400,
    remainingChips: 1400,
    profitLoss: 0,
  });
});

test('global net buy-in is the sum of player net buy-ins', () => {
  assert.equal(globalNetBuyIn({ players: [player], movements }), 1400);
});

test('reconciles total gains and losses only after every player settles', () => {
  const state = {
    players: [
      { id: 'p1', name: '阿明', remainingChips: 150 },
      { id: 'p2', name: '小李', remainingChips: 50 },
    ],
    movements: [
      { playerId: 'p1', type: 'buyIn', amount: 100 },
      { playerId: 'p2', type: 'buyIn', amount: 100 },
    ],
  };
  assert.deepEqual(reconciliationSummary(state), {
    totalAbove: 50,
    totalBelow: 50,
    allSettled: true,
    isBalanced: true,
  });
});

test('ranks positive and negative settlement results by absolute value', () => {
  const state = {
    players: [
      { id: 'p1', name: '阿明', remainingChips: 180 },
      { id: 'p2', name: '小李', remainingChips: 40 },
      { id: 'p3', name: '小王', remainingChips: 80 },
    ],
    movements: [
      { playerId: 'p1', type: 'buyIn', amount: 100 },
      { playerId: 'p2', type: 'buyIn', amount: 100 },
      { playerId: 'p3', type: 'buyIn', amount: 100 },
    ],
  };
  const rankings = settlementRankings(state);
  assert.deepEqual(rankings.above.map((row) => row.player.name), ['阿明']);
  assert.deepEqual(rankings.below.map((row) => row.player.name), ['小李', '小王']);
});

test('reconciles a seven-player table with 1,000-chip buy-ins', () => {
  const players = [
    ['p1', '阿明', 3500],
    ['p2', '小李', 2500],
    ['p3', '小王', 800],
    ['p4', '小陈', 700],
    ['p5', '小周', 600],
    ['p6', '小赵', 200],
    ['p7', '小孙', 700],
  ].map(([id, name, remainingChips]) => ({ id, name, remainingChips }));
  const movements = players.map((player) => ({ playerId: player.id, type: 'buyIn', amount: 1000 }));
  movements.push(
    { playerId: 'p1', type: 'topUp', amount: 1000 },
    { playerId: 'p2', type: 'topUp', amount: 1000 },
  );
  const state = { players, movements };

  assert.equal(globalNetBuyIn(state), 9000);
  assert.equal(players.reduce((total, player) => total + player.remainingChips, 0), 9000);
  assert.deepEqual(reconciliationSummary(state), {
    totalAbove: 2000,
    totalBelow: 2000,
    allSettled: true,
    isBalanced: true,
  });

  const rankings = settlementRankings(state);
  assert.deepEqual(rankings.above.map((row) => [row.player.name, row.profitLoss]), [
    ['阿明', 1500], ['小李', 500],
  ]);
  assert.deepEqual(rankings.below.map((row) => [row.player.name, row.profitLoss]), [
    ['小赵', -800], ['小周', -400], ['小陈', -300], ['小孙', -300], ['小王', -200],
  ]);
});
