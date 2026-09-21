import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, Switch, TextInput, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/store';
import { api, initApiUrl } from '@/services/api';
import { setApiUrl } from '@/services/api';
import { fullSync, isOnline as checkConnection } from '@/services/sync';
import AppBackground from '@/components/AppBackground';

export default function ConfigScreen() {
  const { user, logout } = useAuth();
  const { configuracoes, setConfiguracoes, isOnline, setIsOnline, pendingSync, setPendingSync, loadCache } = useStore();
  const [apiUrl, setApiUrlState] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [versao, setVersao] = useState('1.0.0');

  const testarConexao = async () => {
    setCarregando(true);
    try {
      await setApiUrl(apiUrl);
      const raiz = (api.defaults.baseURL || apiUrl).replace(/\/api\/?$/, '');
      const probeURL = `${raiz}/health`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const probe = await fetch(probeURL, { method: 'GET', signal: controller.signal });
        if (!probe.ok) throw new Error(`HTTP ${probe.status}`);
        Alert.alert('Sucesso', `Servidor respondeu: ${'ok'}`);
      } finally {
        clearTimeout(timer);
      }
      await fullSync();
      await loadCache();
    } catch (err: any) {
      Alert.alert('Erro', err.message || 'Não foi possível conectar ao servidor');
    } finally {
      setCarregando(false);
    }
  };

  const verificarOnline = async () => {
    const online = await checkConnection();
    setIsOnline(online);
  };

  useEffect(() => {
    (async () => {
      await initApiUrl();
      setApiUrlState(api.defaults.baseURL || 'http://192.168.90.2:3001/api');
      verificarOnline();
    })();
  }, [configuracoes]);

  return (
    <AppBackground style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Conta</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Nome</Text>
            <Text style={styles.infoValue}>{user?.nome}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Email</Text>
            <Text style={styles.infoValue}>{user?.email}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Papel</Text>
            <Text style={styles.infoValue}>{user?.papel}</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.logoutBtn} onPress={logout}>
          <Ionicons name="log-out" size={20} color="#ff6b5e" style={{ marginRight: 8 }} />
          <Text style={styles.logoutText}>Trocar Garçom (sair da conta)</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Servidor</Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>URL da API</Text>
          <TextInput
            style={styles.input}
            value={apiUrl}
            onChangeText={setApiUrlState}
            placeholder="http://192.168.1.100:3001/api"
          />
        </View>
        <View style={styles.statusRow}>
          <View style={[styles.statusBadge, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusText}>{isOnline ? 'Online' : 'Offline'}</Text>
          </View>
          <TouchableOpacity style={styles.syncBtn} onPress={verificarOnline} disabled={carregando}>
            <Ionicons name={carregando ? 'sync' : 'refresh'} size={18} color="white" style={{ marginRight: 6 }} spin={carregando} />
            <Text style={styles.syncBtnText}>{carregando ? 'Verificando...' : 'Verificar Conexão'}</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.testBtn} onPress={testarConexao} disabled={carregando}>
          <Ionicons name="wifi" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.testBtnText}>Testar Conexão e Sincronizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sincronização</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Pendentes</Text>
            <Text style={[styles.infoValue, { color: pendingSync > 0 ? '#ea4335' : '#34a853' }]}>{pendingSync} itens</Text>
          </View>
        </View>
        <TouchableOpacity style={styles.syncBtn} onPress={fullSync} disabled={carregando || !isOnline}>
          <Ionicons name="cloud-upload" size={20} color="white" style={{ marginRight: 8 }} />
          <Text style={styles.syncBtnText}>Sincronizar Agora</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Configurações do Bar</Text>
        {configuracoes && (
          <View style={styles.configGrid}>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Nome</Text>
              <Text style={styles.configValue}>{configuracoes.bar_nome}</Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Moeda</Text>
              <Text style={styles.configValue}>{configuracoes.moeda}</Text>
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Cor Primária</Text>
              <View style={[styles.colorPreview, { backgroundColor: configuracoes.bar_cor_primaria }]} />
            </View>
            <View style={styles.configItem}>
              <Text style={styles.configLabel}>Cor Secundária</Text>
              <View style={[styles.colorPreview, { backgroundColor: configuracoes.bar_cor_secundaria }]} />
            </View>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sobre</Text>
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Versão</Text>
            <Text style={styles.infoValue}>{versao}</Text>
          </View>
          <View style={styles.infoItem}>
            <Text style={styles.infoLabel}>Build</Text>
            <Text style={styles.infoValue}>Desenvolvimento</Text>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Bar Comanda v1.0</Text>
        <Text style={styles.footerText}>Sistema de comanda offline-first</Text>
      </View>
      </ScrollView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  content: { paddingBottom: 40 },
  section: { backgroundColor: '#16161d', margin: 16, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#26262f' },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: '#f2f2f4', marginBottom: 16 },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  infoItem: { flex: 1, minWidth: 140 },
  infoLabel: { fontSize: 12, color: '#6b6b78', marginBottom: 4, textTransform: 'uppercase' },
  infoValue: { fontSize: 15, fontWeight: '500', color: '#f2f2f4' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginTop: 8, borderTopWidth: 1, borderTopColor: '#26262f' },
  logoutText: { color: '#ff6b5e', fontWeight: '600', fontSize: 16 },
  inputGroup: { marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: '500', color: '#9a9aa5', marginBottom: 8 },
  input: { backgroundColor: '#1f1f28', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#2a2a35', color: '#f2f2f4' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  statusOnline: { backgroundColor: '#123a1f' },
  statusOffline: { backgroundColor: '#3a1518' },
  statusText: { fontSize: 13, fontWeight: '600', color: '#d4d4dc' },
  syncBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1a73e8', borderRadius: 12, paddingVertical: 12 },
  syncBtnText: { color: 'white', fontWeight: '600' },
  testBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#218838', borderRadius: 12, paddingVertical: 14, marginTop: 12 },
  testBtnText: { color: 'white', fontWeight: '600', fontSize: 16 },
  configGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  configItem: { flex: 1, minWidth: 140 },
  configLabel: { fontSize: 12, color: '#6b6b78', marginBottom: 4, textTransform: 'uppercase' },
  configValue: { fontSize: 15, fontWeight: '500', color: '#f2f2f4' },
  colorPreview: { height: 32, borderRadius: 8, borderWidth: 1, borderColor: '#26262f' },
  footer: { alignItems: 'center', padding: 20, gap: 4 },
  footerText: { fontSize: 12, color: '#5c5c68' }
});