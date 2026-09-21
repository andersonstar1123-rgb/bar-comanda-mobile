import * as SQLite from 'expo-sqlite/next';
import { SyncItem } from '@/types';

const db = SQLite.openDatabaseSync('bar_comanda_offline.db');

const DDL_STATEMENTS: string[] = [
  `PRAGMA journal_mode = WAL;`,
  `CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      entidade TEXT NOT NULL,
      acao TEXT NOT NULL,
      dados TEXT NOT NULL,
      id_local TEXT,
      timestamp TEXT NOT NULL,
      tentativas INTEGER DEFAULT 0,
      criado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE TABLE IF NOT EXISTS offline_comandas (
      id TEXT PRIMARY KEY,
      id_local TEXT UNIQUE,
      mesa_id TEXT NOT NULL,
      usuario_id TEXT NOT NULL,
      status TEXT DEFAULT 'aberta',
      total REAL DEFAULT 0,
      observacao TEXT,
      aberto_em TEXT,
      sincronizado INTEGER DEFAULT 0
    );`,
  `CREATE TABLE IF NOT EXISTS offline_itens (
      id TEXT PRIMARY KEY,
      id_local TEXT UNIQUE,
      comanda_id TEXT NOT NULL,
      comanda_id_local TEXT,
      produto_id TEXT NOT NULL,
      quantidade INTEGER NOT NULL,
      preco_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      observacao TEXT,
      status TEXT DEFAULT 'pendente',
      sincronizado INTEGER DEFAULT 0
    );`,
  `CREATE TABLE IF NOT EXISTS offline_pagamentos (
      id TEXT PRIMARY KEY,
      id_local TEXT UNIQUE,
      comanda_id TEXT NOT NULL,
      comanda_id_local TEXT,
      forma TEXT NOT NULL,
      valor REAL NOT NULL,
      troco REAL DEFAULT 0,
      referencia TEXT,
      sincronizado INTEGER DEFAULT 0
    );`,
  `CREATE TABLE IF NOT EXISTS cached_data (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em DATETIME DEFAULT CURRENT_TIMESTAMP
    );`,
  `CREATE INDEX IF NOT EXISTS idx_sync_queue_tentativas ON sync_queue(tentativas);`,
  `CREATE INDEX IF NOT EXISTS idx_offline_comandas ON offline_comandas(sincronizado);`
];

export function initOfflineDB() {
  for (const stmt of DDL_STATEMENTS) {
    try {
      db.execSync(stmt);
    } catch (err) {
      console.warn('initOfflineDB: statement ignorado', stmt.slice(0, 40), err);
    }
  }
}

function makeUUID(): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = (globalThis as any).crypto;
  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    '$1-$2-$3-$4-$5'
  );
}

export function addToSyncQueue(item: Omit<SyncItem, 'id' | 'tentativas'>) {
  const id = makeUUID();
  db.runSync(
    'INSERT INTO sync_queue (id, entidade, acao, dados, id_local, timestamp) VALUES (?, ?, ?, ?, ?, ?)',
    [id, item.entidade, item.acao, JSON.stringify(item.dados), item.id_local, item.timestamp]
  );
  return id;
}

export function getSyncQueue(limit = 50) {
  return db.getAllSync<SyncItem & { id: string; tentativas: number }>(
    'SELECT * FROM sync_queue ORDER BY rowid LIMIT ?',
    [limit]
  );
}

export function removeFromSyncQueue(id: string) {
  db.runSync('DELETE FROM sync_queue WHERE id = ?', [id]);
}

export function removeFromSyncQueueByIdLocal(idLocal: string) {
  db.runSync('DELETE FROM sync_queue WHERE id_local = ?', [idLocal]);
}

export function incrementSyncAttempts(id: string) {
  db.runSync('UPDATE sync_queue SET tentativas = tentativas + 1 WHERE id = ?', [id]);
}

export function incrementSyncAttemptsByIdLocal(idLocal: string) {
  db.runSync('UPDATE sync_queue SET tentativas = tentativas + 1 WHERE id_local = ?', [idLocal]);
}

