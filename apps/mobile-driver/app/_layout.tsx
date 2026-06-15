import { Stack, useRouter, useSegments } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as Font from 'expo-font';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth';
import { usePushNotifications } from '@pos/mobile-push';
import { routeForTap } from '../lib/push';
import { useOfflineSync } from '../lib/useOfflineSync';
import { useLocationBroadcast } from '../lib/location';
import { SyncBanner } from '../components/SyncBanner';
import { View, ActivityIndicator } from 'react-native';
import { Colors } from '../constants/theme';

const queryClient = new QueryClient();

/** Flushes the offline action queue + broadcasts live location while logged in. */
function DriverBackgroundTasks() {
  const driverId = useAuthStore((s) => s.user?.id);
  useOfflineSync();
  useLocationBroadcast(driverId);
  return null;
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const { token, setAuth } = useAuthStore();
  const [checking, setChecking] = useState(true);

  // Tapping a "New delivery" push opens that delivery (works from cold start too).
  usePushNotifications({
    onTap: (data) => {
      const route = routeForTap(data);
      if (route) router.push(route as never);
    },
  });

  useEffect(() => {
    async function check() {
      try {
        const storedToken = await SecureStore.getItemAsync('driver_token');
        if (storedToken) {
          // Token found — we can restore session if needed
        }
      } catch {}
      setChecking(false);
    }
    check();
  }, []);

  useEffect(() => {
    if (checking) return;
    const inAuth = segments[0] === '(auth)';
    if (!token && !inAuth) {
      router.replace('/(auth)/login');
    } else if (token && inAuth) {
      router.replace('/(tabs)/deliveries');
    }
  }, [token, segments, checking]);

  if (checking) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: Colors.background }}>
        <ActivityIndicator size="large" color={Colors.primary} />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = Font.useFonts(Ionicons.font);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {/* dark icons — the app uses light backgrounds, keeps battery/clock legible */}
        <StatusBar style="dark" />
        <AuthGate>
          <DriverBackgroundTasks />
          <SyncBanner />
          <Stack screenOptions={{ headerShown: false }} />
        </AuthGate>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
