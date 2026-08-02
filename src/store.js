import { emptyState, isNonNegativeInteger, isPositiveInteger, MOVEMENT_TYPES } from './ledger.js';

const STORAGE_KEY = 'poker-ledger:v1';
const clone = (value) => structuredClone(value);
const now = () => new Date().toISOString();
const newId = () => crypto.randomUUID();

function validState(value) {
  return value && value.version === 1 && Array.isArray(value.players)
    && Array.isArray(value.movements) && Array.isArray(value.audit);
}

function requirePlayer(state, playerId) {
  const player = state.players.find((item) => item.id === playerId);
  if (!player) throw new Error('找不到该玩家');
  return player;
}

function validateAmount(amount) {
  if (!isPositiveInteger(amount)) throw new Error('筹码数量必须是正整数');
}

function validateName(state, name, excludedId) {
  const cleanName = String(name ?? '').trim();
  if (!cleanName) throw new Error('请输入玩家名称');
  if (state.players.some((item) => item.id !== excludedId && item.name === cleanName)) {
    throw new Error('该玩家已存在');
  }
  return cleanName;
}

function addAudit(state, action, targetType, targetId, before, after, at = now()) {
  state.audit.push({
    id: newId(), action, targetType, targetId, at,
    before: before === undefined ? null : clone(before),
    after: after === undefined ? null : clone(after),
  });
}

export function createStore(storage = localStorage) {
  function load() {
    try {
      const parsed = JSON.parse(storage.getItem(STORAGE_KEY));
      return validState(parsed) ? parsed : emptyState();
    } catch {
      return emptyState();
    }
  }

  function save(state) {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return state;
  }

  function transact(mutator) {
    const state = clone(load());
    const result = mutator(state);
    save(state);
    return result;
  }

  return {
    load,
    save,
    addPlayer(name, actionAt = now()) {
      return transact((state) => {
        const player = { id: newId(), name: validateName(state, name), remainingChips: null, createdAt: actionAt, updatedAt: actionAt };
        state.players.push(player);
        addAudit(state, 'create', 'player', player.id, null, player, actionAt);
        return clone(player);
      });
    },
    updatePlayer(id, name, actionAt = now()) {
      return transact((state) => {
        const player = requirePlayer(state, id);
        const before = clone(player);
        player.name = validateName(state, name, id);
        player.updatedAt = actionAt;
        addAudit(state, 'update', 'player', id, before, player, actionAt);
        return clone(player);
      });
    },
    addMovement({ playerId, type, amount, occurredAt, actionAt = now() }) {
      return transact((state) => {
        requirePlayer(state, playerId);
        if (!MOVEMENT_TYPES.includes(type)) throw new Error('无效的记录类型');
        validateAmount(amount);
        const movement = { id: newId(), playerId, type, amount, occurredAt: occurredAt ?? actionAt, editHistory: [], createdAt: actionAt, updatedAt: actionAt };
        state.movements.push(movement);
        addAudit(state, 'create', 'movement', movement.id, null, movement, actionAt);
        return clone(movement);
      });
    },
    updateMovement(id, { type, amount }, actionAt = now()) {
      return transact((state) => {
        const movement = state.movements.find((item) => item.id === id);
        if (!movement) throw new Error('找不到该记录');
        if (!MOVEMENT_TYPES.includes(type)) throw new Error('无效的记录类型');
        validateAmount(amount);
        const before = clone(movement);
        const typeLabel = { buyIn: '首次带入', topUp: '补充带入', cashOut: '带出/还码' };
        const changes = [];
        if (before.type !== type) changes.push(`类型：${typeLabel[before.type]} → ${typeLabel[type]}`);
        if (before.amount !== amount) changes.push(`数量：${before.amount} → ${amount}`);
        const editHistory = [...(movement.editHistory ?? []), { at: actionAt, changes: changes.length ? changes : ['重新保存'] }];
        Object.assign(movement, { type, amount, editHistory, updatedAt: actionAt });
        addAudit(state, 'update', 'movement', id, before, movement, actionAt);
        return clone(movement);
      });
    },
    deleteMovement(id, actionAt = now()) {
      return transact((state) => {
        const index = state.movements.findIndex((item) => item.id === id);
        if (index < 0) throw new Error('找不到该记录');
        const [movement] = state.movements.splice(index, 1);
        addAudit(state, 'delete', 'movement', id, movement, null, actionAt);
      });
    },
    setRemaining(playerId, amount, actionAt = now()) {
      return transact((state) => {
        if (!isNonNegativeInteger(amount)) throw new Error('剩余筹码必须是非负整数');
        const player = requirePlayer(state, playerId);
        const before = clone(player);
        player.remainingChips = amount;
        player.updatedAt = actionAt;
        addAudit(state, before.remainingChips === null ? 'create' : 'update', 'settlement', playerId, before, player, actionAt);
        return clone(player);
      });
    },
    setConversionRate(rate, actionAt = now()) {
      return transact((state) => {
        const parsed = rate === '' || rate === null ? null : Number(rate);
        if (parsed !== null && (!Number.isFinite(parsed) || parsed <= 0)) throw new Error('换算比例必须大于零');
        const before = { conversionRate: state.conversionRate };
        state.conversionRate = parsed;
        state.conversionChips = parsed;
        state.conversionAmount = parsed === null ? null : 1;
        addAudit(state, 'update', 'conversion', 'conversion-rate', before, { conversionRate: parsed }, actionAt);
      });
    },
    setConversion(chips, amount, actionAt = now()) {
      return transact((state) => {
        if (!Number.isFinite(chips) || chips <= 0 || !Number.isFinite(amount) || amount <= 0) {
          throw new Error('筹码和金额都必须大于零');
        }
        const before = { conversionRate: state.conversionRate, conversionChips: state.conversionChips ?? null, conversionAmount: state.conversionAmount ?? null };
        state.conversionRate = chips / amount;
        state.conversionChips = chips;
        state.conversionAmount = amount;
        addAudit(state, 'update', 'conversion', 'conversion-rate', before, { conversionRate: state.conversionRate, conversionChips: chips, conversionAmount: amount }, actionAt);
      });
    },
    deletePlayer(id, actionAt = now()) {
      return transact((state) => {
        const playerIndex = state.players.findIndex((item) => item.id === id);
        if (playerIndex < 0) throw new Error('找不到该玩家');
        const [player] = state.players.splice(playerIndex, 1);
        const relatedMovements = state.movements.filter((item) => item.playerId === id);
        state.movements = state.movements.filter((item) => item.playerId !== id);
        addAudit(state, 'delete', 'player', id, { player, movements: relatedMovements }, null, actionAt);
      });
    },
  };
}