export function saveOfflineComanda(comanda: any) {
  db.runSync(
    `INSERT OR REPLACE INTO offline_comandas (id, id_local, mesa_id, usuario_id, status, total, observacao, aberto_em, sincronizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [comanda.id, comanda.id_local, comanda.mesa_id, comanda.usuario_id, comanda.status, comanda.total, comanda.observacao, comanda.aberto_em, comanda.sincronizado ? 1 : 0]
  );
}

export function getOfflineComandas(): any[] {
  return db.getAllSync<any>('SELECT * FROM offline_comandas WHERE sincronizado = 0');
}

export function getOfflineComandaPorId(id: string): any {
  return db.getFirstSync<any>('SELECT * FROM offline_comandas WHERE id = ?', [id]) || null;
}

export function getOfflineItensPorComanda(comandaId: string): any[] {
  return db.getAllSync<any>(
    'SELECT * FROM offline_itens WHERE comanda_id = ? AND sincronizado = 0',
    [comandaId]
  );
}

export function getOfflinePagamentosPorComanda(comandaId: string): any[] {
  return db.getAllSync<any>(
    'SELECT * FROM offline_pagamentos WHERE comanda_id = ? AND sincronizado = 0',
    [comandaId]
  );
}

export function fusionarComandasAbertas(mesas: any[]): any[] {
  if (!Array.isArray(mesas)) return mesas;
  const abertas = getOfflineComandas().filter((c: any) => c.status === 'aberta');
  if (abertas.length === 0) return mesas;
  const porMesa: Record<string, string> = {};
  for (const c of abertas) {
    if (c.mesa_id && !porMesa[c.mesa_id]) porMesa[c.mesa_id] = c.id;
  }
  return mesas.map(m => {
    const comandaAberta = porMesa[m.id];
    return comandaAberta
      ? { ...m, status: 'ocupada', comanda_aberta_id: comandaAberta }
      : m;
  });
}

export function markComandaSynced(id_local: string, id_servidor: string) {
  db.runSync('UPDATE offline_comandas SET id = ?, sincronizado = 1 WHERE id_local = ? OR id = ?', [id_servidor, id_local, id_local]);
}

export function saveOfflineItem(item: any) {
  db.runSync(
    `INSERT OR REPLACE INTO offline_itens (id, id_local, comanda_id, comanda_id_local, produto_id, quantidade, preco_unitario, subtotal, observacao, status, sincronizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [item.id, item.id_local, item.comanda_id, item.comanda_id_local, item.produto_id, item.quantidade, item.preco_unitario, item.subtotal, item.observacao, item.status, item.sincronizado ? 1 : 0]
  );
}

export function getOfflineItens() {
  return db.getAllSync('SELECT * FROM offline_itens WHERE sincronizado = 0');
}

export function markItemSynced(id_local: string, id_servidor: string) {
  db.runSync('UPDATE offline_itens SET id = ?, sincronizado = 1 WHERE id_local = ? OR id = ?', [id_servidor, id_local, id_local]);
}

export function saveOfflinePagamento(pagamento: any) {
  db.runSync(
    `INSERT OR REPLACE INTO offline_pagamentos (id, id_local, comanda_id, comanda_id_local, forma, valor, troco, referencia, sincronizado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [pagamento.id, pagamento.id_local, pagamento.comanda_id, pagamento.comanda_id_local, pagamento.forma, pagamento.valor, pagamento.troco, pagamento.referencia, pagamento.sincronizado ? 1 : 0]
  );
}

export function getOfflinePagamentos() {
  return db.getAllSync('SELECT * FROM offline_pagamentos WHERE sincronizado = 0');
}

export function markPagamentoSynced(id_local: string, id_servidor: string) {
  db.runSync('UPDATE offline_pagamentos SET id = ?, sincronizado = 1 WHERE id_local = ? OR id = ?', [id_servidor, id_local, id_local]);
}

export function removerOfflineComandaLocal(comandaId: string) {
  db.runSync('DELETE FROM offline_itens WHERE comanda_id = ?', [comandaId]);
  db.runSync('DELETE FROM offline_itens WHERE comanda_id_local = ?', [comandaId]);
  db.runSync('DELETE FROM offline_pagamentos WHERE comanda_id = ?', [comandaId]);
  db.runSync('DELETE FROM offline_pagamentos WHERE comanda_id_local = ?', [comandaId]);
  db.runSync('DELETE FROM offline_comandas WHERE id = ? OR id_local = ?', [comandaId, comandaId]);
}

export function cacheData(chave: string, valor: any) {
  db.runSync('INSERT OR REPLACE INTO cached_data (chave, valor) VALUES (?, ?)', [chave, JSON.stringify(valor)]);
}

export function getCachedData<T>(chave: string): T | null {
  const row = db.getFirstSync<{ valor: string }>('SELECT valor FROM cached_data WHERE chave = ?', [chave]);
  return row ? JSON.parse(row.valor) : null;
}

export function clearSyncedData() {
  db.runSync('DELETE FROM sync_queue WHERE tentativas > 5');
  db.runSync("DELETE FROM offline_comandas WHERE sincronizado = 1 AND id_local IS NOT NULL AND status = 'fechada'");
  db.runSync('DELETE FROM offline_itens WHERE sincronizado = 1 AND id_local IS NOT NULL');
  db.runSync('DELETE FROM offline_pagamentos WHERE sincronizado = 1 AND id_local IS NOT NULL');
}

export default db;