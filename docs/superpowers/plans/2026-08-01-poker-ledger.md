# 德州记分网页版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a single-administrator, browser-local poker chip ledger that tracks players, chip movements, settlement, optional cash conversion, and an immutable audit trail.

**Architecture:** Use a dependency-free static web app. Keep chip calculation rules in `src/ledger.js`, persistence and audit append-only behavior in `src/store.js`, and browser rendering/event wiring in `src/app.js`; `index.html` loads the app as an ES module. Persist the complete state under one versioned LocalStorage key, so presentation can be replaced later without changing data rules.

**Tech Stack:** HTML5, CSS3, browser ES modules, LocalStorage, Node.js built-in `node:test`.

## Global Constraints

- No backend, account system, online sync, or multi-administrator editing.
- Store all data in LocalStorage and tolerate missing/corrupt stored state by starting empty.
- Record quantity values as positive integers; movement direction is determined exclusively by type.
- Net buy-in: `buyIn + topUp - cashOut`; chip profit/loss: `remainingChips - netBuyIn`.
- Conversion is optional and applies only to display; it must never alter chip data.
- Every create, update, and delete action records an audit event with an ISO timestamp; deleted entities are retained as audit snapshots rather than visible records.

---

### Task 1: Initialize static app and domain ledger

**Files:**
- Create: `package.json`
- Create: `src/ledger.js`
- Create: `test/ledger.test.js`
- Create: `index.html`

**Interfaces:**
- Produces `MOVEMENT_TYPES`, `emptyState()`, `playerSummary(player, movements)`, `globalNetBuyIn(state)`, and `formatNumber(value)` from `src/ledger.js`.
- `playerSummary` returns `{ buyIn, topUp, cashOut, netBuyIn, remainingChips, profitLoss }`.

- [ ] **Step 1: Write the failing domain tests**

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { globalNetBuyIn, playerSummary } from '../src/ledger.js';

const player = { id: 'p1', name: '阿明', remainingChips: 1400 };
const movements = [
  { playerId: 'p1', type: 'buyIn', amount: 1000 },
  { playerId: 'p1', type: 'topUp', amount: 600 },
  { playerId: 'p1', type: 'cashOut', amount: 200 },
];

test('summarises all chip movement types and settlement', () => {
  assert.deepEqual(playerSummary(player, movements), {
    buyIn: 1000, topUp: 600, cashOut: 200,
    netBuyIn: 1400, remainingChips: 1400, profitLoss: 0,
  });
});

test('global net buy-in is the sum of player net buy-ins', () => {
  assert.equal(globalNetBuyIn({ players: [player], movements }), 1400);
});
```

- [ ] **Step 2: Verify the tests fail before implementation**

Run: `npm test`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/ledger.js`.

- [ ] **Step 3: Implement the calculation module and test command**

```js
// src/ledger.js
export const MOVEMENT_TYPES = ['buyIn', 'topUp', 'cashOut'];
export const emptyState = () => ({ version: 1, players: [], movements: [], audit: [], conversionRate: null });
const sum = (items, type) => items.filter((item) => item.type === type).reduce((total, item) => total + item.amount, 0);
export function playerSummary(player, movements) {
  const own = movements.filter((item) => item.playerId === player.id);
  const buyIn = sum(own, 'buyIn');
  const topUp = sum(own, 'topUp');
  const cashOut = sum(own, 'cashOut');
  const netBuyIn = buyIn + topUp - cashOut;
  const remainingChips = player.remainingChips ?? 0;
  return { buyIn, topUp, cashOut, netBuyIn, remainingChips, profitLoss: remainingChips - netBuyIn };
}
export function globalNetBuyIn(state) { return state.players.reduce((total, player) => total + playerSummary(player, state.movements).netBuyIn, 0); }
export const formatNumber = (value) => new Intl.NumberFormat('zh-CN').format(value);
```

```json
{ "type": "module", "scripts": { "test": "node --test" } }
```

Create `index.html` with a `#app` container and `<script type="module" src="./src/app.js"></script>`.

- [ ] **Step 4: Run domain tests**

Run: `npm test`

Expected: PASS, 2 tests.

### Task 2: Add state persistence and append-only audit actions

