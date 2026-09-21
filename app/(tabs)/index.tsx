import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, RefreshControl, Alert, Modal, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useStore } from '@/store';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/services/api';
import { Mesa } from '@/types';
import { startAutoSync, fullSync, isOnline } from '@/services/sync';
import AppBackground from '@/components/AppBackground';

const abrirComandaMesa = async (mesa: Mesa, abrirComanda: (m: Mesa) => Promise<any>, router: any) => {
  if (mesa.status === 'ocupada') {
    if (mesa.comanda_aberta_id) {
      router.push(`/comanda/${mesa.comanda_aberta_id}`);
    } else {
      Alert.alert('Sem comanda', 'Esta mesa está ocupada mas ainda não possui comanda aberta.');
    }
    return;
  }
  if (mesa.status !== 'livre') {
    Alert.alert('Mesa indisponível', 'Esta mesa não está disponível para abrir comanda.');
    return;
  }
  try {
    const comanda = await abrirComanda(mesa);
    router.push(`/comanda/${comanda.id}`);
  } catch (err) {
    Alert.alert('Erro', 'Não foi possível abrir a comanda. Verifique a conexão.');
  }
};

export default function MesasScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { mesas, setMesas, mesasLivres, loadCache, setIsOnline, setPendingSync, pendingSync, abrirComanda } = useStore();
  const configuracoes = useStore((s) => s.configuracoes);
  const [refreshing, setRefreshing] = React.useState(false);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [modalCliente, setModalCliente] = useState<{ mesa: Mesa; abrindo: boolean } | null>(null);
  const [nomeCliente, setNomeCliente] = useState('');
  const [mesasPedindoConta, setMesasPedindoConta] = useState<number[]>([]);

  const carregarPedidosConta = useCallback(async () => {
    try {
      const res = await api.get('/solicitacoes', { params: { status: 'pendente', tipo: 'fechar' } });
      setMesasPedindoConta((res.data.solicitacoes || []).map((s: any) => s.mesa_numero));
    } catch (err) {}
  }, []);

  useEffect(() => {
    carregarPedidosConta();
    const t = setInterval(carregarPedidosConta, 10000);
    return () => clearInterval(t);
  }, [carregarPedidosConta]);

  const formatElapsed = (aberto_em?: string) => {
    if (!aberto_em) return '';
    const ms = agora - new Date(aberto_em).getTime();
    if (ms < 0) return '';
    const min = Math.floor(ms / 60000);
    if (min < 1) return 'há pouco';
    if (min < 60) return `há ${min} min`;
    const h = Math.floor(min / 60);
    return `há ${h}h ${min % 60}min`;
  };

  const abrirComandaMesa = (mesa: Mesa) => {
    if (mesa.status === 'ocupada') {
      if (mesa.comanda_aberta_id) {
        router.push(`/comanda/${mesa.comanda_aberta_id}`);
      } else {
        Alert.alert('Sem comanda', 'Esta mesa está ocupada mas ainda não possui comanda aberta.');
      }
      return;
    }
    if (mesa.status !== 'livre') {
      Alert.alert('Mesa indisponível', 'Esta mesa não está disponível para abrir comanda.');
      return;
    }
    setNomeCliente('');
    setModalCliente({ mesa, abrindo: true });
  };

  const handleEditarCliente = (mesa: Mesa) => {
    setNomeCliente(mesa.cliente_nome || '');
    setModalCliente({ mesa, abrindo: false });
  };

  const confirmarCliente = async () => {
    const alvo = modalCliente;
    if (!alvo) return;
    setModalCliente(null);
    const nome = nomeCliente.trim();
    try {
      if (alvo.abrindo) {
        const comanda = await abrirComanda(alvo.mesa, nome || undefined);
        router.push(`/comanda/${comanda.id}`);
      } else {
        if (alvo.mesa.comanda_aberta_id) {
          await api.put(`/comandas/${alvo.mesa.comanda_aberta_id}`, { cliente_nome: nome || null });
        }
        const at = useStore.getState().comandaAtual;
        if (at && at.mesa_id === alvo.mesa.id) {
          useStore.getState().setComandaAtual({ ...at, cliente_nome: nome || undefined });
        }
        await carregarMesas();
      }
    } catch (err: any) {
      Alert.alert('Erro', err?.response?.data?.erro || 'Não foi possível salvar o cliente');
    }
  };

  const mensagemErro = (err: any) => {
    const status = err?.response?.status;
    if (status === 401) return 'Sessão expirada. Volte ao login e entre novamente.';
    if (status && status >= 500) return `Servidor respondeu com erro (HTTP ${status}).`;
    if (!err?.response) return `Sem conexão com o servidor (${api.defaults.baseURL}). Verifique se o celular está no mesmo Wi-Fi do bar e toque para tentar.`;
    return `Servidor respondeu com erro (HTTP ${status}).`;
  };

  const carregarMesas = async () => {
    try {
      const response = await api.get('/mesas');
      setMesas(response.data.mesas);
      setErroConexao(null);
    } catch (err: any) {
      console.error('Erro ao carregar mesas:', err);
      setErroConexao(mensagemErro(err));
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await carregarMesas();
    const online = await isOnline();
    setIsOnline(online);
    if (online) await fullSync();
    setRefreshing(false);
  };

  useEffect(() => {
    carregarMesas();
    startAutoSync();
    const timer = setInterval(() => setAgora(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  const mesasDisponiveis = mesasLivres();
  const mesasOcupadas = mesas.filter(m => m.status !== 'livre');
  const listaMesas = [...mesas].sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0));

  const renderMesa = ({ item }: { item: Mesa }) => {
    const pedindoConta = item.status === 'ocupada' && mesasPedindoConta.includes(item.numero);
    return (
    <TouchableOpacity 
      style={[styles.mesaCard, item.status === 'ocupada' && styles.mesaOcupada, pedindoConta && styles.mesaPedindoConta]}
      onPress={() => abrirComandaMesa(item)}
      activeOpacity={0.8}
    >
      <View style={styles.mesaHeader}>
        <View style={[styles.mesaNumero, pedindoConta && styles.mesaNumeroAzul]}>
          <Text style={styles.numeroText}>{item.numero}</Text>
        </View>
        <View style={styles.mesaStatus}>
          <Ionicons name={pedindoConta ? 'receipt' : item.status === 'livre' ? 'checkmark-circle' : 'people'} size={20} color={pedindoConta ? '#4da3ff' : item.status === 'livre' ? '#34a853' : '#ea4335'} />
        </View>
      </View>
      <Text style={styles.mesaNome}>{item.nome || `Mesa ${item.numero}`}</Text>
      <Text style={styles.mesaCapacidade}>
        <Ionicons name='person' size={14} color="#6b6b78" style={{ marginRight: 4 }} />
        {item.capacidade} lugares
      </Text>
      {pedindoConta && (
        <View style={styles.pedidoContaBadge}>
          <Ionicons name="receipt-outline" size={13} color="#4da3ff" style={{ marginRight: 4 }} />
          <Text style={styles.pedidoContaText}>Pediu a conta</Text>
        </View>
      )}
      {item.status === 'ocupada' && (
        <TouchableOpacity style={styles.clienteRow} onPress={() => handleEditarCliente(item)} activeOpacity={0.7}>
          <Ionicons name='person-circle' size={14} color="#4da3ff" style={{ marginRight: 4 }} />
          <Text style={styles.clienteText} numberOfLines={1}>{item.cliente_nome || 'Cliente sem nome'}</Text>
          <Ionicons name='create-outline' size={14} color="#4da3ff" />
        </TouchableOpacity>
      )}
      {item.status === 'ocupada' && (item.comandas_abertas ?? 0) > 0 && (
        <Text style={styles.mesaTotal}>
          <Ionicons name='cash' size={14} color="#ea4335" style={{ marginRight: 4 }} />
          R$ {item.total_aberto?.toFixed(2) || '0,00'}
        </Text>
      )}
      {item.status === 'ocupada' && item.aberto_em && (
        <Text style={styles.mesaTempo}>
          <Ionicons name='time-outline' size={13} color="#ffb020" style={{ marginRight: 4 }} />
          Ativa {formatElapsed(item.aberto_em)}
        </Text>
      )}
    </TouchableOpacity>
    );
  };

  return (
    <AppBackground style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Mesas</Text>
          <Text style={styles.headerSubtitle}>
            {mesasDisponiveis.length} livres • {mesasOcupadas.length} ocupadas
          </Text>
          <View style={styles.garcomChip}>
            <Ionicons name="person-circle-outline" size={16} color="#9a9aa5" />
            <Text style={styles.garcomChipText}>Atendente: {user?.nome || '—'}</Text>
          </View>
        </View>
        <View style={styles.headerStatus}>
          {pendingSync > 0 && (
            <View style={styles.pendingPill}>
              <Ionicons name="cloud-upload-outline" size={12} color="#ffb020" style={{ marginRight: 4 }} />
              <Text style={styles.pendingPillText}>{pendingSync} pends.</Text>
            </View>
          )}
          <TouchableOpacity style={styles.syncButton} onPress={handleRefresh}>
            <Ionicons name="sync" size={24} color={configuracoes?.bar_cor_primaria || '#1a73e8'} />
          </TouchableOpacity>
        </View>
      </View>

      {erroConexao && (
        <TouchableOpacity style={styles.conexaoBanner} onPress={handleRefresh}>
          <Ionicons name="cloud-offline-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.conexaoBannerText}>{erroConexao}</Text>
        </TouchableOpacity>
      )}

      <FlatList
        style={styles.list}
        data={listaMesas}
        renderItem={renderMesa}
        keyExtractor={item => item.id}
        numColumns={2}
        columnWrapperStyle={styles.gridRow}
        contentContainerStyle={styles.grid}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      />

      {mesas.length === 0 && !erroConexao && (
        <View style={styles.empty}>
          <Ionicons name="restaurant-outline" size={64} color="#3a3a45" />
          <Text style={styles.emptyText}>Nenhuma mesa cadastrada</Text>
          <Text style={styles.emptySub}>Configure no painel administrativo</Text>
        </View>
      )}

      <Modal visible={modalCliente !== null} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{modalCliente?.abrindo ? `Abrir Mesa ${modalCliente.mesa.numero}` : `Cliente da Mesa ${modalCliente?.mesa.numero}`}</Text>
            <TouchableOpacity onPress={() => setModalCliente(null)}>
              <Ionicons name="close" size={24} color="#9a9aa5" />
            </TouchableOpacity>
          </View>
          <View style={styles.modalContent}>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Nome provisório do cliente (opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={nomeCliente}
                onChangeText={setNomeCliente}
                placeholder="Ex: João, Mesa da janela, Aniversariante"
                placeholderTextColor="#5c5c68"
                autoFocus
              />
            </View>
          </View>
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setModalCliente(null)}>
              <Text style={styles.modalButtonText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalButtonSave} onPress={confirmarCliente}>
              <Text style={styles.modalButtonText}>{modalCliente?.abrindo ? 'Abrir Mesa' : 'Salvar Nome'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f' },
  headerLeft: { flex: 1 },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#f2f2f4' },
  headerSubtitle: { fontSize: 14, color: '#9a9aa5', marginTop: 2 },
  syncButton: { padding: 8 },
  headerStatus: { flexDirection: 'row', alignItems: 'center' },
  pendingPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2a2a35', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 4 },
  pendingPillText: { color: '#9a9aa5', fontSize: 11, fontWeight: '600' },
  garcomChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f1f28', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginTop: 8, borderWidth: 1, borderColor: '#2a2a35' },
  garcomChipText: { color: '#d4d4dc', fontSize: 13, marginLeft: 6 },
  section: { padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: '#9a9aa5', marginBottom: 12 },
  grid: { padding: 16, gap: 12 },
  gridRow: { gap: 12 },
  list: { flex: 1 },
  mesaCard: { backgroundColor: '#1a1a22', borderRadius: 16, padding: 16, minWidth: 150, flex: 1, borderWidth: 1, borderColor: '#26262f' },
  mesaOcupada: { borderWidth: 2, borderColor: '#ea4335', backgroundColor: '#241518' },
  mesaPedindoConta: { borderWidth: 2, borderColor: '#1a73e8', backgroundColor: '#13213b' },
  mesaNumeroAzul: { backgroundColor: '#1a73e8' },
  pedidoContaBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#1a2d50', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, marginBottom: 8 },
  pedidoContaText: { fontSize: 12, fontWeight: '600', color: '#4da3ff' },
  mesaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  mesaNumero: { backgroundColor: '#26262f', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 8 },
  numeroText: { fontSize: 20, fontWeight: '700', color: '#f2f2f4' },
  mesaNome: { fontSize: 16, fontWeight: '600', color: '#f2f2f4', marginBottom: 4 },
  mesaCapacidade: { fontSize: 12, color: '#6b6b78', marginBottom: 8 },
  clienteRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1f1f28', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 5, marginBottom: 6, borderWidth: 1, borderColor: '#2a2a35' },
  clienteText: { flex: 1, fontSize: 13, color: '#d4d4dc', marginRight: 6 },
  mesaStatus: { flexDirection: 'row', alignItems: 'center' },
  mesaTotal: { fontSize: 14, fontWeight: '600', color: '#ff6b5e' },
  mesaTempo: { fontSize: 12, fontWeight: '600', color: '#ffb020', marginTop: 2 },
  conexaoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ea4335', paddingHorizontal: 16, paddingVertical: 12 },
  conexaoBannerText: { color: 'white', fontSize: 13, fontFamily: 'monospace', flex: 1 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 18, fontWeight: '600', color: '#9a9aa5', marginTop: 16 },
  emptySub: { fontSize: 14, color: '#5c5c68', marginTop: 4 },
  modalContainer: { flex: 1, backgroundColor: '#0f0f14', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: '700', color: '#f2f2f4' },
  modalContent: { marginBottom: 20 },
  modalField: { marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#d4d4dc', marginBottom: 6 },
  modalInput: { borderWidth: 1, borderColor: '#2a2a35', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#1f1f28', color: '#f2f2f4' },
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  modalButtonCancel: { flex: 1, backgroundColor: '#26262f', padding: 14, borderRadius: 8, alignItems: 'center', marginRight: 8 },
  modalButtonSave: { flex: 1, backgroundColor: '#1a73e8', padding: 14, borderRadius: 8, alignItems: 'center' },
  modalButtonText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});