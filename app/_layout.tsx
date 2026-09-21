import { Stack, useRouter } from 'expo-router';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initOfflineDB } from '@/services/offlineDB';
import { initApiUrl } from '@/services/api';
import NotificadorPedidosPronto from '@/components/NotificadorPedidosPronto';

try {
  initOfflineDB();
} catch (err) {
  console.warn('Falha ao inicializar banco offline no boot:', err);
}

function RootNavigator() {
  const { user, loading, initAuth } = useAuth();
  const router = useRouter();

  useEffect(() => {
    initAuth();
    initApiUrl();
  }, []);

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/(tabs)' : '/login');
  }, [loading, user]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a73e8" />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Stack screenOptions={{ headerShown: false }} initialRouteName="login">
        <Stack.Screen name="login" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="comanda/[id]" />
      </Stack>
      {user && <NotificadorPedidosPronto />}
      {!loading && (
        <View pointerEvents="none" style={styles.creditosWrap}>
          <Text style={styles.creditos}>Desenvolvido por Anderson Santos 2026</Text>
        </View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0f' },
  creditosWrap: {
    position: 'absolute',
    right: 6,
    bottom: 2,
    pointerEvents: 'none',
  },
  creditos: {
    fontSize: 10,
    color: 'rgba(154, 154, 165, 0.45)',
    fontWeight: '500',
  },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0f' }
});