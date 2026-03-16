import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useAuthStore } from '../stores/auth';
import { Colors } from '../constants/theme';

export default function Index() {
  const { token, setTokenFromStorage } = useAuthStore();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    SecureStore.getItemAsync('pos_token')
      .then((stored) => {
        if (stored) setTokenFromStorage(stored);
      })
      .catch(() => {})
      .finally(() => setHydrated(true));
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
