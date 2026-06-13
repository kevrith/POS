/**
 * Agent login — email/password with a configurable server URL.
 * Sales agents are Users with role SALES_AGENT; they sign in with the
 * same credentials created for them in the web POS (Settings → Users).
 */
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { agentApi, SERVER_URL_KEY, DEFAULT_BASE_URL, getBaseUrl, friendlyError } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors } from '../../constants/theme';

interface LoginResponse {
  accessToken?: string;
  access_token?: string;
  user: { id: string; name: string; email: string | null; role: string; businessId: string; storeId?: string };
}

type Screen = 'SERVER_URL' | 'LOGIN';

export default function LoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [screen, setScreen] = useState<Screen>('SERVER_URL');
  const [urlInput, setUrlInput] = useState(DEFAULT_BASE_URL);
  const [urlTesting, setUrlTesting] = useState(false);
  const [urlError, setUrlError] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(SERVER_URL_KEY).then((stored) => {
      if (stored) { setUrlInput(stored); setScreen('LOGIN'); }
    });
  }, []);

  async function handleSaveUrl() {
    const url = urlInput.trim().replace(/\/$/, '');
    if (!url) { setUrlError('Please enter the server URL.'); return; }
    setUrlTesting(true);
    setUrlError('');
    try {
      const res = await fetch(`${url}/auth/health`).catch(() => null);
      if (!res || res.status >= 500) throw new Error('Cannot reach server.');
    } catch (e) {
      setUrlError(friendlyError(e, 'Could not verify server — check URL.'));
    } finally { setUrlTesting(false); }
    await SecureStore.setItemAsync(SERVER_URL_KEY, url);
    setScreen('LOGIN');
  }

  async function handleLogin() {
    if (!email.trim() || !password) {
      Alert.alert('Required', 'Please enter your email and password.');
      return;
    }
    setLoading(true);
    try {
      const baseUrl = await getBaseUrl();
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });
      const data = (await res.json()) as LoginResponse;
      if (!res.ok) throw new Error((data as { message?: string }).message ?? 'Invalid credentials');
      const token = data.accessToken ?? data.access_token ?? '';
      setAuth(data.user, token);
      router.replace('/(tabs)/today');
    } catch (e) {
      Alert.alert('Login Failed', friendlyError(e, 'Invalid email or password.'));
    } finally { setLoading(false); }
  }

  if (screen === 'SERVER_URL') {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
            <View style={s.logoArea}>
              <View style={s.logoCircle}><Ionicons name="server" size={34} color="#FFF" /></View>
              <Text style={s.appName}>KASTRA Agent</Text>
              <Text style={s.tagline}>Server Setup</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>API Server URL</Text>
              <Text style={s.cardSub}>Enter the Kastra API server URL.{'\n'}Cloud users: leave as default.</Text>
              {urlError ? <Text style={s.error}>{urlError}</Text> : null}
              <TextInput
                style={s.input}
                value={urlInput}
                onChangeText={(v) => { setUrlInput(v); setUrlError(''); }}
                placeholder="https://pos-bhe5.onrender.com/api/v1"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholderTextColor={Colors.textSecondary}
                autoFocus
              />
              <Text style={s.hint}>Default (cloud): https://pos-bhe5.onrender.com/api/v1{'\n'}LAN server: http://192.168.x.x:3010/api/v1 (same Wi-Fi)</Text>
              <TouchableOpacity style={[s.btn, urlTesting && { opacity: 0.7 }]} onPress={handleSaveUrl} disabled={urlTesting}>
                {urlTesting
                  ? <ActivityIndicator color="#FFF" />
                  : <><Ionicons name="arrow-forward-circle" size={20} color="#FFF" /><Text style={s.btnText}>Save & Continue</Text></>}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.logoArea}>
            <View style={s.logoCircle}><Ionicons name="briefcase" size={36} color="#FFF" /></View>
            <Text style={s.appName}>KASTRA Agent</Text>
            <Text style={s.tagline}>Field Sales</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Agent Login</Text>
            <Text style={s.cardSub}>Sign in with your sales agent account.</Text>
            <View style={s.fieldGroup}>
              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={s.inputFlex}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="agent@business.co.ke"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={Colors.textSecondary}
                />
              </View>
            </View>
            <View style={s.fieldGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="lock-closed-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={[s.inputFlex, { flex: 1 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry={!showPw}
                  placeholderTextColor={Colors.textSecondary}
                />
                <TouchableOpacity onPress={() => setShowPw((v) => !v)} style={{ padding: 4 }}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <><Ionicons name="log-in-outline" size={20} color="#FFF" /><Text style={s.btnText}>Sign In</Text></>}
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.changeLink} onPress={() => setScreen('SERVER_URL')}>
            <Ionicons name="settings-outline" size={14} color={Colors.textSecondary} />
            <Text style={s.changeLinkText}>Change server URL</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20 },
  logoArea: { alignItems: 'center', gap: 6 },
  logoCircle: {
    width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  appName: { fontSize: 24, fontWeight: '800', color: Colors.text },
  tagline: { fontSize: 13, color: Colors.textSecondary },
  card: {
    width: '100%', backgroundColor: Colors.card, borderRadius: 16, padding: 20, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 6, elevation: 2,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  error: { fontSize: 13, color: Colors.error },
  hint: { fontSize: 12, color: Colors.textSecondary, lineHeight: 18 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.background,
    paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.text,
  },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border,
    borderRadius: 12, backgroundColor: Colors.background, paddingHorizontal: 12,
  },
  inputFlex: { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.text },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  changeLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  changeLinkText: { fontSize: 13, color: Colors.textSecondary },
});
