import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, FlatList, Image, Alert, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store';
import { api, resolveAssetUrl } from '@/services/api';
import { Categoria, Produto } from '@/types';
import AppBackground from '@/components/AppBackground';

export default function CardapioScreen() {
  const { categorias, setCategorias, comandaAtual, adicionarItem } = useStore();
  const [categoriaSelecionada, setCategoriaSelecionada] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroConexao, setErroConexao] = useState<string | null>(null);
  const [produtoModal, setProdutoModal] = useState<Produto | null>(null);
  const [quantidade, setQuantidade] = useState(1);

  const mensagemErro = (err: any) => {
    const status = err?.response?.status;
    if (status === 401) return 'Sessão expirada. Volte ao login e entre novamente.';
    if (status && status >= 500) return `Servidor respondeu com erro (HTTP ${status}).`;
    if (!err?.response) return `Sem conexão com o servidor (${api.defaults.baseURL}). Verifique se o celular está no mesmo Wi-Fi do bar e toque para tentar.`;
    return `Servidor respondeu com erro (HTTP ${status}).`;
  };

  const carregarCardapio = async () => {
    try {
      const response = await api.get('/produtos/cardapio');
      setCategorias(response.data.categorias);
      setErroConexao(null);
      if (response.data.categorias.length > 0 && !categoriaSelecionada) {
        setCategoriaSelecionada(response.data.categorias[0].id);
      }
    } catch (err: any) {
      console.error('Erro ao carregar cardápio:', err);
      setErroConexao(mensagemErro(err));
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarCardapio();
  }, []);

  const categoriaAtual = categorias.find(c => c.id === categoriaSelecionada);
  const produtos = categoriaAtual?.produtos || [];

  const handleAdicionar = (produto: Produto) => {
    if (!comandaAtual) {
      Alert.alert('Atenção', 'Selecione uma mesa primeiro para abrir a comanda');
      return;
    }
    setQuantidade(1);
    setProdutoModal(produto);
  };

  const confirmarAdicionar = async () => {
    if (!produtoModal) return;
    if (!comandaAtual) {
      Alert.alert('Atenção', 'Selecione uma mesa primeiro para abrir a comanda');
      setProdutoModal(null);
      return;
    }
    setProdutoModal(null);
    await adicionarItem(produtoModal, quantidade);
  };

  const handleAtualizar = async () => {
    setCarregando(true);
    await carregarCardapio();
  };

  if (carregando) {
    return (
      <View style={styles.loading}>
        <Text>Carregando cardápio...</Text>
      </View>
    );
  }

  return (
    <AppBackground style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Cardápio</Text>
        {comandaAtual && (
          <View style={styles.comandaBadge}>
            <Ionicons name="document-text" size={18} color="white" style={{ marginRight: 4 }} />
            <Text style={styles.badgeText}>Mesa {comandaAtual.mesa_numero}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.syncButton} onPress={handleAtualizar}>
          <Ionicons name="sync" size={24} color="#1a73e8" />
        </TouchableOpacity>
      </View>

      {erroConexao && (
        <TouchableOpacity style={styles.conexaoBanner} onPress={handleAtualizar}>
          <Ionicons name="cloud-offline-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.conexaoBannerText}>{erroConexao}</Text>
        </TouchableOpacity>
      )}

      <View style={styles.categoriasContainer}>
        <FlatList
          data={categorias}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriasContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.categoriaBtn, item.id === categoriaSelecionada && styles.categoriaAtiva]}
              onPress={() => setCategoriaSelecionada(item.id)}
            >
              <Text style={[styles.categoriaBtnText, item.id === categoriaSelecionada && styles.categoriaAtivaText]}>
                {item.nome}
              </Text>
            </TouchableOpacity>
          )}
          keyExtractor={item => item.id}
        />
      </View>

      {produtos.length === 0 && !erroConexao ? (
        <View style={styles.empty}>
          <Ionicons name="menu-outline" size={48} color="#3a3a45" />
          <Text style={styles.emptyText}>Nenhum produto nesta categoria</Text>
        </View>
      ) : (
        <FlatList
          data={produtos}
          renderItem={({ item }) => <ProdutoItem produto={item} onPress={handleAdicionar} />}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.produtosList}
          showsVerticalScrollIndicator={false}
        />
      )}

      <Modal visible={produtoModal !== null} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Quantidade</Text>
            {produtoModal && (
              <>
                <Text style={styles.modalProdutoNome}>{produtoModal.nome}</Text>
                <Text style={styles.modalPreco}>R$ {produtoModal.preco.toFixed(2).replace('.', ',')} cada</Text>
                <View style={styles.stepper}>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => setQuantidade(Math.max(1, quantidade - 1))}>
                    <Ionicons name="remove" size={28} color="white" />
                  </TouchableOpacity>
                  <Text style={styles.stepperValor}>{quantidade}</Text>
                  <TouchableOpacity style={styles.stepperBtn} onPress={() => setQuantidade(quantidade + 1)}>
                    <Ionicons name="add" size={28} color="white" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.modalTotal}>
                  Total: R$ {(produtoModal.preco * quantidade).toFixed(2).replace('.', ',')}
                </Text>
                <Text style={styles.modalMesa}>Adicionar à Mesa {comandaAtual?.mesa_numero}</Text>
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalButtonCancel} onPress={() => setProdutoModal(null)}>
                    <Text style={styles.modalButtonText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalButtonSave} onPress={confirmarAdicionar}>
                    <Text style={styles.modalButtonText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>
    </AppBackground>
  );
}

