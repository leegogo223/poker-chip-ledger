import { emptyState, formatNumber, globalNetBuyIn, playerSummary, reconciliationSummary, settlementRankings } from './ledger.js';
import { createStore } from './store.js';

const store = createStore();
let screen = 'live';
let showNewPlayer = false;
let editingMovementId = null;
let movementModal = null;
let recordsModalPlayerId = null;
let showResultsModal = false;
let showAboveResults = true;
let showBelowResults = true;
let message = '';
let copyStatus = '';
const app = document.querySelector('#app');
const labels = { buyIn: '首次带入', topUp: '补充带入', cashOut: '带出 / 还码' };
const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const chip = (value) => `${formatNumber(value)} 筹码`;
const chipValue = (value) => formatNumber(value);
const displayTime = (value) => value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const datetimeValue = (value = new Date().toISOString()) => new Date(value).toISOString().slice(0, 16);
const money = (chips, rate) => `${(chips / rate).toFixed(2)} 元`;
const signedMoney = (chips, rate) => `${chips >= 0 ? '+' : ''}${money(chips, rate)}`;
const playerName = (state, id) => state.players.find((player) => player.id === id)?.name ?? '已删除玩家';
const movementNotes = (movement) => (movement.editHistory ?? []).map((entry) => `修改记录（${displayTime(entry.at)}）：${entry.changes.join('；')}`).join('\n');
const htmlWithBreaks = (value) => esc(value).replaceAll('\n', '<br>');
const copyTime = (value = new Date()) => new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'medium', hour12: false }).format(value);

function loadSevenPlayerDemo() {
  const timestamp = '2026-08-02T12:00:00.000Z';
  const rows = [
    ['阿明', 3500, true], ['小李', 2500, true], ['小王', 800, false],
    ['小陈', 700, false], ['小周', 600, false], ['小赵', 200, false], ['小孙', 700, false],
  ];
  store.save(emptyState());
  rows.forEach(([name, remainingChips, hasTopUp]) => {
    const player = store.addPlayer(name, timestamp);
    store.addMovement({ playerId: player.id, type: 'buyIn', amount: 1000, occurredAt: timestamp, actionAt: timestamp });
    if (hasTopUp) store.addMovement({ playerId: player.id, type: 'topUp', amount: 1000, occurredAt: timestamp, actionAt: timestamp });
    store.setRemaining(player.id, remainingChips, timestamp);
  });
  store.setConversion(100, 10, timestamp);
}

if (new URLSearchParams(window.location.search).get('demo') === '7') {
  if (window.confirm('载入 7 人演示数据会覆盖当前设备上的全部记录，是否继续？')) {
    loadSevenPlayerDemo();
    screen = 'settle';
  }
  window.history.replaceState({}, '', window.location.pathname);
}

function render() {
  const state = store.load();
  const global = globalNetBuyIn(state);
  app.innerHTML = `<main class="app"><header class="topbar"><div><p class="eyebrow">单一管理员 · 数据仅保存在本机</p><h1>筹码记录</h1></div><div class="topbar-actions"><button class="clear-records-button" type="button" data-clear-records>清空记录</button><div class="total"><p class="eyebrow">全局净带入</p><strong><span class="chip-icon" aria-hidden="true"></span>${formatNumber(global)}</strong></div></div></header><nav class="flow-nav"><button data-screen="live" class="${screen === 'live' ? 'active' : ''}">记录</button><button data-screen="settle" class="${screen === 'settle' ? 'active' : ''}">结算</button><button data-screen="ledger" class="${screen === 'ledger' ? 'active' : ''}">账本</button></nav><section class="workspace">${screen === 'live' ? live(state) : screen === 'settle' ? settlement(state) : ledger(state)}</section></main>${recordsModalPlayerId ? recordsDialog(state) : ''}${showResultsModal ? resultsDialog(state) : ''}`;
  bindEvents();
}

