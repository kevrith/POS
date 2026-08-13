import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useOfflineSync } from '../lib/useOfflineSync';
import { useAuthStore } from '../stores/auth';
import { usePushNotifications } from '@pos/mobile-push';
import { routeForTap } from '../lib/push';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

/** When the session token is cleared (e.g. expired → 401), bounce to login. */
function SessionGuard() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const prev = useRef(token);
  useEffect(() => {
    if (prev.current && !token) {
      Alert.alert('Session expired', 'Please sign in again to continue.');
      router.replace('/(auth)/login');
    }
    prev.current = token;
  }, [token, router]);
  return null;
}

/** Runs inside the provider so it can invalidate queries after a sync. */
function OfflineSyncRunner() {
  useOfflineSync();
  return null;
}

/** Navigate to the relevant screen when an agent taps a push notification. */
function PushHandler() {
  const router = useRouter();
  usePushNotifications({
    onTap: (data) => {
      const route = routeForTap(data);
      if (route) router.push(route as never);
    },
  });
  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        {/* Dark icons over a translucent bar — same setup as the driver app.

            Leave translucent alone (expo-status-bar defaults it to true). It is
            what makes the window draw under the status bar, which in turn gives
            the tabs layout's SafeAreaView edges={['top']} a real top inset to paint
            Colors.background (orange-50) into. Passing translucent={false} collapses
            that inset to 0, the app's light surface never reaches behind the clock,
            and the strip falls back to the dark native theme colour — dark icons on
            dark = invisible. */}
        <StatusBar style="dark" />
        <OfflineSyncRunner />
        <PushHandler />
        <SessionGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
