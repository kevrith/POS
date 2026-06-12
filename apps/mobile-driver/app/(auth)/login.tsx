/**
 * Driver app login — supports email/password with configurable server URL.
 * On first launch shows a server URL setup step.
 */

import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, ActivityIndicator, Alert, KeyboardAvoidingView,
  Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import { driverApi, SERVER_URL_KEY, DEFAULT_BASE_URL, getBaseUrl } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors } from '../../constants/theme';

interface LoginResponse {
  accessToken?: string;
  access_token?: string;
  user: { id: string; name: string; email: string; role: string; businessId: string; storeId?: string; };
}

type Screen = 'SERVER_URL' | 'LOGIN';

export default function LoginScreen() {
  const router  = useRouter();
  const setAuth = useAuthStore(s => s.setAuth);

  const [screen,       setScreen]       = useState<Screen>('SERVER_URL');
  const [urlInput,     setUrlInput]     = useState(DEFAULT_BASE_URL);
  const [urlTesting,   setUrlTesting]   = useState(false);
  const [urlError,     setUrlError]     = useState('');

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPw,       setShowPw]       = useState(false);
  const [loading,      setLoading]      = useState(false);

  useEffect(() => {
    void SecureStore.getItemAsync(SERVER_URL_KEY).then(stored => {
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
    } catch (e: any) {
      setUrlError(e.message ?? 'Could not verify server — check URL.');
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
      const data = await res.json() as LoginResponse;
      if (!res.ok) throw new Error((data as any).message ?? 'Invalid credentials');
      const token = data.accessToken ?? data.access_token ?? '';
      await SecureStore.setItemAsync('driver_token', token);
      setAuth(data.user, token);
      router.replace('/(tabs)/deliveries');
    } catch (e: any) {
      const msg = (e?.message ?? '').includes('Network request failed')
        ? 'Could not reach the server. Make sure your phone is on the same Wi-Fi network as the server, and that the URL uses your computer’s LAN IP (e.g. http://192.168.1.50:3010/api/v1).'
        : (e.message ?? 'Invalid email or password.');
      Alert.alert('Login Failed', msg);
    } finally { setLoading(false); }
  }

  if (screen === 'SERVER_URL') {
    return (
      <SafeAreaView style={s.safe}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
            <View style={s.logoArea}>
              <View style={s.logoCircle}><Ionicons name="server" size={36} color="#FFF" /></View>
              <Text style={s.appName}>Kastra Driver</Text>
              <Text style={s.appTagline}>Server Setup</Text>
            </View>
            <View style={s.card}>
              <Text style={s.cardTitle}>API Server URL</Text>
              <Text style={s.cardSub}>Enter the Kastra API server URL.{'\n'}Cloud users: leave as default.</Text>
              {urlError ? <Text style={s.errorText}>{urlError}</Text> : null}
              <TextInput
                style={s.input}
                value={urlInput}
                onChangeText={v => { setUrlInput(v); setUrlError(''); }}
                placeholder="https://pos-bhe5.onrender.com/api/v1"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                placeholderTextColor={Colors.textSecondary}
                autoFocus
              />
              <Text style={s.hintText}>Default (cloud): https://pos-bhe5.onrender.com/api/v1{'\n'}LAN server: http://192.168.x.x:3010/api/v1 (same Wi-Fi)</Text>
              <TouchableOpacity style={[s.btn, urlTesting && { opacity: 0.7 }]} onPress={handleSaveUrl} disabled={urlTesting}>
                {urlTesting
                  ? <ActivityIndicator color="#FFF" />
                  : <><Ionicons name="arrow-forward-circle" size={20} color="#FFF" /><Text style={s.btnText}>Save & Continue</Text></>
                }
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={s.container} keyboardShouldPersistTaps="handled">
          <View style={s.logoArea}>
            <View style={s.logoCircle}><Ionicons name="bicycle" size={40} color="#FFF" /></View>
            <Text style={s.appName}>Kastra Driver</Text>
            <Text style={s.appTagline}>Delivery Management</Text>
          </View>
          <View style={s.card}>
            <Text style={s.cardTitle}>Driver Login</Text>
            <Text style={s.cardSub}>Sign in with your driver account credentials</Text>
            <View style={s.fieldGroup}>
              <Text style={s.label}>Email Address</Text>
              <View style={s.inputWrapper}>
                <Ionicons name="mail-outline" size={18} color={Colors.textSecondary} style={{ marginRight: 8 }} />
                <TextInput
                  style={s.inputFlex}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="driver@company.com"
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
                <TouchableOpacity onPress={() => setShowPw(v => !v)} style={{ padding: 4 }}>
                  <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={Colors.textSecondary} />
                </TouchableOpacity>
              </View>
            </View>
            <TouchableOpacity style={[s.btn, loading && { opacity: 0.7 }]} onPress={handleLogin} disabled={loading}>
              {loading
                ? <ActivityIndicator color="#FFF" />
                : <><Ionicons name="log-in-outline" size={20} color="#FFF" /><Text style={s.btnText}>Sign In</Text></>
              }
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.changeServerLink} onPress={() => setScreen('SERVER_URL')}>
            <Ionicons name="settings-outline" size={14} color={Colors.textSecondary} />
            <Text style={s.changeServerText}>Change server URL</Text>
          </TouchableOpacity>
          <Text style={s.footer}>Contact your manager if you need access</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center', gap: 20 },
  logoArea: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 80, height: 80, borderRadius: 40, backgroundColor: Colors.primary,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: Colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  appName: { fontSize: 26, fontWeight: '800', color: Colors.text },
  appTagline: { fontSize: 14, color: Colors.textSecondary },
  card: {
    backgroundColor: Colors.card, borderRadius: 20, padding: 24, gap: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 3,
  },
  cardTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  cardSub: { fontSize: 13, color: Colors.textSecondary },
  errorText: { fontSize: 13, color: Colors.error },
  hintText: { fontSize: 12, color: Colors.textSecondary },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background, paddingHorizontal: 14,
    paddingVertical: 13, fontSize: 15, color: Colors.text,
  },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },
  inputWrapper: {
    flexDirection: 'row', alignItems: 'center', borderWidth: 1,
    borderColor: Colors.border, borderRadius: 12,
    backgroundColor: Colors.background, paddingHorizontal: 12,
  },
  inputFlex: { flex: 1, paddingVertical: 13, fontSize: 15, color: Colors.text },
  btn: {
    backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 4,
  },
  btnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
  changeServerLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  changeServerText: { fontSize: 13, color: Colors.textSecondary },
  footer: { textAlign: 'center', fontSize: 13, color: Colors.textSecondary },
});