function live(state) {
  const recent = state.movements.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 12);
  return `<section class="flow-page"><div class="flow-heading"><div><p class="eyebrow">进行中</p><h2>筹码记录</h2><p class="muted">玩家、带入总量与补码 / 退码都在同一张表中。</p></div></div><section class="players-card"><div class="section-header"><h3>玩家 <span class="player-count">${state.players.length} 人</span></h3><div class="players-tools"><button class="copy-summary-button" type="button" data-copy-summary>${copyStatus || '一键复制'}</button></div></div>${playersTable(state)}${showNewPlayer ? newPlayerEntry() : ''}<p class="error">${esc(message)}</p></section>${state.players.length ? `<section class="timeline"><div class="section-header"><div><p class="eyebrow">最近动作</p><h3>全局时间线</h3></div><button class="text-button" data-screen="ledger">查看全部记录 →</button></div>${recent.length ? recent.map((movement) => timelineItem(state, movement)).join('') : '<p class="muted">还没有筹码流水。</p>'}</section>` : '<section class="empty"><h3>先在上方新增玩家</h3><p class="muted">添加后即可记录首次带入、补码或退码。</p></section>'}</section>`;
}

function movementForm(state) {
  return `<form id="movement-form" class="movement-form"><label>玩家<select name="playerId" required><option value="">选择玩家</option>${state.players.map((player) => `<option value="${player.id}">${esc(player.name)}</option>`).join('')}</select></label><fieldset><legend>本次动作</legend><label class="choice"><input type="radio" name="type" value="topUp" checked /><span>+ 补充带入</span></label><label class="choice"><input type="radio" name="type" value="cashOut" /><span>− 带出 / 还码</span></label></fieldset><label>筹码数量<input name="amount" type="number" min="1" step="1" required inputmode="numeric" placeholder="例如 500" /></label><label>发生时间<input name="occurredAt" type="datetime-local" required value="${datetimeValue()}" /></label><button class="button primary-action" type="submit">确认记录</button><p class="error">${esc(message)}</p></form>`;
}

function playersTable(state) {
  return `<div class="table-wrap"><table class="table players-table"><thead><tr><th>序号</th><th>玩家名称</th><th>操作选项</th><th>带入总量</th><th>补码次数</th></tr></thead><tbody>${state.players.map((player, index) => movementModal?.playerId === player.id ? quickMovementRow(state, player, index) : playerRow(state, player, index)).join('')}${showNewPlayer ? '' : '<tr class="add-player-row"><td colspan="5"><button class="action-tab add-player-tab" type="button" data-open-player>＋ 新增玩家</button></td></tr>'}</tbody></table></div>`;
}

function newPlayerEntry() {
  return `<form id="new-player-entry" class="new-player-entry"><label>玩家名称<input name="name" maxlength="30" autofocus required placeholder="填写玩家名称" /></label><label>首次带入（可选）<input name="initial" type="number" min="1" step="1" placeholder="不填也可以" /></label><button class="button" type="submit">保存</button><button class="cancel-player-button" type="button" data-close-player>取消</button></form>`;
}

function playerRow(state, player, index) {
  const summary = playerSummary(player, state.movements);
  return `<tr><td>${index + 1}</td><td><strong class="player-name" title="${esc(player.name)}">${esc(player.name)}</strong></td><td><button class="action-tab top-up-tab" data-quick="${player.id}:topUp">补码</button><button class="action-tab cash-out-tab" data-quick="${player.id}:cashOut">退码</button></td><td><button class="record-total-link" data-view-records="${player.id}">${formatNumber(summary.netBuyIn)}</button></td><td>${summary.topUpCount} 次</td></tr>`;
}

function quickMovementRow(state, player, index) {
  const label = movementModal.type === 'topUp' ? '补码' : '退码';
  const theme = movementModal.type === 'topUp' ? 'top-up-entry' : 'cash-out-entry';
  return `<tr class="quick-movement-row"><td colspan="5"><form id="quick-movement" class="quick-movement-entry ${theme}"><div class="quick-movement-info"><strong>${index + 1} · ${esc(player.name)} · ${label}</strong><small>填写本次筹码数量</small></div><label>筹码数量<input name="amount" type="number" min="1" step="1" inputmode="numeric" required autofocus placeholder="请输入数量" /></label><button class="button quick-save-button" type="submit">保存${label}</button><button class="cancel-player-button" type="button" data-close-quick>取消</button></form></td></tr>`;
}

