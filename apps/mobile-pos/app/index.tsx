import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore, restoreSession } from '../stores/auth';
import { restoreActiveStore } from '../stores/activeStore';
import { Colors } from '../constants/theme';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const role = useAuthStore((s) => s.user?.role);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    void Promise.all([restoreSession(), restoreActiveStore()]).finally(() => setHydrated(true));
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  // A kitchen account has one job, so it opens straight onto the tickets.
  if (token && (role ?? '').toUpperCase() === 'KITCHEN') return <Redirect href={'/manage-kitchen' as any} />;

  return <Redirect href={token ? '/(tabs)/pos' : '/(auth)/login'} />;
}
