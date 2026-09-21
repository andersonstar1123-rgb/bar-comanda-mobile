import { api } from './api';
import * as Network from 'expo-network';
import {
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueueByIdLocal,
  incrementSyncAttemptsByIdLocal,
  getOfflineComandas,
  getOfflineItens,
  getOfflinePagamentos,
  markComandaSynced,
  markItemSynced,
  markPagamentoSynced,
  cacheData,
  getCachedData,
  clearSyncedData
} from './offlineDB';
import { SyncItem } from '@/types';
import { useStore } from '@/store';

let syncInterval: ReturnType<typeof setInterval> | null = null;
let cadeiaSync: Promise<any> = Promise.resolve();
let isSyncing = false;

function enfileirar(fn: () => Promise<any>): Promise<any> {
  const prox = cadeiaSync.then(fn, fn);
  cadeiaSync = prox.catch(() => {});
  return prox;
}

export function atualizarPendentes() {
  try {
    const { setPendingSync } = useStore.getState();
    const total = getSyncQueue(100000).length;
    setPendingSync(total);
  } catch {
    // ignora se o store ainda não inicializou
  }
}

export async function isOnline(): Promise<boolean> {
  try {
    const networkState = await Network.getNetworkStateAsync();
    if (!(networkState?.isConnected ?? false)) return false;

    const raiz = api.defaults.baseURL?.replace(/\/api\/?$/, '') || '';
    if (!raiz) return false;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await fetch(`${raiz}/health`, { method: 'GET', signal: controller.signal });
      return response.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

export function pushSync() {
  return enfileirar(async () => {
    try {
      const queue = getSyncQueue(50);
      if (queue.length === 0) return [];

      const parseDados = (d: any) => {
        if (typeof d !== 'string') return d;
        try { return JSON.parse(d); } catch { return d; }
      };

      const entidades = queue.map(item => ({
        entidade: item.entidade,
        acao: item.acao,
        dados: parseDados(item.dados),
        id_local: item.id_local,
        timestamp: item.timestamp
      }));

      const response = await api.post('/sync/push', { entidades });

      for (const resultado of response.data.resultados) {
        if (resultado.id_servidor && resultado.id_local) {
          switch (resultado.acao) {
            case 'criada':
              markComandaSynced(resultado.id_local, resultado.id_servidor);
              const st = useStore.getState();
              const atual = st.comandaAtual;
              if (atual && (atual.id === resultado.id_local || atual.id_local === resultado.id_local)) {
                st.setComandaAtual({ ...atual, id: resultado.id_servidor, id_local: resultado.id_servidor });
              }
              break;
            case 'fechada':
            case 'reaberta':
              markComandaSynced(resultado.id_local, resultado.id_servidor);
              break;
            case 'adicionado':
            case 'atualizado':
            case 'cancelado':
              markItemSynced(resultado.id_local, resultado.id_servidor);
              break;
            case 'criado':
              markPagamentoSynced(resultado.id_local, resultado.id_servidor);
              break;
          }
        }
        removeFromSyncQueueByIdLocal(resultado.id_local);
      }

      for (const erro of response.data.erros) {
        incrementSyncAttemptsByIdLocal(erro.id_local);
      }

      return response.data.resultados || [];
    } catch (err: any) {
      console.warn('pushSync: sem conexão/erro', err.code || err.message);
      return [];
    } finally {
      atualizarPendentes();
    }
  });
}

export async function forcarSyncAgora() {
  const online = await isOnline();
  if (!online) return false;
  await fullSync();
  return true;
}

export async function pullSync() {
  if (isSyncing) return;
  isSyncing = true;

  try {
    const response = await api.get('/sync/pull', { 
      params: { desde: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() }
    });

    const { dados } = response.data;

    if (Array.isArray(dados.configuracoes) && dados.configuracoes.length > 0) {
      const obj: Record<string, string | number | boolean> = {};
      for (const r of dados.configuracoes) {
        let valor: string | number | boolean = r.valor;
        if (r.tipo === 'boolean') valor = r.valor === '1';
        else if (r.tipo === 'number') valor = parseFloat(r.valor);
        obj[r.chave] = valor;
      }
      cacheData('configuracoes', obj);
      useStore.getState().setConfiguracoes(obj as any);
    }
    if (dados.categorias) cacheData('categorias', dados.categorias);
    if (dados.produtos) cacheData('produtos', dados.produtos);
    if (dados.mesas) cacheData('mesas', dados.mesas);
    if (dados.comandas) cacheData('comandas', dados.comandas);
    if (dados.itens_comanda) cacheData('itens_comanda', dados.itens_comanda);
    if (dados.pagamentos) cacheData('pagamentos', dados.pagamentos);

    const store = useStore.getState();
    if (dados.mesas && Array.isArray(dados.mesas)) {
      store.setMesas(dados.mesas);
    }
    if (dados.categorias && Array.isArray(dados.categorias)) {
      const categoriasComProdutos = dados.categorias.map((cat: any) => ({
        ...cat,
        produtos: (dados.produtos || []).filter((p: any) => p.categoria_id === cat.id) || []
      }));
      store.setCategorias(categoriasComProdutos);
    }
  } catch (err) {
    console.error('Erro no pull sync:', err);
  } finally {
    isSyncing = false;
  }
}

export async function fullSync() {
  await pushSync();
  await pullSync();
  clearSyncedData();
}

export function startAutoSync(intervalMs = 30000) {
  if (syncInterval) return;
  
  syncInterval = setInterval(async () => {
    const online = await isOnline();
    if (online) {
      await fullSync();
    }
  }, intervalMs);
}

export function stopAutoSync() {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
  }
}

export async function queueComandaCreate(comanda: any) {
  const id_local = comanda.id_local || comanda.id || `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addToSyncQueue({
    entidade: 'comandas',
    acao: 'criar',
    dados: { ...comanda, id_local },
    id_local,
    timestamp: new Date().toISOString()
  });
  return id_local;
}

export async function queueComandaClose(comandaId: string) {
  const id_local = `close_${Date.now()}`;
  addToSyncQueue({
    entidade: 'comandas',
    acao: 'fechar',
    dados: { id: comandaId },
    id_local,
    timestamp: new Date().toISOString()
  });
}

export async function queueItemAdd(item: any) {
  const id_local = item.id_local || item.id || `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addToSyncQueue({
    entidade: 'itens_comanda',
    acao: 'adicionar',
    dados: { ...item, id_local },
    id_local,
    timestamp: new Date().toISOString()
  });
  return id_local;
}

export async function queueItemUpdate(item: any) {
  const id_local = item.id_local || item.id || `upd_${Date.now()}`;
  addToSyncQueue({
    entidade: 'itens_comanda',
    acao: 'atualizar',
    dados: { ...item, id_local },
    id_local,
    timestamp: new Date().toISOString()
  });
}

export async function queueItemCancel(itemId: string, comandaId: string) {
  const id_local = `cancel_${Date.now()}`;
  addToSyncQueue({
    entidade: 'itens_comanda',
    acao: 'cancelar',
    dados: { id: itemId, comanda_id: comandaId },
    id_local,
    timestamp: new Date().toISOString()
  });
}

export async function queuePagamentoCreate(pagamento: any) {
  const id_local = pagamento.id_local || pagamento.id || `pag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  addToSyncQueue({
    entidade: 'pagamentos',
    acao: 'criar',
    dados: { ...pagamento, id_local },
    id_local,
    timestamp: new Date().toISOString()
  });
  return id_local;
}

export { getCachedData, cacheData };