function recordsDialog(state) {
  const player = state.players.find((item) => item.id === recordsModalPlayerId);
  if (!player) return '';
  const chronological = state.movements
    .filter((item) => item.playerId === player.id && ['buyIn', 'topUp', 'cashOut'].includes(item.type))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const typeCounts = { topUp: 0, cashOut: 0 };
  const records = chronological.map((item) => ({ ...item, occurrence: item.type === 'buyIn' ? null : ++typeCounts[item.type] })).reverse();
  const actionName = (item) => item.type === 'buyIn' ? '首次带入' : `第 ${item.occurrence} 次${item.type === 'topUp' ? '补码' : '退码'}`;
  return `<div class="modal-backdrop" data-close-records><section class="modal records-modal" role="dialog" aria-modal="true" aria-labelledby="records-title"><div class="section-header"><div><p class="eyebrow">${esc(player.name)}</p><h2 id="records-title">带入记录</h2></div><button class="text-button" type="button" data-close-records aria-label="关闭">×</button></div><div class="table-wrap"><table class="table"><thead><tr><th>动作</th><th>数量</th><th>时间</th></tr></thead><tbody>${records.map((item) => `<tr><td>${actionName(item)}</td><td>${chip(item.amount)}</td><td>${displayTime(item.occurredAt)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">暂无带入、补码或退码记录。</td></tr>'}</tbody></table></div></section></div>`;
}

function timelineItem(state, movement) {
  const direction = movement.type === 'cashOut' ? 'out' : 'in';
  return `<article class="timeline-item ${direction}"><span class="timeline-mark">${direction === 'out' ? '−' : '+'}</span><div><strong>${esc(playerName(state, movement.playerId))} · ${labels[movement.type]}</strong><p>${chip(movement.amount)}</p></div><time>${displayTime(movement.occurredAt)}</time></article>`;
}

function settlement(state) {
  const rate = state.conversionRate;
  const reconciliation = reconciliationSummary(state);
  const conversionChips = state.conversionChips ?? rate ?? '';
  const conversionAmount = state.conversionAmount ?? (rate ? 1 : '');
  return `<section class="flow-page"><div class="flow-heading"><div><p class="eyebrow">牌局结束</p><h2>依次录入每位玩家的剩余筹码</h2><p class="muted">填完一行就保存一行；系统会立即计算盈亏。金额换算为可选设置。</p></div></div>${message ? `<p class="error settlement-error">${esc(message)}</p>` : ''}<div class="settlement-top-row"><section class="conversion-section"><h3>换算比例</h3><div class="conversion-panel"><form id="conversion-form" class="conversion-form"><label>筹码<input name="chips" type="text" inputmode="decimal" value="${conversionChips}" placeholder="筹码数" /></label><strong class="conversion-equals">=</strong><label>金额<input name="amount" type="text" inputmode="decimal" value="${conversionAmount}" placeholder="金额数" /></label><button class="clear-rate-button" type="button" data-clear-rate>清除</button><button class="button" type="submit">保存</button></form></div></section>${reconciliationCard(reconciliation)}</div><div class="settlement-list">${state.players.map((player) => settlementRow(state, player, rate)).join('')}</div></section>`;
}

function reconciliationCard(summary) {
  const result = summary.isBalanced ? '已平' : summary.allSettled ? '账不平' : '待结算';
  return `<section class="reconciliation-card"><span>累计水上 <strong>${chipValue(summary.totalAbove)}</strong></span><span>累计水下 <strong>${chipValue(summary.totalBelow)}</strong></span><span>核验结果 <strong class="${summary.isBalanced ? 'positive' : summary.allSettled ? 'negative' : 'muted'}">${result}</strong></span>${summary.isBalanced ? '<button class="result-overview-button" type="button" data-open-results>结果总揽</button>' : ''}</section>`;
}

function resultsDialog(state) {
  const rankings = settlementRankings(state);
  const rate = state.conversionRate;
  return `<div class="modal-backdrop" data-close-results><section class="modal results-modal" role="dialog" aria-modal="true" aria-labelledby="results-title"><div class="section-header"><div><p class="eyebrow">结算完成</p><h2 id="results-title">结果总揽</h2></div><button class="text-button" type="button" data-close-results aria-label="关闭">×</button></div><div class="result-filters"><label><input type="checkbox" data-result-filter="above" ${showAboveResults ? 'checked' : ''} /> 显示水上排序</label><label><input type="checkbox" data-result-filter="below" ${showBelowResults ? 'checked' : ''} /> 显示水下排序</label></div>${showAboveResults ? rankingTable('水上排序', rankings.above, rate, 'positive') : ''}${showBelowResults ? rankingTable('水下排序', rankings.below, rate, 'negative') : ''}${!showAboveResults && !showBelowResults ? '<p class="muted">请至少勾选一种排序。</p>' : ''}</section></div>`;
}

function rankingTable(title, rows, rate, tone) {
  return `<section class="ranking-section"><h3 class="${tone}">${title}</h3><div class="table-wrap"><table class="table"><thead><tr><th>序号</th><th>名称</th><th>结算数额</th></tr></thead><tbody>${rows.map((row, index) => `<tr><td>${index + 1}</td><td>${esc(row.player.name)}</td><td class="${tone}">${row.profitLoss > 0 ? '+' : ''}${chipValue(row.profitLoss)}${rate ? `<small class="${tone}">（${signedMoney(row.profitLoss, rate)}）</small>` : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">暂无玩家。</td></tr>'}</tbody></table></div></section>`;
}

function settlementRow(state, player, rate) {
  const summary = playerSummary(player, state.movements);
  const settled = player.remainingChips !== null;
  return `<div class="settlement-row" data-settlement="${player.id}"><div><strong>${esc(player.name)}</strong><small>净带入 ${chipValue(summary.netBuyIn)}</small></div><label>剩余筹码<input name="remaining" type="text" inputmode="numeric" value="${settled ? summary.remainingChips : ''}" placeholder="未填写" /></label><div class="result"><span>盈亏</span><strong class="${summary.profitLoss >= 0 ? 'positive' : 'negative'}">${settled ? `${summary.profitLoss >= 0 ? '+' : ''}${chipValue(summary.profitLoss)}` : '—'}</strong>${settled && rate ? `<small class="${summary.profitLoss >= 0 ? 'positive' : 'negative'}">${signedMoney(summary.profitLoss, rate)}</small>` : ''}</div></div>`;
}

function ledger(state) {
  const movements = state.movements.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const editing = movements.find((item) => item.id === editingMovementId);
  return `<section class="flow-page"><div class="flow-heading"><div><p class="eyebrow">回查与修正</p><h2>账本与操作记录</h2><p class="muted">日常记账在“进行中”，这里用于核对和修改历史数据；每次修改会保留在备注记录中。</p></div></div>${editing ? editForm(state, editing) : ''}<section class="table-panel"><h3>全部流水</h3><div class="table-wrap"><table class="table ledger-table"><thead><tr><th>发生时间</th><th>玩家</th><th>动作</th><th>数量</th><th>操作</th><th>备注</th></tr></thead><tbody>${movements.map((item) => `<tr><td>${displayTime(item.occurredAt)}</td><td>${esc(playerName(state, item.playerId))}</td><td>${labels[item.type]}</td><td>${chipValue(item.amount)}</td><td><button class="edit-record-button" data-edit-movement="${item.id}">修改</button></td><td class="movement-notes">${htmlWithBreaks(movementNotes(item)) || '—'}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">暂无流水。</td></tr>'}</tbody></table></div></section></section>`;
}

function editForm(state, movement) {
  return `<section class="edit-panel"><div class="section-header"><h3>修改流水</h3><button class="text-button" data-cancel-edit>取消</button></div><form id="edit-movement" class="compact-form"><label>类型<select name="type">${Object.entries(labels).map(([value, label]) => `<option value="${value}" ${movement.type === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>数量<input name="amount" type="number" min="1" step="1" value="${movement.amount}" required /></label><label>发生时间<input name="occurredAt" type="datetime-local" value="${datetimeValue(movement.occurredAt)}" required /></label><button class="button" type="submit">保存修改</button><p class="error">${esc(message)}</p></form></section>`;
}

function audit(state) { return `<details class="audit"><summary>查看管理审计记录（${state.audit.length}）</summary>${state.audit.slice().reverse().map((item) => `<article class="audit-item"><strong>${item.action === 'create' ? '新增' : item.action === 'update' ? '修改' : '删除'} ${item.targetType}</strong> · ${displayTime(item.at)}<details><summary>查看前后数据</summary><pre>操作前：${esc(JSON.stringify(item.before, null, 2))}\n操作后：${esc(JSON.stringify(item.after, null, 2))}</pre></details></article>`).join('') || '<p class="muted">尚无操作。</p>'}</details>`; }

function bindEvents() {
  document.querySelectorAll('[data-screen]').forEach((button) => button.addEventListener('click', () => { screen = button.dataset.screen; editingMovementId = null; message = ''; render(); }));
  document.querySelector('[data-open-player]')?.addEventListener('click', () => { showNewPlayer = true; message = ''; render(); });
  document.querySelector('[data-close-player]')?.addEventListener('click', () => closeNewPlayer());
  document.querySelector('#new-player-entry')?.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(event.currentTarget));
      const player = store.addPlayer(data.name);
      if (data.initial) store.addMovement({ playerId: player.id, type: 'buyIn', amount: Number(data.initial) });
      message = '';
      closeNewPlayer();
    } catch (error) {
      message = error.message;
      render();
    }
  });
  document.querySelectorAll('[data-quick]').forEach((button) => button.addEventListener('click', () => { const [playerId, type] = button.dataset.quick.split(':'); showNewPlayer = false; movementModal = { playerId, type }; message = ''; render(); }));
  document.querySelectorAll('[data-view-records]').forEach((button) => button.addEventListener('click', () => { recordsModalPlayerId = button.dataset.viewRecords; render(); }));
  document.querySelector('#quick-movement')?.addEventListener('submit', (event) => run(event, () => { const amount = Number(new FormData(event.currentTarget).get('amount')); store.addMovement({ playerId: movementModal.playerId, type: movementModal.type, amount }); movementModal = null; }));
  document.querySelector('[data-close-quick]')?.addEventListener('click', () => { movementModal = null; message = ''; render(); });
  document.querySelectorAll('[data-close-records]').forEach((element) => element.addEventListener('click', (event) => { if (element !== event.currentTarget || event.target === element) { recordsModalPlayerId = null; render(); } }));
  document.querySelector('[data-open-results]')?.addEventListener('click', () => { showResultsModal = true; render(); });
  document.querySelectorAll('[data-close-results]').forEach((element) => element.addEventListener('click', (event) => { if (element !== event.currentTarget || event.target === element) { showResultsModal = false; render(); } }));
  document.querySelectorAll('[data-result-filter]').forEach((input) => input.addEventListener('change', () => { if (input.dataset.resultFilter === 'above') showAboveResults = input.checked; else showBelowResults = input.checked; render(); }));
  document.querySelector('#movement-form')?.addEventListener('submit', (event) => run(event, () => { const data = Object.fromEntries(new FormData(event.currentTarget)); store.addMovement({ ...data, amount: Number(data.amount), occurredAt: new Date(data.occurredAt).toISOString() }); }));
  document.querySelector('#conversion-form')?.addEventListener('submit', (event) => run(event, () => { const data = Object.fromEntries(new FormData(event.currentTarget)); store.setConversion(Number(data.chips), Number(data.amount)); }));
  document.querySelector('[data-clear-rate]')?.addEventListener('click', () => run(null, () => store.setConversionRate('')));
  document.querySelectorAll('[data-settlement] input[name="remaining"]').forEach((input) => {
    input.addEventListener('blur', () => {
      if (!input.value.trim()) return;
      run(null, () => store.setRemaining(input.closest('[data-settlement]').dataset.settlement, Number(input.value)));
    });
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
    });
  });
  document.querySelectorAll('[data-edit-movement]').forEach((button) => button.addEventListener('click', () => { editingMovementId = button.dataset.editMovement; message = ''; render(); }));
  document.querySelector('[data-cancel-edit]')?.addEventListener('click', () => { editingMovementId = null; message = ''; render(); });
  document.querySelector('#edit-movement')?.addEventListener('submit', (event) => run(event, () => { const data = Object.fromEntries(new FormData(event.currentTarget)); store.updateMovement(editingMovementId, { ...data, amount: Number(data.amount), occurredAt: new Date(data.occurredAt).toISOString() }); editingMovementId = null; }));
  document.querySelector('[data-copy-summary]')?.addEventListener('click', () => copySummary(store.load()));
  document.querySelector('[data-clear-records]')?.addEventListener('click', () => clearAllRecords());
}
function run(event, action) { event?.preventDefault(); try { message = ''; action(); } catch (error) { message = error.message; } render(); }
function summaryText(state, at = new Date(), includeSettlement = false) {
  const rows = state.players.map((player) => {
    const summary = playerSummary(player, state.movements);
    return `${player.name}｜${formatNumber(summary.netBuyIn)}｜${summary.topUpCount}`;
  });
  const result = ['当前带入情况：', `截止统计时间：${copyTime(at)}`, '玩家名称｜带入总量｜补码次数', ...rows];
  const settledPlayers = state.players.filter((player) => player.remainingChips !== null);
  if (includeSettlement && settledPlayers.length) {
    const rate = state.conversionRate;
    result.push('', '结算情况：', `玩家名称｜剩余筹码｜盈亏筹码${rate ? '｜盈亏金额' : ''}`);
    settledPlayers.forEach((player) => {
      const summary = playerSummary(player, state.movements);
      const profit = `${summary.profitLoss >= 0 ? '+' : ''}${formatNumber(summary.profitLoss)}`;
      result.push(`${player.name}｜${formatNumber(player.remainingChips)}｜${profit}${rate ? `｜${signedMoney(summary.profitLoss, rate)}` : ''}`);
    });
  }
  return result.join('\n');
}
async function copySummary(state) {
  try {
    await copyText(summaryText(state));
    copyStatus = '已复制';
    message = '';
  } catch {
    copyStatus = '';
    message = '复制失败，请检查浏览器是否允许访问剪贴板';
  }
  render();
  if (copyStatus) window.setTimeout(() => { copyStatus = ''; render(); }, 1600);
}
async function copyText(text) {
  if (navigator.clipboard?.writeText && window.isSecureContext) return navigator.clipboard.writeText(text);
  const field = document.createElement('textarea');
  field.value = text;
  field.setAttribute('readonly', '');
  field.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
  document.body.append(field);
  field.select();
  const copied = document.execCommand('copy');
  field.remove();
  if (!copied) throw new Error('复制失败');
}
async function clearAllRecords() {
  const state = store.load();
  if (!window.confirm('将先复制当前记录，然后清空本机全部数据。是否继续？')) return;
  if (!window.confirm('再次确认：清空后无法恢复当前记录，是否确定清空？')) return;
  let copied = true;
  try {
    await copyText(summaryText(state, new Date(), true));
  } catch {
    copied = false;
  }
  store.save(emptyState());
  screen = 'live';
  showNewPlayer = false;
  editingMovementId = null;
  movementModal = null;
  recordsModalPlayerId = null;
  showResultsModal = false;
  copyStatus = '';
  message = '';
  render();
  window.alert(copied ? '记录已清空，清空前的数据已复制到剪贴板。' : '记录已清空，但浏览器未能复制数据。');
}
function closeNewPlayer() {
  showNewPlayer = false;
  message = '';
  render();
}
render();
