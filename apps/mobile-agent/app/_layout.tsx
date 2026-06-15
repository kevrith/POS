import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useOfflineSync } from '../lib/useOfflineSync';
import { usePushNotifications } from '@pos/mobile-push';
import { routeForTap } from '../lib/push';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 60_000 } },
});

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
        {/* dark icons — the app uses light backgrounds, keeps battery/clock legible */}
        <StatusBar style="dark" />
        <OfflineSyncRunner />
        <PushHandler />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
