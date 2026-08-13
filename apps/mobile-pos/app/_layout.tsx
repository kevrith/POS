import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/auth';
import { usePushNotifications } from '@pos/mobile-push';
import { routeForTap } from '../lib/push';

/** Watches the auth token. If it gets cleared while the app is open (e.g. the
 *  API wrapper detected an expired session on a 401), bounce to the login
 *  screen with a clear message instead of leaving the user on empty screens. */
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

SplashScreen.preventAutoHideAsync();

/** Navigate to the relevant screen when a manager taps a push notification. */
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
        {/* Dark icons on a white bar. app.json used to declare the app as
            userInterfaceStyle "dark" while the theme is light, so Android drew
            white icons over the light grey background and the clock and battery
            were unreadable. backgroundColor is set here too because the app.json
            value alone does not apply on every Android version. */}
        <StatusBar style="dark" backgroundColor="#FFFFFF" />
        <DeepLinkHandler />
        <PushHandler />
        <SessionGuard />
        <Stack screenOptions={{ headerShown: false }} />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
