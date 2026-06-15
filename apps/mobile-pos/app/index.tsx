import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuthStore, restoreSession } from '../stores/auth';
import { restoreActiveStore } from '../stores/activeStore';
import { Colors } from '../constants/theme';

export default function Index() {
  const token = useAuthStore((s) => s.token);
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

  return <Redirect href={token ? '/(tabs)/pos' : '/(auth)/login'} />;
}
