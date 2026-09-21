import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Alert, ActivityIndicator, Image, ImageBackground } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useStore } from '@/store';
import { api, resolveAssetUrl } from '@/services/api';

export default function LoginScreen() {
  const router = useRouter();
  const { login, loading: authLoading } = useAuth();
  const { loadCache } = useStore();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<{ bar_nome: string; bar_logo: string; bar_background: string; bar_cor_primaria: string } | null>(null);

  useEffect(() => {
    let ativo = true;
    api.get('/configuracoes/public')
      .then((res) => { if (ativo && res.data?.configuracoes) setConfig(res.data.configuracoes); })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  const handleLogin = async () => {
    if (!email || !senha) {
      Alert.alert('Erro', 'Preencha email e senha');
      return;
    }
    setLoading(true);
    try {
      await login(email, senha);
      await loadCache();
      router.replace('/(tabs)');
    } catch (err: any) {
      Alert.alert('Erro', err.response?.data?.erro || 'Erro ao fazer login');
    } finally {
      setLoading(false);
    }
  };

  const bgUri = config?.bar_background ? resolveAssetUrl(config.bar_background) : null;

  return (
    <ImageBackground source={bgUri ? { uri: bgUri } : require('../assets/bg_comida.jpg')} style={styles.container} imageStyle={styles.bgImage}>
      <View style={styles.overlay} />
      <View style={styles.card}>
        {config?.bar_logo && (
          <Image source={{ uri: resolveAssetUrl(config.bar_logo) }} style={styles.logo} resizeMode="contain" />
        )}
        <Text style={[styles.title, { color: config?.bar_cor_primaria || '#4da3ff' }]}>
          {config?.bar_nome || 'Bar Comanda'}
        </Text>
        <Text style={styles.subtitle}>Login do Garçom</Text>
        <Text style={styles.info}>Para começar, entre com sua conta de garçom. Todos os pedidos ficam registrados no seu nome no servidor.</Text>

        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor="#5c5c68"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
        </View>

        <View style={styles.inputGroup}>
          <TextInput
            style={styles.input}
            placeholder="Senha"
            placeholderTextColor="#5c5c68"
            value={senha}
            onChangeText={setSenha}
            secureTextEntry
            autoComplete="password"
          />
        </View>

        <TouchableOpacity
          style={[styles.button, { backgroundColor: config?.bar_cor_primaria || '#1a73e8' }]}
          onPress={handleLogin}
          disabled={loading || authLoading}
        >
          {loading || authLoading ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.buttonText}>Entrar e Iniciar</Text>
          )}
        </TouchableOpacity>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#0a0a0f' },
  bgImage: { flex: 1, resizeMode: 'cover' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(8,8,12,0.45)' },
  card: { backgroundColor: 'rgba(22,22,29,0.94)', borderRadius: 16, padding: 32, borderWidth: 1, borderColor: '#26262f' },
  logo: { width: 100, height: 100, marginBottom: 16, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '700', textAlign: 'center', marginBottom: 4 },
  subtitle: { fontSize: 16, color: '#9a9aa5', textAlign: 'center', marginBottom: 12 },
  info: { fontSize: 13, color: '#6b6b78', textAlign: 'center', marginBottom: 24, lineHeight: 18 },
  inputGroup: { marginBottom: 16 },
  input: { backgroundColor: '#1f1f28', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#2a2a35', color: '#f2f2f4' },
  button: { borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8 },
  buttonText: { color: 'white', fontSize: 18, fontWeight: '600' }
});
