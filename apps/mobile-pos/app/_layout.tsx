import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth';

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient();

function DeepLinkHandler() {
  const router = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);

  useEffect(() => {
    async function handleUrl(url: string) {
      if (!url.includes('auth/google')) return;
      try {
        const parsed = Linking.parse(url);
        const params = parsed.queryParams as Record<string, string | string[]>;
        const token      = params['token']      as string | undefined;
        const id         = params['id']         as string | undefined;
        const businessId = params['businessId'] as string | undefined;
        const role       = params['role']       as string | undefined;
        const name       = params['name']       as string | undefined;
        const email      = params['email']      as string | undefined;
        if (!token || !id || !businessId || !role) return;
        await SecureStore.setItemAsync('pos_token', token);
        setAuth(
          {
            id,
            name:       decodeURIComponent(name ?? ''),
            email:      email ? decodeURIComponent(email) : null,
            role,
            businessId,
          },
          token,
        );
        router.replace('/(tabs)/pos');
      } catch { /* ignore malformed deep link */ }
    }

    void Linking.getInitialURL().then(url => { if (url) void handleUrl(url); });

    const sub = Linking.addEventListener('url', ({ url }) => { void handleUrl(url); });
    return () => sub.remove();
  }, [router, setAuth]);

  return null;
}

export default function RootLayout() {
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <DeepLinkHandler />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
