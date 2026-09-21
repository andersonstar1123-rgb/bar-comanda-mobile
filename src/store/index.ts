import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Comanda, ItemComanda, Mesa, Produto, Categoria, Configuracoes } from '@/types';
import { queueComandaCreate, queueComandaClose, queueItemAdd, queueItemUpdate, queueItemCancel, queuePagamentoCreate, pushSync, atualizarPendentes, getCachedData, cacheData } from '@/services/sync';
import { initOfflineDB, saveOfflineComanda, saveOfflineItem, saveOfflinePagamento, getOfflineComandas, getOfflineComandaPorId, removerOfflineComandaLocal, fusionarComandasAbertas } from '@/services/offlineDB';
import * as SecureStore from 'expo-secure-store';

interface AppState {
  // Config
  configuracoes: Configuracoes | null;
  setConfiguracoes: (c: Configuracoes) => void;
  
  // Mesas
  mesas: Mesa[];
  setMesas: (m: Mesa[]) => void;
  mesasLivres: () => Mesa[];
  
  // Categorias/Produtos
  categorias: Categoria[];
  setCategorias: (c: Categoria[]) => void;
  produtosPorCategoria: (catId: string) => Produto[];
  
  // Comanda atual
  comandaAtual: Comanda | null;
  setComandaAtual: (c: Comanda | null) => void;
  abrirComanda: (mesa: Mesa, clienteNome?: string) => Promise<Comanda>;
  fecharComanda: () => Promise<void>;
  fecharMesa: (mesa: Mesa) => Promise<boolean>;
  adicionarItem: (produto: Produto, quantidade: number, observacao?: string) => Promise<void>;
  atualizarItem: (itemId: string, updates: Partial<ItemComanda>) => Promise<void>;
  cancelarItem: (itemId: string) => Promise<void>;
  recalcularTotal: () => void;
  
  // Pagamentos
  adicionarPagamento: (forma: string, valor: number, troco?: number, referencia?: string) => Promise<void>;
  
  // Offline
  isOnline: boolean;
  setIsOnline: (v: boolean) => void;
  pendingSync: number;
  setPendingSync: (n: number) => void;
  
  // Cache loading
  loadCache: () => Promise<void>;
}

