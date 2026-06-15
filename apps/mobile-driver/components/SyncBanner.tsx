import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { flushQueue } from '../lib/offline';
import { usePendingActions } from '../lib/useOfflineSync';
import { Colors } from '../constants/theme';

/**
 * Thin amber bar shown whenever there are unsynced status changes. Tapping it
 * forces a flush. Renders nothing when the queue is empty.
 */
export function SyncBanner() {
  const pending = usePendingActions();
  if (pending.length === 0) return null;

  return (
    <TouchableOpacity style={s.bar} onPress={() => void flushQueue()} activeOpacity={0.8}>
      <Ionicons name="cloud-offline-outline" size={16} color="#FFF" />
      <Text style={s.text}>
        {pending.length} update{pending.length > 1 ? 's' : ''} waiting to sync — tap to retry
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
  text: { color: '#FFF', fontSize: 12, fontWeight: '700' },
});
