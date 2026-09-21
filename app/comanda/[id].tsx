import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Alert, Modal, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams, useFocusEffect, Redirect } from 'expo-router';
import { useStore } from '@/store';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { Comanda, ItemComanda } from '@/types';
import { queueItemUpdate, queuePagamentoCreate, fullSync } from '@/services/sync';
import { getOfflineComandaPorId, getOfflineItensPorComanda, getOfflinePagamentosPorComanda } from '@/services/offlineDB';

export default function ComandaDetalheScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { comandaAtual, setComandaAtual, atualizarItem, adicionarPagamento, mesas, recalcularTotal } = useStore();
  const [comanda, setComanda] = useState<Comanda | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [showPagamento, setShowPagamento] = useState(false);
  const [formaPagamento, setFormaPagamento] = useState<'dinheiro' | 'cartao' | 'pix'>('dinheiro');
  const [valorPagamento, setValorPagamento] = useState('');
  const [troco, setTroco] = useState('');
  const [agora, setAgora] = useState(Date.now());
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [nomeClienteEdit, setNomeClienteEdit] = useState('');

  const salvarCliente = async () => {
    setShowClienteModal(false);
    const nome = nomeClienteEdit.trim();
    try {
      await api.put(`/comandas/${id}`, { cliente_nome: nome || null });
      await atualizarDoServidor();
      const at = useStore.getState().comandaAtual;
      if (at && (at.id === id || at.mesa_id === id)) {
        useStore.getState().setComandaAtual({ ...at, cliente_nome: nome || undefined });
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível salvar o cliente');
    }
  };

  const atualizarDoServidor = useCallback(async () => {
    try {
      const response = await api.get(`/comandas/${id}`);
      const server = response.data.comanda as Comanda;
      setComanda(server);
      const atual = useStore.getState().comandaAtual;
      if (atual && (atual.id === id || atual.mesa_id === id)) {
        useStore.getState().setComandaAtual(server);
      }
    } catch (err) {
      // offline: mantém o que está em tela
    }
  }, [id]);

  useEffect(() => {
    const timer = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const carregarComanda = useCallback(async () => {
    const atual = useStore.getState().comandaAtual;
    if (atual && (atual.id === id || atual.mesa_id === id)) {
      setComanda(atual);
      setCarregando(false);
      return;
    }
    setCarregando(true);
    try {
      const response = await api.get(`/comandas/${id}`);
      setComanda(response.data.comanda);
      if (response.data.comanda.status === 'aberta' && !useStore.getState().comandaAtual) {
        setComandaAtual(response.data.comanda);
      }
    } catch (err) {
      const a2 = useStore.getState().comandaAtual;
      if (a2 && (a2.id === id || a2.mesa_id === id)) {
        setComanda(a2);
      } else {
        const offline = getOfflineComandaPorId(id || '') || (a2 && (a2.id === id || a2.mesa_id === id) ? a2 : null);
        if (offline) {
          const itens = getOfflineItensPorComanda(id || '');
          const pagamentos = getOfflinePagamentosPorComanda(id || '');
          const mesa = useStore.getState().mesas.find(m => m.id === offline.mesa_id);
          const comandaOffline = {
            ...offline,
            itens,
            pagamentos,
            mesa_numero: mesa?.numero,
            mesa_nome: mesa?.nome,
            status: 'aberta' as const
          };
          setComanda(comandaOffline);
          setComandaAtual(comandaOffline as unknown as Comanda);
        } else {
          Alert.alert('Erro', 'Comanda não encontrada');
          router.back();
        }
      }
    } finally {
      setCarregando(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      carregarComanda();
      const poll = setInterval(atualizarDoServidor, 10000);
      return () => clearInterval(poll);
    }, [carregarComanda, atualizarDoServidor])
  );

  useEffect(() => {
    carregarComanda();
  }, [id]);

  const handleReabrir = async () => {
    if (!comanda) return;
    try {
      await api.post(`/comandas/${comanda.id}/reabrir`);
      carregarComanda();
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível reabrir');
    }
  };

  const handleItemStatus = async (item: ItemComanda, novoStatus: ItemComanda['status']) => {
    await atualizarItem(item.id, { status: novoStatus });
    carregarComanda();
  };

  const handlePagamento = async () => {
    const valor = parseFloat(valorPagamento.replace(',', '.'));
    if (!valor || valor <= 0) {
      Alert.alert('Erro', 'Informe um valor válido');
      return;
    }

    if (!comanda) return;

    await adicionarPagamento(formaPagamento, valor, formaPagamento === 'dinheiro' ? parseFloat(troco.replace(',', '.') || '0') : 0);
    
    const totalPago = (comanda.pagamentos || []).reduce((s, p) => s + p.valor, 0) + valor;
    if (totalPago >= comanda.total - 0.01) {
      setShowPagamento(false);
      setValorPagamento('');
      setTroco('');
      Alert.alert('Conta paga', 'Pagamento registrado. O fechamento da mesa será feito no painel administrativo.');
      carregarComanda();
      return;
    }

    setShowPagamento(false);
    setValorPagamento('');
    setTroco('');
    carregarComanda();
  };

  const totalPago = comanda?.pagamentos?.reduce((s, p) => s + p.valor, 0) || 0;
  const faltando = (comanda?.total || 0) - totalPago;

  const formatElapsed = (aberto_em?: string) => {
    if (!aberto_em) return '';
    const ms = agora - new Date(aberto_em).getTime();
    if (ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'há poucos segundos';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return `há ${h}h ${min % 60}min`;
  };
  const tempoAtivo = formatElapsed(comanda?.aberto_em);

  if (carregando) {
    return <View style={styles.loading}><Text>Carregando...</Text></View>;
  }

  if (!user) return <Redirect href="/login" />;

  if (!comanda) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={28} color="#f2f2f4" />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Mesa {comanda.mesa_numero}</Text>
          {comanda.mesa_nome && <Text style={styles.headerSubtitle}>{comanda.mesa_nome}</Text>}
          <Text style={styles.headerAttendente}>
            <Ionicons name="person-circle-outline" size={13} color="#9a9aa5" /> Atendente: {comanda.usuario_nome || user?.nome || '—'}
          </Text>
          <Text style={styles.headerTempo}>
            <Ionicons name="time-outline" size={12} color="#ffb020" /> Mesa ativa {tempoAtivo || ''}
          </Text>
          <TouchableOpacity style={styles.headerCliente} onPress={() => { setNomeClienteEdit(comanda.cliente_nome || ''); setShowClienteModal(true); }}>
            <Ionicons name="person-circle-outline" size={13} color="#4da3ff" />
            <Text style={styles.headerClienteText} numberOfLines={1}>Cliente: {comanda.cliente_nome || 'Sem nome'}</Text>
            <Ionicons name="create-outline" size={12} color="#4da3ff" />
          </TouchableOpacity>
        </View>
        <View style={styles.headerRight}>
          {comanda.status === 'fechada' && (
            <TouchableOpacity style={styles.reabrirBtn} onPress={handleReabrir}>
              <Text style={styles.reabrirBtnText}>Reabrir</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.totalBar}>
        <View style={styles.totalInfo}>
          <Text style={styles.totalLabel}>Total da Comanda</Text>
          <Text style={styles.totalValue}>R$ {comanda.total.toFixed(2).replace('.', ',')}</Text>
        </View>
        {comanda.status === 'aberta' && (
          <View style={styles.totalActions}>
            <TouchableOpacity style={styles.pedidoBtn} onPress={() => router.push('/cardapio')}>
              <Ionicons name="add" size={18} color="white" style={{ marginRight: 4 }} />
              <Text style={styles.pedidoBtnText}>Fazer Pedido</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <FlatList
        data={comanda.itens || []}
        renderItem={({ item }) => <ItemRow item={item} onStatusChange={handleItemStatus} />}
        keyExtractor={item => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="restaurant-outline" size={48} color="#3a3a45" />
            <Text style={styles.emptyText}>Nenhum item na comanda</Text>
            <Text style={styles.emptySub}>Adicione produtos pelo Cardápio</Text>
          </View>
        }
      />

      {comanda.pagamentos && comanda.pagamentos.length > 0 && (
        <View style={styles.pagamentosSection}>
          <Text style={styles.sectionTitle}>Pagamentos</Text>
          <FlatList
            data={comanda.pagamentos}
            renderItem={({ item }) => (
              <View style={styles.pagamentoRow}>
                <View style={styles.pagamentoInfo}>
                  <Text style={styles.pagamentoForma}>{item.forma.charAt(0).toUpperCase() + item.forma.slice(1)}</Text>
                  <Text style={styles.pagamentoHora}>{new Date(item.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</Text>
                </View>
                <View style={styles.pagamentoValorContainer}>
                  <Text style={styles.pagamentoValor}>R$ {item.valor.toFixed(2).replace('.', ',')}</Text>
                  {item.troco > 0 && <Text style={styles.pagamentoTroco}>Troco: R$ {item.troco.toFixed(2).replace('.', ',')}</Text>}
                </View>
              </View>
            )}
            keyExtractor={item => item.id}
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}

      <Modal visible={showPagamento} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Registrar Pagamento</Text>
              <TouchableOpacity onPress={() => setShowPagamento(false)}>
                <Ionicons name="close" size={28} color="#9a9aa5" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              <Text style={styles.modalLabel}>Forma de Pagamento</Text>
              <View style={styles.formaButtons}>
                {(['dinheiro', 'cartao', 'pix'] as const).map(forma => (
                  <TouchableOpacity
                    key={forma}
                    style={[styles.formaBtn, formaPagamento === forma && styles.formaAtiva]}
                    onPress={() => setFormaPagamento(forma)}
                  >
                    <Ionicons name={forma === 'dinheiro' ? 'cash' : forma === 'cartao' ? 'card' : 'logo-bitcoin'} size={24} color={formaPagamento === forma ? 'white' : '#4da3ff'} />
                    <Text style={[styles.formaBtnText, formaPagamento === forma && styles.formaAtivaText]}>{forma.charAt(0).toUpperCase() + forma.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.modalLabel}>Valor (R$)</Text>
                <TextInput
                  style={styles.input}
                  value={valorPagamento}
                  onChangeText={setValorPagamento}
                  keyboardType="numeric"
                  placeholder="0,00"
                  placeholderTextColor="#5c5c68"
                />
              </View>

              {formaPagamento === 'dinheiro' && (
                <View style={styles.inputGroup}>
                  <Text style={styles.modalLabel}>Troco para (R$)</Text>
                  <TextInput
                    style={styles.input}
                    value={troco}
                    onChangeText={setTroco}
                    keyboardType="numeric"
                    placeholder="0,00"
                    placeholderTextColor="#5c5c68"
                  />
                </View>
              )}

              <TouchableOpacity style={styles.confirmBtn} onPress={handlePagamento}>
                <Text style={styles.confirmBtnText}>Confirmar Pagamento</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={showClienteModal} animationType="fade" transparent>
        <View style={styles.modalOverlayCentro}>
          <View style={styles.modalContentCentro}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nome do Cliente</Text>
              <TouchableOpacity onPress={() => setShowClienteModal(false)}>
                <Ionicons name="close" size={28} color="#9a9aa5" />
              </TouchableOpacity>
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.modalLabel}>Nome provisório (opcional)</Text>
              <TextInput
                style={styles.input}
                value={nomeClienteEdit}
                onChangeText={setNomeClienteEdit}
                placeholder="Ex: João"
                placeholderTextColor="#5c5c68"
                autoFocus
              />
            </View>
            <TouchableOpacity style={styles.confirmBtn} onPress={salvarCliente}>
              <Text style={styles.confirmBtnText}>Salvar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function ItemRow({ item, onStatusChange }: { item: ItemComanda; onStatusChange: (item: ItemComanda, status: ItemComanda['status']) => void }) {
  const statusColors: Record<string, string> = {
    pendente: '#fbbc04',
    enviado: '#1a73e8',
    preparando: '#ff9800',
    pronto: '#34a853',
    entregue: '#34a853',
    cancelado: '#ea4335'
  };
  
  const statusLabels: Record<string, string> = {
    pendente: 'Pendente',
    enviado: 'Enviado',
    preparando: 'Preparando',
    pronto: 'Pronto',
    entregue: 'Entregue',
    cancelado: 'Cancelado'
  };

  const proximosStatus: Record<string, ItemComanda['status'][]> = {
    pendente: ['enviado'],
    enviado: ['preparando'],
    preparando: ['pronto'],
    pronto: ['entregue'],
    entregue: [],
    cancelado: []
  };

  return (
    <View style={styles.itemRow}>
      <View style={styles.itemLeft}>
        <Text style={styles.itemQuantidade}>{item.quantidade}x</Text>
        <View style={styles.itemInfo}>
          <View style={styles.itemNomeRow}>
            <Text style={[styles.itemNome, item.status === 'cancelado' && styles.itemNomeCancelado]}>{item.produto_nome || 'Produto'}</Text>
            <View style={[styles.inlineStatus, { backgroundColor: statusColors[item.status] + '22', borderColor: statusColors[item.status] }]}>
              <Text style={[styles.inlineStatusText, { color: statusColors[item.status] }]}>{statusLabels[item.status]}</Text>
            </View>
          </View>
          {item.observacao && <Text style={styles.itemObs}>{item.observacao}</Text>}
        </View>
      </View>
      <View style={styles.itemRight}>
        <Text style={styles.itemPreco}>R$ {item.subtotal.toFixed(2).replace('.', ',')}</Text>
        <View style={styles.itemStatusContainer}>
          <View style={[styles.statusBadge, { backgroundColor: statusColors[item.status] }]}>
            <Text style={styles.statusText}>{statusLabels[item.status]}</Text>
          </View>
          {proximosStatus[item.status]?.length > 0 && (
            <TouchableOpacity style={styles.nextStatusBtn} onPress={() => onStatusChange(item, proximosStatus[item.status][0])}>
              <Ionicons name="chevron-forward" size={16} color="white" />
            </TouchableOpacity>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f' },
  backBtn: { padding: 8 },
  headerCenter: { flex: 1 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#f2f2f4' },
  headerSubtitle: { fontSize: 13, color: '#9a9aa5' },
  headerAttendente: { fontSize: 12, color: '#6b6b78', marginTop: 2 },
  headerTempo: { fontSize: 12, color: '#ffb020', marginTop: 2 },
  headerCliente: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2, alignSelf: 'flex-start', backgroundColor: '#1f1f28', borderWidth: 1, borderColor: '#2a2a35', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  headerClienteText: { fontSize: 12, color: '#d4d4dc', maxWidth: 220 },
  headerRight: { paddingHorizontal: 8 },
  reabrirBtn: { backgroundColor: '#218838', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8 },
  reabrirBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  totalBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f', flexWrap: 'wrap', gap: 12 },
  totalInfo: { flex: 1 },
  totalLabel: { fontSize: 13, color: '#6b6b78', textTransform: 'uppercase' },
  totalValue: { fontSize: 24, fontWeight: '700', color: '#f2f2f4', marginTop: 2 },
  totalActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' },
  pedidoBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a73e8', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 10, flexShrink: 0 },
  pedidoBtnText: { color: 'white', fontWeight: '600', fontSize: 14 },
  listContent: { padding: 16, paddingBottom: 100 },
  itemRow: { flexDirection: 'row', paddingVertical: 12 },
  itemLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  itemQuantidade: { fontSize: 18, fontWeight: '700', color: '#4da3ff', marginRight: 12, minWidth: 32 },
  itemInfo: { flex: 1 },
  itemNomeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  itemNome: { fontSize: 16, fontWeight: '600', color: '#f2f2f4' },
  itemNomeCancelado: { textDecorationLine: 'line-through', color: '#6b6b78' },
  inlineStatus: { marginLeft: 8, borderRadius: 6, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1 },
  inlineStatusText: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  itemObs: { fontSize: 13, color: '#6b6b78', marginTop: 2 },
  itemRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end', maxWidth: '45%' },
  itemPreco: { fontSize: 16, fontWeight: '600', color: '#d4d4dc', minWidth: 80, textAlign: 'right' },
  itemStatusContainer: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  statusBadge: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  statusText: { fontSize: 10, fontWeight: '600', color: 'white', textTransform: 'uppercase' },
  nextStatusBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center' },
  separator: { height: 1, backgroundColor: '#26262f', marginHorizontal: 16 },
  empty: { alignItems: 'center', padding: 40 },
  emptyText: { fontSize: 16, fontWeight: '500', color: '#9a9aa5', marginTop: 12 },
  emptySub: { fontSize: 13, color: '#5c5c68', marginTop: 4 },
  pagamentosSection: { margin: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#26262f' },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#9a9aa5', marginBottom: 12 },
  pagamentoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, backgroundColor: '#1a1a22', borderRadius: 10, marginBottom: 8, borderWidth: 1, borderColor: '#26262f' },
  pagamentoInfo: { flex: 1 },
  pagamentoForma: { fontSize: 15, fontWeight: '600', color: '#f2f2f4' },
  pagamentoHora: { fontSize: 12, color: '#6b6b78', marginTop: 2 },
  pagamentoValorContainer: { alignItems: 'flex-end' },
  pagamentoValor: { fontSize: 16, fontWeight: '700', color: '#4ade80' },
  pagamentoTroco: { fontSize: 11, color: '#6b6b78', marginTop: 2 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'flex-end' },
  modalOverlayCentro: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  modalContentCentro: { backgroundColor: '#16161d', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#26262f' },
  modalContent: { backgroundColor: '#16161d', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '85%', borderWidth: 1, borderColor: '#26262f' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#f2f2f4' },
  modalBody: { gap: 16, paddingBottom: 40 },
  modalLabel: { fontSize: 14, fontWeight: '500', color: '#d4d4dc', marginBottom: 8 },
  formaButtons: { flexDirection: 'row', gap: 8 },
  formaBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 2, borderColor: '#1a73e8', backgroundColor: '#1f1f28' },
  formaAtiva: { backgroundColor: '#1a73e8', borderColor: '#1a73e8' },
  formaBtnText: { fontSize: 14, fontWeight: '600', color: '#4da3ff' },
  formaAtivaText: { color: 'white' },
  inputGroup: { gap: 8 },
  input: { backgroundColor: '#1f1f28', borderRadius: 12, padding: 16, fontSize: 18, textAlign: 'center', borderWidth: 1, borderColor: '#2a2a35', color: '#f2f2f4' },
  confirmBtn: { backgroundColor: '#218838', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  confirmBtnText: { color: 'white', fontSize: 16, fontWeight: '600' }
});