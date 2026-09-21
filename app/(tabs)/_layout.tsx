import { Tabs, Redirect } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useStore } from '@/store';

export default function TabLayout() {
  const { user } = useAuth();
  const { logout } = useAuth();
  const { configuracoes } = useStore();
  const corPrimaria = configuracoes?.bar_cor_primaria || '#1a73e8';

  if (!user) {
    return <Redirect href="/login" />;
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: corPrimaria,
        tabBarInactiveTintColor: '#6b6b78',
        tabBarStyle: { backgroundColor: '#121218', borderTopColor: '#26262f', borderTopWidth: 1, elevation: 0, shadowOpacity: 0 },
        headerShown: false
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Mesas',
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'restaurant' : 'restaurant-outline'} size={26} color={color} />
        }}
      />
      <Tabs.Screen
        name="cardapio"
        options={{
          title: 'Cardápio',
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'menu' : 'menu-outline'} size={26} color={color} />
        }}
      />
      <Tabs.Screen
        name="comandas"
        options={{
          title: 'Comandas',
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={26} color={color} />
        }}
      />
      <Tabs.Screen
        name="config"
        options={{
          title: 'Config',
          tabBarIcon: ({ focused, color }) => <Ionicons name={focused ? 'settings' : 'settings-outline'} size={26} color={color} />
        }}
      />
    </Tabs>
  );
}