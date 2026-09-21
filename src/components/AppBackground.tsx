import React from 'react';
import { View, ImageBackground, StyleSheet } from 'react-native';
import { useStore } from '@/store';
import { resolveAssetUrl } from '@/services/api';

export default function AppBackground({ children, style }: { children: React.ReactNode; style?: any }) {
  const bar_background = useStore((s) => s.configuracoes?.bar_background) || '';

  if (!bar_background) {
    return <View style={[styles.fallback, style]}>{children}</View>;
  }

  return (
    <ImageBackground source={{ uri: resolveAssetUrl(bar_background) }} style={[styles.fundo, style]} imageStyle={styles.imagem}>
      <View style={styles.overlay}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  fundo: { flex: 1 },
  imagem: { resizeMode: 'cover' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,10,0.72)' },
  fallback: { flex: 1, backgroundColor: '#0a0a0f' },
});