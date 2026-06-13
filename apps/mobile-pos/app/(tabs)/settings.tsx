import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { mobileApi } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';
import { processSyncQueue } from '../../lib/sync';
import { isPrintingEnabled, setPrintingEnabled } from '../../lib/receiptPrint';

const SERVER_URL_KEY = 'pos_server_url';
const DEFAULT_URL = 'https://pos-bhe5.onrender.com/api/v1';

interface BusinessInfo {
  name: string;
  planName?: string;
  phone?: string;
  email?: string;
}

export default function SettingsScreen() {
  const router = useRouter();
  const { user, clearAuth } = useAuthStore();
  const { clearCart } = useCartStore();

  const { businessId } = useActiveStore();

  const [serverUrl, setServerUrl] = useState(DEFAULT_URL);
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ synced: number; failed: number } | null>(null);
  const [printOn, setPrintOn] = useState(false);

  // Load stored server URL
  useEffect(() => {
    SecureStore.getItemAsync(SERVER_URL_KEY).then((val) => {
      if (val) {
        setServerUrl(val);
        setUrlInput(val);
      } else {
        setUrlInput(DEFAULT_URL);
      }
    });
    void isPrintingEnabled().then(setPrintOn);
  }, []);

  async function togglePrinting(on: boolean) {
    setPrintOn(on);
    await setPrintingEnabled(on);
  }

  const { data: businessInfo } = useQuery<BusinessInfo>({
    queryKey: ['business-settings', businessId],
    queryFn: () => mobileApi.get<BusinessInfo>(`/business/${businessId}/settings`),
    staleTime: 5 * 60_000,
  });

  async function handleSaveUrl() {
    const trimmed = urlInput.trim();
    if (!trimmed) {
      Alert.alert('Invalid', 'Server URL cannot be empty.');
      return;
    }
    await SecureStore.setItemAsync(SERVER_URL_KEY, trimmed);
    setServerUrl(trimmed);
    setEditingUrl(false);
    Alert.alert('Saved', 'Server URL updated. Restart the app to apply changes.');
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const result = await processSyncQueue();
      setSyncResult(result);
    } catch (err: any) {
      Alert.alert('Sync Error', err.message ?? 'Could not sync offline queue.');
    } finally {
      setSyncing(false);
    }
  }

  function handleLogout() {
    Alert.alert(
      'Logout',
      'Are you sure you want to log out? Unsaved cart data will be lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => {
            clearCart();
            clearAuth();
            router.replace('/(auth)/login');
          },
        },
      ]
    );
  }

  const roleColor: Record<string, string> = {
    OWNER: Colors.indigo,
    MANAGER: Colors.warning,
    CASHIER: Colors.primary,
    WAITER: Colors.success,
  };

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Profile */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <View style={styles.profileRow}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {user?.name?.charAt(0)?.toUpperCase() ?? '?'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{user?.name ?? 'Unknown User'}</Text>
              {user?.email ? (
                <Text style={styles.profileSub}>{user.email}</Text>
              ) : null}
              <View style={[styles.roleBadge, { backgroundColor: (roleColor[user?.role ?? ''] ?? Colors.primary) + '20' }]}>
                <Text style={[styles.roleText, { color: roleColor[user?.role ?? ''] ?? Colors.primary }]}>
                  {user?.role ?? 'CASHIER'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Business Info */}
        {businessInfo && (
          <>
            <Text style={styles.sectionTitle}>Business</Text>
            <View style={styles.card}>
              <View style={styles.infoRow}>
                <Ionicons name="business-outline" size={18} color={Colors.primary} />
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Business Name</Text>
                  <Text style={styles.infoValue}>{businessInfo.name}</Text>
                </View>
              </View>
              {businessInfo.planName && (
                <View style={[styles.infoRow, styles.infoRowBorder]}>
                  <Ionicons name="shield-checkmark-outline" size={18} color={Colors.success} />
                  <View style={styles.infoText}>
                    <Text style={styles.infoLabel}>Plan</Text>
                    <Text style={styles.infoValue}>{businessInfo.planName}</Text>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* Server Connection */}
        <Text style={styles.sectionTitle}>Server Connection</Text>
        <View style={styles.card}>
          <View style={styles.infoRow}>
            <Ionicons name="server-outline" size={18} color={Colors.textSecondary} />
            <View style={styles.infoText}>
              <Text style={styles.infoLabel}>API Server URL</Text>
              {editingUrl ? (
                <TextInput
                  style={styles.urlInput}
                  value={urlInput}
                  onChangeText={setUrlInput}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  placeholder="http://..."
                  placeholderTextColor={Colors.textSecondary}
                />
              ) : (
                <Text style={styles.urlDisplay} numberOfLines={1}>{serverUrl}</Text>
              )}
            </View>
            <TouchableOpacity
              onPress={() => {
                if (editingUrl) {
                  handleSaveUrl();
                } else {
                  setEditingUrl(true);
                  setUrlInput(serverUrl);
                }
              }}
              style={styles.editBtn}
            >
              <Ionicons
                name={editingUrl ? 'checkmark-circle' : 'pencil'}
                size={20}
                color={editingUrl ? Colors.success : Colors.primary}
              />
            </TouchableOpacity>
          </View>
          {editingUrl && (
            <TouchableOpacity
              style={styles.cancelEditBtn}
              onPress={() => setEditingUrl(false)}
            >
              <Text style={styles.cancelEditText}>Cancel</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Receipt Printing */}
        <Text style={styles.sectionTitle}>Receipt Printing</Text>
        <View style={styles.card}>
          <View style={styles.printRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.printTitle}>Print receipts</Text>
              <Text style={styles.printDesc}>
                {printOn
                  ? 'A “Print Receipt” button shows after each sale (opens the system print sheet — Bluetooth/Wi-Fi printer or PDF).'
                  : 'Off — receipts are digital only (sent by SMS/WhatsApp when the sale has a customer).'}
              </Text>
            </View>
            <Switch
              value={printOn}
              onValueChange={togglePrinting}
              trackColor={{ true: Colors.primary }}
              thumbColor={printOn ? Colors.primary : '#f4f3f4'}
            />
          </View>
        </View>

        {/* Offline Sync */}
        <Text style={styles.sectionTitle}>Offline Queue</Text>
        <View style={styles.card}>
          <Text style={styles.syncDesc}>
            Sync failed offline sales to the server when connectivity is restored.
          </Text>
          {syncResult && (
            <View style={[styles.syncResult, { backgroundColor: syncResult.failed > 0 ? Colors.warning + '15' : Colors.success + '15' }]}>
              <Ionicons
                name={syncResult.failed > 0 ? 'warning-outline' : 'checkmark-circle-outline'}
                size={16}
                color={syncResult.failed > 0 ? Colors.warning : Colors.success}
              />
              <Text style={[styles.syncResultText, { color: syncResult.failed > 0 ? Colors.warning : Colors.success }]}>
                {syncResult.synced} synced, {syncResult.failed} failed
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={[styles.syncBtn, syncing && { opacity: 0.7 }]}
            onPress={handleSync}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator color={Colors.primary} size="small" />
            ) : (
              <Ionicons name="sync-outline" size={18} color={Colors.primary} />
            )}
            <Text style={styles.syncBtnText}>{syncing ? 'Syncing...' : 'Sync Now'}</Text>
          </TouchableOpacity>
        </View>

        {/* App Info */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.card}>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutLabel}>App Version</Text>
            <Text style={styles.aboutValue}>1.0.0</Text>
          </View>
          <View style={[styles.aboutRow, styles.infoRowBorder]}>
            <Text style={styles.aboutLabel}>Business ID</Text>
            <Text style={styles.aboutValue} numberOfLines={1}>{businessId}</Text>
          </View>
          <View style={[styles.aboutRow, styles.infoRowBorder]}>
            <Text style={styles.aboutLabel}>Store ID</Text>
            <Text style={styles.aboutValue} numberOfLines={1}>{user?.storeId ?? '—'}</Text>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Ionicons name="log-out-outline" size={20} color={Colors.error} />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  content: { padding: 16, gap: 8, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 4,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 22, fontWeight: '800', color: Colors.primary },
  profileInfo: { flex: 1, gap: 3 },
  profileName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  profileSub: { fontSize: 13, color: Colors.textSecondary },
  roleBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 2,
  },
  roleText: { fontSize: 11, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 4 },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: Colors.border, paddingTop: 10, marginTop: 6 },
  infoText: { flex: 1 },
  infoLabel: { fontSize: 12, color: Colors.textSecondary, marginBottom: 1 },
  infoValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  editBtn: { padding: 4 },
  urlDisplay: { fontSize: 13, color: Colors.text },
  urlInput: {
    fontSize: 13,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: 4,
    backgroundColor: Colors.background,
  },
  cancelEditBtn: { alignSelf: 'flex-start', marginTop: 8 },
  cancelEditText: { fontSize: 13, color: Colors.error },
  syncDesc: { fontSize: 13, color: Colors.textSecondary, marginBottom: 12 },
  printRow: { flexDirection: 'row', alignItems: 'center' },
  printTitle: { fontSize: 15, fontWeight: '600', color: Colors.text },
  printDesc: { fontSize: 12, color: Colors.textSecondary, marginTop: 3, lineHeight: 17 },
  syncResult: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 8,
    marginBottom: 10,
  },
  syncResultText: { fontSize: 13, fontWeight: '600' },
  syncBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.primary,
  },
  syncBtnText: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  aboutRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  aboutLabel: { fontSize: 13, color: Colors.textSecondary },
  aboutValue: { fontSize: 13, fontWeight: '600', color: Colors.text, flex: 1, textAlign: 'right' },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.error + '12',
    marginTop: 8,
  },
  logoutText: { fontSize: 16, color: Colors.error, fontWeight: '700' },
});
