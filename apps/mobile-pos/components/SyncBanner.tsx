import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { processSyncQueue } from '../lib/sync';
import { useSalesQueueStatus } from '../lib/useOfflineSync';
import { Colors } from '../constants/theme';

/**
 * Bar shown while sales made offline have not reached the server. Amber and tappable to retry while they are
 * waiting; red and tappable to open Settings when the server REFUSED one, because that needs a person.
 * Renders nothing when everything is synced.
 */
export function SyncBanner() {
  const router = useRouter();
  const { pending, rejected } = useSalesQueueStatus();
  if (pending === 0 && rejected.length === 0) return null;

  if (rejected.length > 0) {
    return (
      <TouchableOpacity style={[s.bar, s.error]} onPress={() => router.push('/(tabs)/settings' as never)} activeOpacity={0.8}>
        <Ionicons name="alert-circle-outline" size={16} color="#FFF" />
        <Text style={s.text}>
          {rejected.length} sale{rejected.length > 1 ? 's were' : ' was'} refused by the server: tap to review
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity style={s.bar} onPress={() => void processSyncQueue()} activeOpacity={0.8}>
      <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
      <Text style={s.text}>
        {pending} sale{pending > 1 ? 's' : ''} waiting to sync: tap to retry
      </Text>
      <Ionicons name="refresh" size={15} color="#FFF" />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: Colors.warning, paddingVertical: 7, paddingHorizontal: 12,
  },
  error: { backgroundColor: Colors.error },
  text: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
