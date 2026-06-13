import { Tabs, Redirect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth';
import { SyncBanner } from '../../components/SyncBanner';
import { Colors } from '../../constants/theme';

export default function TabsLayout() {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Redirect href="/(auth)/login" />;

  // This layout owns the top inset (so the banner sits below the status bar);
  // the individual tab screens are plain Views and must NOT inset top again.
  return (
    <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* Sync banner pinned at the top; shows only when actions are queued */}
      <SyncBanner />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: Colors.primary,
          tabBarInactiveTintColor: Colors.textSecondary,
          tabBarStyle: {
            backgroundColor: Colors.card,
            borderTopColor: Colors.border,
            paddingBottom: 4,
            height: 60,
          },
          tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        }}
      >
        <Tabs.Screen
          name="today"
          options={{ title: 'Today', tabBarIcon: ({ color, size }) => <Ionicons name="today" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="customers"
          options={{ title: 'Customers', tabBarIcon: ({ color, size }) => <Ionicons name="people" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="order"
          options={{ title: 'New Order', tabBarIcon: ({ color, size }) => <Ionicons name="add-circle" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="collections"
          options={{ title: 'Collections', tabBarIcon: ({ color, size }) => <Ionicons name="cash" size={size} color={color} /> }}
        />
        <Tabs.Screen
          name="profile"
          options={{ title: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person" size={size} color={color} /> }}
        />
      </Tabs>
    </SafeAreaView>
  );
}
