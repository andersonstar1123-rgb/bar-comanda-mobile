import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { api } from '@/services/api';

interface Aviso {
  comandaId: string;
  itemId: string;
  mesa: string | number;
  produto: string;
  qtd: number;
  origem: 'cozinha' | 'qr';
  tipo?: string;
  total?: number;
  solicitacaoId?: string;
}

const POLL_MS = 10000;

export default function NotificadorPedidosPronto() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const ultimosStatus = useRef<Record<string, string>>({});
  const solicitacoesVistas = useRef<Record<string, boolean>>({});

  useEffect(() => {
    let ativo = true;

    const carregar = async () => {
      try {
        const [res, resSol] = await Promise.all([
          api.get('/comandas/abertas'),
          api.get('/solicitacoes', { params: { status: 'pendente' } }).catch(() => null)
        ]);
        const comandas = (res.data && res.data.comandas) || [];
        const visiveis = new Set<string>();

        const solicitacoesPendentes = (resSol && resSol.data && resSol.data.solicitacoes) || [];
        const idsVisiveis = new Set<string>();
        for (const sol of solicitacoesPendentes) {
          idsVisiveis.add(sol.id);
          if (!solicitacoesVistas.current[sol.id]) {
            solicitacoesVistas.current[sol.id] = true;
            setAvisos(prev => {
              if (prev.some(a => a.origem === 'qr' && a.solicitacaoId === sol.id)) return prev;
              return [...prev, {
                comandaId: '',
                itemId: `sol_${sol.id}`,
                mesa: sol.mesa_numero || sol.mesa_nome || '',
                produto: sol.tipo === 'fechar' ? 'Cliente pediu a conta' : 'Pedido do QR aguardando confirmação',
                qtd: 1,
                origem: 'qr',
                tipo: sol.tipo || 'pedido',
                total: sol.total,
                solicitacaoId: sol.id
              }];
            });
            try { Vibration.vibrate(500); } catch {}
          }
        }
        for (const chave of Object.keys(solicitacoesVistas.current)) {
          if (!idsVisiveis.has(chave)) {
            delete solicitacoesVistas.current[chave];
            setAvisos(prev => prev.filter(a => !(a.origem === 'qr' && a.solicitacaoId === chave)));
          }
        }

        for (const c of comandas) {
          for (const it of c.itens || []) {
            const chave = `${c.id}:${it.id}`;
            visiveis.add(chave);
            const anterior = ultimosStatus.current[chave];
            const atual = it.status;
            ultimosStatus.current[chave] = atual;

            if (anterior && (anterior === 'pendente' || anterior === 'preparando') && atual === 'pronto') {
              setAvisos(prev => {
                if (prev.some(a => a.itemId === it.id)) return prev;
                return [...prev, {
                  comandaId: c.id,
                  itemId: it.id,
                  mesa: c.mesa_numero || c.mesa_nome || c.mesa_id,
                  produto: it.produto_nome || 'Pedido',
                  qtd: it.quantidade || 1,
                  origem: 'cozinha'
                }];
              });
              try { Vibration.vibrate(500); } catch {}
            }

            if (atual === 'entregue') {
              setAvisos(prev => prev.filter(a => a.itemId !== it.id));
            }
          }
        }

        for (const chave of Object.keys(ultimosStatus.current)) {
          if (!visiveis.has(chave)) {
            delete ultimosStatus.current[chave];
            const itemId = chave.split(':')[1];
            setAvisos(prev => prev.filter(a => a.itemId !== itemId));
          }
        }
      } catch (err) {
        return;
      }
    };

    carregar();
    const timer = setInterval(carregar, POLL_MS);
    return () => { ativo = false; clearInterval(timer); };
  }, []);

  if (avisos.length === 0) return null;

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { top: insets.top + 6 }]}>
      {avisos.map(aviso => (
        <TouchableOpacity
          key={aviso.itemId}
          style={[styles.card, aviso.origem === 'qr' && styles.cardQr]}
          onPress={() => {
            setAvisos(prev => prev.filter(a => a.itemId !== aviso.itemId));
            if (aviso.origem === 'qr') {
              router.push(aviso.tipo === 'fechar' ? '/(tabs)/index' : '/(tabs)/comandas');
            } else if (aviso.comandaId) {
              router.push(`/comanda/${aviso.comandaId}`);
            }
          }}
        >
          <View style={[styles.cardIcone, aviso.origem === 'qr' && styles.cardIconeQr]}>
            <Ionicons name={aviso.tipo === 'fechar' ? 'receipt-outline' : aviso.origem === 'qr' ? 'qr-code' : 'notifications'} size={18} color="#fff" />
          </View>
          <View style={styles.cardCorpo}>
            <Text style={styles.cardTitulo}>{aviso.tipo === 'fechar' ? `Conta pedida — Mesa ${aviso.mesa}` : aviso.origem === 'qr' ? `Novo pedido do QR — Mesa ${aviso.mesa}` : `Pedido Pronto — Mesa ${aviso.mesa}`}</Text>
            <Text style={styles.cardTexto} numberOfLines={1}>
              {aviso.tipo === 'fechar'
                ? 'O fechamento será feito no painel'
                : aviso.origem === 'qr'
                ? `Pedido de R$ ${(aviso.total ?? 0).toFixed(2).replace('.', ',')} aguardando — toque para confirmar`
                : `${aviso.produto} x${aviso.qtd} — vá buscar`}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.fechar}
            onPress={() => setAvisos(prev => prev.filter(a => a.itemId !== aviso.itemId))}
          >
            <Ionicons name="close" size={16} color="#9a9aa5" />
          </TouchableOpacity>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 10,
    right: 10,
    zIndex: 9999,
    gap: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1c2333',
    borderWidth: 1,
    borderColor: '#34a853',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  cardQr: { borderColor: '#1a73e8', backgroundColor: '#141b2c' },
  cardIconeQr: { backgroundColor: '#1a73e8' },
  cardIcone: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#34a853',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardCorpo: { flex: 1 },
  cardTitulo: { color: '#f2f2f4', fontWeight: '700', fontSize: 14 },
  cardTexto: { color: '#b8b8c2', fontSize: 13, marginTop: 1 },
  fechar: { padding: 6 },
});