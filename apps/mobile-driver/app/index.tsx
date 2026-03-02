import { Redirect } from 'expo-router';
import { useAuthStore } from '../stores/auth';

export default function Index() {
  const token = useAuthStore((s) => s.token);
  if (token) {
    return <Redirect href="/(tabs)/deliveries" />;
  }
  return <Redirect href="/(auth)/login" />;
}