function novoIdLocal(prefixo: string): string {
  return `${prefixo}_${Date.now()}_${Math.random().toString(36).substr(2, 7)}`;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      configuracoes: null,
      setConfiguracoes: (c) => set({ configuracoes: c }),

      categorias: [],
      mesas: [],

      setMesas: (m) => set({ mesas: fusionarComandasAbertas(Array.isArray(m) ? m : []) }),
      mesasLivres: () => (get().mesas || []).filter(m => m && m.status === 'livre'),
      setCategorias: (c) => set({ categorias: c }),
      produtosPorCategoria: (catId) => get().categorias.find(c => c.id === catId)?.produtos || [],
      
      comandaAtual: null,
      setComandaAtual: (c) => set({ comandaAtual: c }),
      
      abrirComanda: async (mesa, clienteNome) => {
        const userJson = await SecureStore.getItemAsync('user');
        const user = userJson ? JSON.parse(userJson) : null;
        const idComanda = novoIdLocal('local');
        const comanda: Comanda = {
          id: idComanda,
          id_local: idComanda,
          mesa_id: mesa.id,
          usuario_id: user?.id || 'offline',
          status: 'aberta',
          total: 0,
          observacao: '',
          cliente_nome: clienteNome || undefined,
          aberto_em: new Date().toISOString(),
          mesa_numero: mesa.numero,
          mesa_nome: mesa.nome,
          itens: [],
          pagamentos: []
        };
        
        saveOfflineComanda(comanda);
        await queueComandaCreate(comanda);
        atualizarPendentes();
        pushSync();
        
        set({ comandaAtual: comanda });
        const novasMesas = get().mesas.map(m => m.id === mesa.id ? {
          ...m,
          status: 'ocupada' as const,
          comanda_aberta_id: comanda.id,
          aberto_em: comanda.aberto_em,
          cliente_nome: clienteNome,
          comandas_abertas: (m.comandas_abertas || 0) + 1
        } : m);
        set({ mesas: novasMesas });
        
        return comanda;
      },
      
      fecharComanda: async () => {
        const { comandaAtual } = get();
        if (!comandaAtual) return;

        await queueComandaClose(comandaAtual.id);
        atualizarPendentes();
        await pushSync();
        removerOfflineComandaLocal(comandaAtual.id);

        set({ comandaAtual: null });
        const novasMesas = get().mesas.map(m => m.id === comandaAtual.mesa_id ? {
          ...m,
          status: 'livre' as const,
          comanda_aberta_id: undefined,
          aberto_em: undefined,
          cliente_nome: undefined,
          total_aberto: 0,
          comandas_abertas: 0
        } : m);
        set({ mesas: novasMesas });
      },

      fecharMesa: async (mesa) => {
        const { comandaAtual, mesas } = get();
        const idComanda = mesa.comanda_aberta_id ||
          (comandaAtual && comandaAtual.mesa_id === mesa.id ? comandaAtual.id : null);
        if (!idComanda) return false;

        const dados = comandaAtual && comandaAtual.mesa_id === mesa.id
          ? comandaAtual
          : getOfflineComandaPorId(idComanda);

        await queueComandaClose(idComanda);
        if (dados && dados.status !== 'fechada') {
          saveOfflineComanda({ ...dados, status: 'fechada' as const, fechado_em: new Date().toISOString() });
        }
        atualizarPendentes();
        await pushSync();
        removerOfflineComandaLocal(idComanda);

        if (comandaAtual && comandaAtual.mesa_id === mesa.id) {
          set({ comandaAtual: null });
        }
        set({ mesas: mesas.map(m => m.id === mesa.id ? {
          ...m,
          status: 'livre' as const,
          comanda_aberta_id: undefined,
          aberto_em: undefined,
          cliente_nome: undefined,
          total_aberto: 0,
          comandas_abertas: 0
        } : m) });
        return true;
      },
      
      adicionarItem: async (produto, quantidade, observacao) => {
        const { comandaAtual, categorias } = get();
        if (!comandaAtual) return;

        const categoriaProduto = categorias.find(c => c.produtos?.some(p => p.id === produto.id));
        const precisaPreparo = categoriaProduto?.precisa_preparo !== 0;
        
        const idItem = novoIdLocal('item');
        const item: ItemComanda = {
          id: idItem,
          id_local: idItem,
          comanda_id: comandaAtual.id,
          produto_id: produto.id,
          quantidade,
          preco_unitario: produto.preco,
          subtotal: produto.preco * quantidade,
          observacao,
          status: precisaPreparo ? 'pendente' : 'entregue',
          produto_nome: produto.nome,
          produto_imagem: produto.imagem_url
        };
        
        saveOfflineItem(item);
        await queueItemAdd(item);
        atualizarPendentes();
        pushSync();
        
        const novosItens = [...(comandaAtual.itens || []), item];
        const total = novosItens.reduce((s, i) => s + i.subtotal, 0);
        set({ comandaAtual: { ...comandaAtual, itens: novosItens, total } });
      },
      
      atualizarItem: async (itemId, updates) => {
        const { comandaAtual } = get();
        if (!comandaAtual) return;
        
        const novosItens = comandaAtual.itens?.map(item => 
          item.id === itemId ? { ...item, ...updates, subtotal: (updates.quantidade ?? item.quantidade) * item.preco_unitario } : item
        ) || [];
        
        const itemAtualizado = novosItens.find(i => i.id === itemId);
        if (itemAtualizado) {
          saveOfflineItem(itemAtualizado);
          await queueItemUpdate(itemAtualizado);
          atualizarPendentes();
          pushSync();
        }
        
        const total = novosItens.reduce((s, i) => s + i.subtotal, 0);
        set({ comandaAtual: { ...comandaAtual, itens: novosItens, total } });
      },
      
      cancelarItem: async (itemId) => {
        const { comandaAtual } = get();
        if (!comandaAtual) return;
        
        await queueItemCancel(itemId, comandaAtual.id);
        atualizarPendentes();
        pushSync();
        
        const novosItens = comandaAtual.itens?.map(item => 
          item.id === itemId ? { ...item, status: 'cancelado' as const } : item
        ) || [];
        
        const total = novosItens.filter(i => i.status !== 'cancelado').reduce((s, i) => s + i.subtotal, 0);
        set({ comandaAtual: { ...comandaAtual, itens: novosItens, total } });
      },
      
      recalcularTotal: () => {
        const { comandaAtual } = get();
        if (!comandaAtual) return;
        const total = comandaAtual.itens?.filter(i => i.status !== 'cancelado').reduce((s, i) => s + i.subtotal, 0) || 0;
        set({ comandaAtual: { ...comandaAtual, total } });
      },
      
      adicionarPagamento: async (forma, valor, troco = 0, referencia) => {
        const { comandaAtual } = get();
        if (!comandaAtual) return;
        
        const idPagamento = novoIdLocal('pag');
        const pagamento = {
          id: idPagamento,
          id_local: idPagamento,
          comanda_id: comandaAtual.id,
          forma,
          valor,
          troco,
          referencia,
          criado_em: new Date().toISOString()
        };
        
        saveOfflinePagamento(pagamento);
        await queuePagamentoCreate(pagamento);
        atualizarPendentes();
        pushSync();
      },
      
      isOnline: true,
      setIsOnline: (v) => set({ isOnline: v }),
      
      pendingSync: 0,
      setPendingSync: (n) => set({ pendingSync: n }),
      
      loadCache: async () => {
        initOfflineDB();
        atualizarPendentes();
        const [config, cats, prods, mesas] = await Promise.all([
          getCachedData<Configuracoes>('configuracoes'),
          getCachedData<Categoria[]>('categorias'),
          getCachedData<Produto[]>('produtos'),
          getCachedData<Mesa[]>('mesas')
        ]);
        
        if (config) set({ configuracoes: config });
        if (cats) {
          const categoriasComProdutos = cats.map(cat => ({
            ...cat,
            produtos: prods?.filter(p => p.categoria_id === cat.id) || []
          }));
          set({ categorias: categoriasComProdutos });
        }
        if (mesas) set({ mesas: fusionarComandasAbertas(mesas) });
        
        const offlineComandas = getOfflineComandas();
        if (offlineComandas.length > 0) {
          const ultima = offlineComandas[offlineComandas.length - 1] as Comanda;
          if (ultima.status === 'aberta') {
            set({ comandaAtual: ultima as unknown as Comanda });
          }
        }
      }
    }),
    {
      name: 'bar-comanda-store',
      partialize: (state) => ({
        configuracoes: state.configuracoes,
        mesas: state.mesas,
        categorias: state.categorias
      })
    }
  )
);