function ProdutoItem({ produto, onPress }: { produto: Produto; onPress: (p: Produto) => void }) {
  const temEstoque = produto.estoque === -1 || produto.estoque > 0;
  
  return (
    <TouchableOpacity style={styles.produtoCard} onPress={() => temEstoque && onPress(produto)} activeOpacity={0.9} disabled={!temEstoque}>
      {produto.imagem_url && (
        <Image source={{ uri: resolveAssetUrl(produto.imagem_url) }} style={styles.produtoImagem} resizeMode="cover" />
      )}
      <View style={styles.produtoInfo}>
        <View style={styles.produtoHeader}>
          <Text style={styles.produtoNome}>{produto.nome}</Text>
          {!temEstoque && <Text style={styles.semEstoque}>Indisponível</Text>}
        </View>
        {produto.descricao && <Text style={styles.produtoDesc}>{produto.descricao}</Text>}
        <Text style={styles.produtoPreco}>R$ {produto.preco.toFixed(2).replace('.', ',')}</Text>
      </View>
      <TouchableOpacity style={styles.addBtn} onPress={() => temEstoque && onPress(produto)} disabled={!temEstoque}>
        <Ionicons name="add" size={24} color={temEstoque ? 'white' : '#ccc'} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20, backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f' },
  headerTitle: { fontSize: 24, fontWeight: '700', color: '#f2f2f4' },
  comandaBadge: { backgroundColor: '#1a73e8', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  badgeText: { color: 'white', fontWeight: '600', fontSize: 14 },
  syncButton: { padding: 8 },
  categoriasContainer: { backgroundColor: '#14141a', borderBottomWidth: 1, borderBottomColor: '#26262f' },
  categoriasContent: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoriaBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#26262f' },
  categoriaAtiva: { backgroundColor: '#1a73e8' },
  categoriaBtnText: { fontSize: 14, fontWeight: '500', color: '#d4d4dc' },
  categoriaAtivaText: { color: 'white' },
  produtosList: { padding: 16, gap: 12 },
  produtoCard: { flexDirection: 'row', backgroundColor: '#1a1a22', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#26262f', opacity: 1 },
  produtoImagem: { width: 70, height: 70, borderRadius: 8, marginRight: 12 },
  produtoInfo: { flex: 1, justifyContent: 'center' },
  produtoHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  produtoNome: { fontSize: 16, fontWeight: '600', color: '#f2f2f4' },
  semEstoque: { fontSize: 11, color: '#ff6b5e', fontWeight: '500', backgroundColor: '#3a1518', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  produtoDesc: { fontSize: 13, color: '#9a9aa5', marginBottom: 4 },
  produtoPreco: { fontSize: 16, fontWeight: '700', color: '#4da3ff' },
  addBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center', marginLeft: 8 },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 16, color: '#6b6b78', marginTop: 12 },
  conexaoBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ea4335', paddingHorizontal: 16, paddingVertical: 12 },
  conexaoBannerText: { color: 'white', fontSize: 13, fontFamily: 'monospace', flex: 1 },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', padding: 24 },
  modalContent: { backgroundColor: '#16161d', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#26262f', alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#f2f2f4', marginBottom: 12 },
  modalProdutoNome: { fontSize: 16, fontWeight: '600', color: '#f2f2f4', textAlign: 'center' },
  modalPreco: { fontSize: 13, color: '#9a9aa5', marginTop: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 24, marginVertical: 20 },
  stepperBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a73e8', justifyContent: 'center', alignItems: 'center' },
  stepperValor: { fontSize: 28, fontWeight: '700', color: '#f2f2f4', minWidth: 48, textAlign: 'center' },
  modalTotal: { fontSize: 18, fontWeight: '700', color: '#4ade80' },
  modalMesa: { fontSize: 13, color: '#9a9aa5', marginTop: 8 },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16, alignSelf: 'stretch' },
  modalButtonCancel: { flex: 1, backgroundColor: '#26262f', padding: 14, borderRadius: 10, alignItems: 'center' },
  modalButtonSave: { flex: 1, backgroundColor: '#218838', padding: 14, borderRadius: 10, alignItems: 'center' },
  modalButtonText: { fontSize: 15, fontWeight: '600', color: '#fff' }
});