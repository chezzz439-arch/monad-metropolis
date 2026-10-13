
import React from 'react';
import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { useClientOnlyValue } from '@/components/useClientOnlyValue';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#4834D4',
        tabBarInactiveTintColor: '#94A3B8',
        headerShown: useClientOnlyValue(false, true),
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopColor: '#E8EAF0',
          height: 65,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#FFFFFF',
        },
        headerTitleStyle: {
          fontWeight: '700',
          color: '#172033',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'My Circles',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>
              ◎
            </Text>
          ),
        }}
      />

      <Tabs.Screen
        name="two"
        options={{
          title: 'Payments',
          tabBarIcon: ({ color }) => (
            <Text style={{ color, fontSize: 24 }}>
              ⇄
            </Text>
          ),
        }}
      />
    </Tabs>
  );
}