**Files:**
- Create: `src/store.js`
- Create: `test/store.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes `emptyState` from `src/ledger.js`.
- Produces `createStore(storage)` with `load()`, `save(state)`, `addPlayer(name, occurredAt)`, `addMovement(input)`, `setRemaining(playerId, amount, occurredAt)`, `updateMovement(id, input)`, `deleteMovement(id)`, and `deletePlayer(id)`.
- Every mutator returns a fresh state and writes one audit event shaped `{ id, action, targetType, targetId, at, before, after }`.

- [ ] **Step 1: Write failing persistence/audit tests**

```js
test('cash-out reduces net buy-in and records a timestamped audit item', () => {
  const store = createStore(new MapStorage());
  const player = store.addPlayer('阿明', '2026-08-01T10:00:00.000Z');
  store.addMovement({ playerId: player.id, type: 'cashOut', amount: 200, occurredAt: '2026-08-01T10:05:00.000Z' });
  const state = store.load();
  assert.equal(state.movements[0].amount, 200);
  assert.equal(state.audit.at(-1).action, 'create');
  assert.equal(state.audit.at(-1).at, '2026-08-01T10:05:00.000Z');
});

test('deleting a movement removes it from the visible ledger but retains a before snapshot', () => {
  // seed one movement, delete it, assert movements is empty and audit.at(-1).before has its amount
});
```

- [ ] **Step 2: Verify tests fail**

Run: `npm test`

Expected: FAIL because `src/store.js` does not exist.

- [ ] **Step 3: Implement a storage adapter and immutable state mutations**

Use `crypto.randomUUID()` for IDs and `new Date().toISOString()` only when the caller does not provide `occurredAt`. Store under `poker-ledger:v1`; return `emptyState()` for invalid JSON or wrong shape. Validate trimmed unique player names and positive integer amounts before saving. On movement/player edits and deletes, append a separate audit event containing cloned `before` and `after` values; never mutate an existing audit item.

- [ ] **Step 4: Run the complete test suite**

Run: `npm test`

Expected: PASS for the domain and store tests.

### Task 3: Build the responsive ledger interface

**Files:**
- Create: `src/app.js`
- Create: `styles.css`
- Modify: `index.html`

**Interfaces:**
- Consumes `createStore`, `playerSummary`, `globalNetBuyIn`, and `formatNumber`.
- Renders all data from `store.load()`; after every successful form action, rerenders from persisted state.

- [ ] **Step 1: Build the semantic page shell**

Create a header with global net buy-in, a player sidebar with add-player form, and a main detail view. The detail view must include player summary cards, a movement form (type, positive quantity, local datetime, notes), a settlement form (remaining chips plus optional conversion rate), a reverse-chronological movement table, and an audit drawer.

- [ ] **Step 2: Wire guarded UI actions**

On submit, convert `datetime-local` to ISO strings, display inline validation errors, and leave input values intact on failure. Open edit forms populated with existing values. Require `window.confirm` before player or movement deletion. For a missing selected player, show an empty-state prompt instead of forms. Display each movement's occurrence time, creation time, and last-updated time where applicable; render audit time plus before/after field changes in the drawer.

- [ ] **Step 3: Implement mobile-first styling**

Use `styles.css` to place the sidebar and detail area in one column below 760px and two columns at or above 760px. Use system fonts, high-contrast neutral backgrounds, a distinct warning/destructive action treatment, card-based summaries, and horizontally scrollable tables. Do not use external fonts, images, or UI libraries.

- [ ] **Step 4: Verify in a local browser server**

Run: `npx --yes serve . -l 4173`

Expected: static server starts and `http://localhost:4173` loads without JavaScript console errors. Manually verify add player, all three movement types, settlement, optional conversion, reload persistence, edit, delete, and audit drawer.

### Task 4: Document local operation and complete regression checks

**Files:**
- Create: `README.md`
- Modify: `test/ledger.test.js`
- Modify: `test/store.test.js`

**Interfaces:**
- Documents `npm test` and local static-server usage; no production deployment behavior is introduced.

- [ ] **Step 1: Add boundary tests**

Add test cases for zero/negative/decimal quantities being rejected, duplicate player names being rejected after trimming, missing remaining chips yielding zero in calculations, corrupt LocalStorage yielding the empty state, conversion rate being optional, and edit/delete events retaining exact before/after snapshots.

- [ ] **Step 2: Write concise operation documentation**

Document the four record concepts, formulas, browser-only persistence limitation, and commands:

```bash
npm test
npx --yes serve . -l 4173
```

- [ ] **Step 3: Run final verification**

Run: `npm test`

Expected: PASS for all tests. Repeat Task 3's manual browser checklist after clearing and restoring a test data set.

## Self-review

- Spec coverage: Tasks 1–2 implement the record model, calculations, LocalStorage, optional conversion state, and timestamped audit records. Task 3 implements all requested administrator screens and destructive-action confirmation. Task 4 covers input failures, persistence failures, and operation instructions.
- No-placeholder scan: no deferred behavior or unnamed interfaces remain; validation and audit content are explicitly defined.
- Type consistency: `playerId`, `type`, `amount`, `occurredAt`, `remainingChips`, `audit`, and the summary field names are shared consistently between the model, store, UI, and tests.
