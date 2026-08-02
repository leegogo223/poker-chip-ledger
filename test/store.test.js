import test from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/store.js';
import { playerSummary } from '../src/ledger.js';

class MapStorage {
  #values = new Map();
  getItem(key) { return this.#values.get(key) ?? null; }
  setItem(key, value) { this.#values.set(key, value); }
}

test('cash-out reduces net buy-in and records a timestamped audit item', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明', '2026-08-01T10:00:00.000Z');
  store.addMovement({
    playerId: player.id,
    type: 'cashOut',
    amount: 200,
    occurredAt: '2026-08-01T10:05:00.000Z',
    actionAt: '2026-08-01T10:05:00.000Z',
  });
  const state = store.load();
  assert.equal(playerSummary(state.players[0], state.movements).netBuyIn, -200);
  assert.equal(state.audit.at(-1).action, 'create');
  assert.equal(state.audit.at(-1).at, '2026-08-01T10:05:00.000Z');
});

test('deleting a movement removes it from the visible ledger but retains a before snapshot', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明', '2026-08-01T10:00:00.000Z');
  const movement = store.addMovement({
    playerId: player.id,
    type: 'buyIn',
    amount: 1000,
    occurredAt: '2026-08-01T10:05:00.000Z',
    actionAt: '2026-08-01T10:05:00.000Z',
  });
  store.deleteMovement(movement.id, '2026-08-01T10:10:00.000Z');
  const state = store.load();
  assert.equal(state.movements.length, 0);
  assert.deepEqual(state.audit.at(-1).before.amount, 1000);
  assert.equal(state.audit.at(-1).at, '2026-08-01T10:10:00.000Z');
});

test('rejects invalid amounts and duplicate trimmed player names', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer(' 阿明 ', '2026-08-01T10:00:00.000Z');
  assert.equal(player.name, '阿明');
  assert.throws(() => store.addPlayer('阿明'), /已存在/);
  assert.throws(() => store.addMovement({ playerId: player.id, type: 'buyIn', amount: 0 }), /正整数/);
});

test('corrupt persistence falls back to an empty state', () => {
  const storage = new MapStorage();
  storage.setItem('poker-ledger:v1', '{bad json');
  assert.deepEqual(createStore(storage).load().players, []);
});

test('zero remaining chips is a valid settlement value', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明');
  store.setRemaining(player.id, 0);
  assert.equal(store.load().players[0].remainingChips, 0);
});

test('conversion is optional and does not change chip movements', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明');
  store.addMovement({ playerId: player.id, type: 'buyIn', amount: 500 });
  store.setConversionRate(100);
  assert.equal(store.load().conversionRate, 100);
  store.setConversionRate('');
  assert.equal(store.load().conversionRate, null);
  assert.equal(store.load().movements[0].amount, 500);
});

test('stores a chip-to-cash conversion pair and derives its rate', () => {
  const store = createStore(new MapStorage());
  store.setConversion(100, 10);
  const state = store.load();
  assert.equal(state.conversionChips, 100);
  assert.equal(state.conversionAmount, 10);
  assert.equal(state.conversionRate, 10);
});

test('editing retains exact before and after snapshots', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明');
  const movement = store.addMovement({ playerId: player.id, type: 'buyIn', amount: 500 });
  store.updateMovement(movement.id, { type: 'topUp', amount: 300, occurredAt: '2026-08-01T10:00:00.000Z' }, '2026-08-01T11:00:00.000Z');
  const audit = store.load().audit.at(-1);
  assert.equal(audit.before.amount, 500);
  assert.equal(audit.after.amount, 300);
  assert.equal(audit.at, '2026-08-01T11:00:00.000Z');
});

test('editing a movement preserves a timestamped change note', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明');
  const movement = store.addMovement({ playerId: player.id, type: 'buyIn', amount: 500 });
  store.updateMovement(movement.id, { type: 'buyIn', amount: 800, occurredAt: movement.occurredAt }, '2026-08-01T12:00:00.000Z');
  const updated = store.load().movements[0];
  assert.deepEqual(updated.editHistory, [{ at: '2026-08-01T12:00:00.000Z', changes: ['数量：500 → 800'] }]);
});
