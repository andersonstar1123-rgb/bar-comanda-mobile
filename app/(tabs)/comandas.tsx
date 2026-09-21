import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '@/store';
import { api } from '@/services/api';
import { Comanda, ItemComanda } from '@/types';
import AppBackground from '@/components/AppBackground';

function tempoPedido(dataISO?: string): string {
  if (!dataISO) return '';
  const t = new Date(dataISO).getTime();
  if (isNaN(t)) return '';
  const min = Math.max(0, Math.floor((Date.now() - t) / 60000));
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h ${min % 60}min`;
}

interface PedidoLinha {
  key: string;
  item: ItemComanda;
  comandaId: string;
  mesaNumero?: number;
  mesaNome?: string | null;
  pedidoEm: string;
}

interface SolicitacaoLinha {
  id: string;
  tipo?: string;
  mesa_numero: number;
  mesa_nome?: string | null;
  total: number;
  criado_em: string;
  itens: Array<{ nome: string; quantidade: number; preco_unitario: number }>;
}

const statusLabels: Record<ItemComanda['status'], string> = {
  pendente: 'Pendente',
  enviado: 'Enviado',
  preparando: 'Preparando',
  pronto: 'Pronto',
  entregue: 'Entregue',
  cancelado: 'Cancelado'
};

const statusColors: Record<ItemComanda['status'], string> = {
  pendente: '#fbbc04',
  enviado: '#1a73e8',
  preparando: '#ff9800',
  pronto: '#34a853',
  entregue: '#34a853',
  cancelado: '#ea4335'
};

export default function ComandasScreen() {
  const router = useRouter();
  const { comandaAtual, setComandaAtual } = useStore();
  const [comandasAbertas, setComandasAbertas] = useState<Comanda[]>([]);
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoLinha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [abertaEm, setAbertaEm] = useState<Record<string, string>>({});
  const [processando, setProcessando] = useState<string | null>(null);

  const carregarComandas = useCallback(async () => {
    try {
      const [respComandas, respSol] = await Promise.all([
        api.get('/comandas/abertas'),
        api.get('/solicitacoes', { params: { status: 'pendente' } })
      ]);
      const comandas: Comanda[] = respComandas.data.comandas || [];
      setComandasAbertas(comandas);
      setSolicitacoes(respSol.data.solicitacoes || []);
      const mapa: Record<string, string> = {};
      comandas.forEach(c => { mapa[c.id] = c.aberto_em || ''; });
      setAbertaEm(mapa);
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível carregar as comandas abertas');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarComandas();
  }, [carregarComandas]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await carregarComandas();
    setRefreshing(false);
  }, [carregarComandas]);

  const pedidosEmAberto: PedidoLinha[] = comandasAbertas.flatMap(c =>
    (c.itens || [])
      .filter(i => i && i.id && i.status !== 'entregue' && i.status !== 'cancelado' && i.quantidade != null && i.subtotal != null)
      .map((i: any): PedidoLinha => ({
        key: `${c.id}_${i.id}`,
        item: i as ItemComanda,
        comandaId: c.id,
        mesaNumero: c.mesa_numero,
        mesaNome: c.mesa_nome,
        pedidoEm: i.criado_em || i.aberto_em || abertaEm[c.id] || c.aberto_em || ''
      }))
  ).sort((a, b) => new Date(a.pedidoEm).getTime() - new Date(b.pedidoEm).getTime());

  const handleAbrirComanda = (comandaId: string) => {
    router.push(`/comanda/${comandaId}`);
  };

  const responderSolicitacao = async (id: string, acao: 'aprovar' | 'recusar') => {
    setProcessando(id);
    try {
      await api.post(`/solicitacoes/${id}/${acao}`);
      setSolicitacoes(prev => prev.filter(s => s.id !== id));
      carregarComandas();
    } catch (err) {
      Alert.alert('Erro', acao === 'aprovar' ? 'Não foi possível aprovar o pedido' : 'Não foi possível recusar o pedido');
    } finally {
      setProcessando(null);
    }
  };

  const headerSolicitacoes = solicitacoes.filter(s => s.tipo !== 'fechar').length > 0 ? (
    <View style={styles.solSection}>
      <View style={styles.solHeader}>
        <Ionicons name="qr-code" size={16} color="#4da3ff" />
        <Text style={styles.solTitle}>Pedidos do QR para confirmar</Text>
        <View style={styles.solCount}><Text style={styles.solCountText}>{solicitacoes.filter(s => s.tipo !== 'fechar').length}</Text></View>
      </View>
      {solicitacoes.filter(s => s.tipo !== 'fechar').map(sol => (
        <View key={sol.id} style={styles.solCard}>
          <View style={styles.cardTop}>
            <View style={styles.mesaBadge}>
              <Ionicons name="restaurant" size={13} color="#f2f2f4" />
              <Text style={styles.mesaText}>Mesa {sol.mesa_numero}</Text>
            </View>
            <View style={styles.tempoBox}>
              <Ionicons name="time-outline" size={13} color="#ffb020" />
              <Text style={styles.tempoText}>{tempoPedido(sol.criado_em)}</Text>
            </View>
          </View>
          <View style={styles.solItens}>
            {sol.itens.map((it, i) => (
              <View key={i} style={styles.solItemLinha}>
                <Text style={styles.solItemNome}>{it.quantidade}x {it.nome}</Text>
                <Text style={styles.solItemPreco}>R$ {(it.preco_unitario * it.quantidade).toFixed(2).replace('.', ',')}</Text>
              </View>
            ))}
          </View>
          <View style={styles.solTotal}>
            <Text style={styles.solTotalLabel}>Total</Text>
            <Text style={styles.solTotalValor}>R$ {(sol.total ?? 0).toFixed(2).replace('.', ',')}</Text>
          </View>
          <View style={styles.solAcoes}>
            <TouchableOpacity
              style={[styles.solBtn, styles.solBtnRecusar, processando === sol.id && { opacity: 0.5 }]}
              onPress={() => responderSolicitacao(sol.id, 'recusar')}
              disabled={processando === sol.id}
            >
              <Ionicons name="close" size={15} color="#ea4335" />
              <Text style={styles.solBtnRecusarText}>Recusar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.solBtn, styles.solBtnAprovar, processando === sol.id && { opacity: 0.5 }]}
              onPress={() => responderSolicitacao(sol.id, 'aprovar')}
              disabled={processando === sol.id}
            >
              <Ionicons name="checkmark" size={15} color="#fff" />
              <Text style={styles.solBtnAprovarText}>Aprovar pedido</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </View>
  ) : null;

  if (carregando) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Carregando...</Text>
      </View>
    );
  }

  return (
    <AppBackground style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Pedidos em Aberto</Text>
          <Text style={styles.headerSubtitle}>Todas as mesas</Text>
        </View>
        <View style={styles.headerCount}>
          <Text style={styles.headerCountText}>{pedidosEmAberto.length}</Text>
        </View>
      </View>

      <FlatList
        data={pedidosEmAberto}
        keyExtractor={item => item.key}
        ListHeaderComponent={headerSolicitacoes}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => handleAbrirComanda(item.comandaId)}>
            <View style={styles.cardTop}>
              <View style={styles.mesaBadge}>
                <Ionicons name="restaurant" size={13} color="#f2f2f4" />
                <Text style={styles.mesaText}>Mesa {item.mesaNumero}</Text>
              </View>
              {item.mesaNome ? <Text style={styles.siglaText}>({item.mesaNome})</Text> : null}
              <View style={styles.tempoBox}>
                <Ionicons name="time-outline" size={13} color="#ffb020" />
                <Text style={styles.tempoText}>{tempoPedido(item.pedidoEm)}</Text>
              </View>
            </View>

            <View style={styles.cardBody}>
              <View style={styles.produtoInfo}>
                <Text style={styles.qtdText}>{item.item.quantidade}x</Text>
                <View style={styles.produtoMain}>
                  <Text style={styles.produtoNome}>{item.item.produto_nome || 'Produto'}</Text>
                  {item.item.observacao ? <Text style={styles.obsText}>{item.item.observacao}</Text> : null}
                </View>
              </View>
              <Text style={styles.precoText}>R$ {(item.item.subtotal ?? 0).toFixed(2).replace('.', ',')}</Text>
            </View>

            <View style={styles.cardFooter}>
              <View style={[styles.statusBadge, { backgroundColor: statusColors[item.item.status] }]}>
                <Text style={styles.statusText}>{statusLabels[item.item.status]}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color="#3a3a45" />
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="receipt-outline" size={64} color="#3a3a45" />
            <Text style={styles.emptyText}>Nenhum pedido em aberto</Text>
            <Text style={styles.emptySub}>Os pedidos enviados das mesas aparecerão aqui</Text>
          </View>
        }
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#4da3ff" />}
        showsVerticalScrollIndicator={false}
      />
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  solSection: { marginBottom: 16 },
  solCard: { backgroundColor: '#151b2b', borderRadius: 14, borderWidth: 1, borderColor: '#1a73e8', padding: 14, marginBottom: 12 },
  solHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  solTitle: { fontSize: 16, fontWeight: '700', color: '#f2f2f4', flex: 1 },
  solCount: { backgroundColor: '#1a73e8', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  solCountText: { color: 'white', fontSize: 13, fontWeight: '700' },
  solItens: { gap: 4, marginBottom: 10 },
  solItemLinha: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  solItemNome: { fontSize: 14, color: '#d4d4dc', flex: 1 },
  solItemPreco: { fontSize: 13, color: '#9a9aa5', marginLeft: 8 },
  solTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#26262f', paddingTop: 10, marginBottom: 12 },
  solTotalLabel: { fontSize: 13, color: '#9a9aa5' },
  solTotalValor: { fontSize: 17, fontWeight: '700', color: '#f2f2f4' },
  solAcoes: { flexDirection: 'row', gap: 10 },
  solBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12 },
  solBtnRecusar: { backgroundColor: '#1c1418', borderWidth: 1, borderColor: '#7a2a35' },
  solBtnRecusarText: { color: '#ea4335', fontSize: 14, fontWeight: '600' },
  solBtnAprovar: { backgroundColor: '#1a73e8' },
  solBtnAprovarText: { color: 'white', fontSize: 14, fontWeight: '700' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f' },
  headerTitle: { fontSize: 22, fontWeight: '700', color: '#f2f2f4' },
  headerSubtitle: { fontSize: 13, color: '#9a9aa5', marginTop: 2 },
  headerCount: { backgroundColor: '#1a73e8', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4 },
  headerCountText: { color: 'white', fontSize: 14, fontWeight: '700' },
  listContent: { padding: 16, paddingBottom: 32, flexGrow: 1 },
  card: { backgroundColor: '#16161d', borderRadius: 14, borderWidth: 1, borderColor: '#26262f', padding: 14 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  mesaBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#1a73e8', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  mesaText: { color: 'white', fontSize: 13, fontWeight: '600' },
  siglaText: { fontSize: 12, color: '#9a9aa5' },
  tempoBox: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto' },
  tempoText: { color: '#ffb020', fontSize: 12, fontWeight: '500' },
  cardBody: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  produtoInfo: { flexDirection: 'row', alignItems: 'flex-start', flex: 1 },
  qtdText: { fontSize: 15, fontWeight: '700', color: '#4da3ff', marginRight: 10, minWidth: 26 },
  produtoMain: { flex: 1 },
  produtoNome: { fontSize: 15, fontWeight: '600', color: '#f2f2f4' },
  obsText: { fontSize: 12, color: '#6b6b78', marginTop: 2 },
  precoText: { fontSize: 15, fontWeight: '600', color: '#d4d4dc', marginLeft: 8 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { fontSize: 10, fontWeight: '600', color: 'white', textTransform: 'uppercase' },
  separator: { height: 12 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 17, fontWeight: '600', color: '#9a9aa5', marginTop: 16 },
  emptySub: { fontSize: 13, color: '#5c5c68', marginTop: 6, textAlign: 'center' },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
  loadingText: { color: '#9a9aa5', fontSize: 15 }
});
