import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../stores/auth';
import { buildLabel } from '../../lib/buildInfo';
import { getBaseUrl } from '../../lib/api';
import { clearPushToken } from '../../lib/push';
import { Colors } from '../../constants/theme';

export default function ProfileScreen() {
  // Reads the URL the app is actually pointed at, rather than a hardcoded string
  // that stayed "localhost:3010" no matter where the app was talking to.
  const [serverUrl, setServerUrl] = useState('…');
  useEffect(() => { void getBaseUrl().then(setServerUrl); }, []);

  const router = useRouter();
  const { user, clearAuth } = useAuthStore();

  function handleLogout() {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => {
            if (user?.id) void clearPushToken(user.id);
            clearAuth();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <View style={styles.content}>
        {/* Avatar */}
        <View style={styles.avatarSection}>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>
              {user?.name?.charAt(0)?.toUpperCase() ?? 'D'}
            </Text>
          </View>
          <Text style={styles.driverName}>{user?.name ?? 'Driver'}</Text>
          <View style={styles.roleBadge}>
            <Ionicons name="bicycle" size={13} color={Colors.primary} />
            <Text style={styles.roleText}>{user?.role ?? 'DRIVER'}</Text>
          </View>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Account Details</Text>

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Email</Text>
            </View>
            <Text style={styles.infoValue} numberOfLines={1}>
              {user?.email ?? '—'}
            </Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="business-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Business ID</Text>
            </View>
            <Text style={styles.infoValue}>{user?.businessId ?? '—'}</Text>
          </View>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="id-card-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Driver ID</Text>
            </View>
            <Text style={styles.infoValue} numberOfLines={1}>
              {user?.id ? user.id.slice(0, 12) + '...' : '—'}
            </Text>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>App Info</Text>
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="information-circle-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Version</Text>
            </View>
            <Text style={styles.infoValue}>{buildLabel()}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <View style={styles.infoLeft}>
              <Ionicons name="server-outline" size={18} color={Colors.textSecondary} />
              <Text style={styles.infoLabel}>Server</Text>
            </View>
            <Text style={styles.infoValue} numberOfLines={1}>{serverUrl}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={styles.logoutBtn}
          onPress={handleLogout}
          activeOpacity={0.85}
        >
          <Ionicons name="log-out-outline" size={20} color="#FFFFFF" />
          <Text style={styles.logoutBtnText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  content: { flex: 1, padding: 16, gap: 16 },
  avatarSection: { alignItems: 'center', paddingVertical: 24, gap: 10 },
  avatarCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: '#FFFFFF' },
  driverName: { fontSize: 22, fontWeight: '700', color: Colors.text },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    gap: 5,
  },
  roleText: { fontSize: 13, color: Colors.primary, fontWeight: '600' },
  infoCard: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  cardTitle: { fontSize: 14, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  infoLabel: { fontSize: 14, color: Colors.textSecondary },
  infoValue: {
    fontSize: 13,
    color: Colors.text,
    fontWeight: '500',
    maxWidth: 160,
    textAlign: 'right',
  },
  divider: { height: 1, backgroundColor: Colors.border },
  logoutBtn: {
    backgroundColor: Colors.error,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  logoutBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
