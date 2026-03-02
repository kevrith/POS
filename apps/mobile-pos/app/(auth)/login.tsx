import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { mobileApi } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Colors } from '../../constants/theme';

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'DEL'];
const BUSINESS_ID = 'biz-001';

interface LoginResponse {
  access_token: string;
  user: {
    id: string;
    name: string;
    email: string | null;
    role: string;
    businessId: string;
    storeId?: string;
  };
}

export default function PINLoginScreen() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);

  function handleDigit(digit: string) {
    if (digit === 'DEL') {
      setPin((p) => p.slice(0, -1));
      return;
    }
    if (!digit) return;
    if (pin.length >= 6) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length >= 4) {
      submitPin(newPin);
    }
  }

  async function submitPin(pinValue: string) {
    setLoading(true);
    try {
      const result = await mobileApi.post<LoginResponse>('/auth/login/pin', {
        pin: pinValue,
        businessId: BUSINESS_ID,
      });
      setAuth(result.user, result.access_token);
      router.replace('/(tabs)/pos');
    } catch (err: any) {
      Alert.alert('Invalid PIN', err.message ?? 'Incorrect PIN. Please try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.logoArea}>
          <View style={styles.logoCircle}>
            <Ionicons name="bag" size={36} color="#FFFFFF" />
          </View>
          <Text style={styles.appName}>Kastra POS</Text>
          <Text style={styles.appSub}>Enter your PIN to continue</Text>
        </View>

        {/* PIN dots */}
        <View style={styles.dotsRow}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i < pin.length && styles.dotFilled,
                i === pin.length && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {loading && (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.loadingText}>Verifying...</Text>
          </View>
        )}

        {/* PIN Pad */}
        <View style={styles.padGrid}>
          {DIGITS.map((digit, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.padKey,
                !digit && { opacity: 0 },
                digit === 'DEL' && styles.padKeyDel,
              ]}
              onPress={() => handleDigit(digit)}
              disabled={!digit || loading}
              activeOpacity={0.7}
            >
              {digit === 'DEL' ? (
                <Ionicons name="backspace-outline" size={24} color={Colors.error} />
              ) : (
                <Text style={styles.padKeyText}>{digit}</Text>
              )}
            </TouchableOpacity>
          ))}
        </View>

        {/* Email Login Link */}
        <TouchableOpacity
          style={styles.emailLink}
          onPress={() => router.push('/(auth)/email-login')}
        >
          <Ionicons name="mail-outline" size={16} color={Colors.primary} />
          <Text style={styles.emailLinkText}>Sign in with Email instead</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 28,
  },
  logoArea: { alignItems: 'center', gap: 8 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  appName: { fontSize: 26, fontWeight: '800', color: Colors.text },
  appSub: { fontSize: 14, color: Colors.textSecondary },
  dotsRow: { flexDirection: 'row', gap: 14 },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: 'transparent',
  },
  dotFilled: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dotActive: {
    borderColor: Colors.primary,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: -12,
  },
  loadingText: { fontSize: 13, color: Colors.textSecondary },
  padGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 264,
    gap: 12,
    justifyContent: 'center',
  },
  padKey: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: Colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  padKeyDel: { backgroundColor: Colors.error + '15' },
  padKeyText: { fontSize: 24, fontWeight: '600', color: Colors.text },
  emailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  emailLinkText: { fontSize: 14, color: Colors.primary, fontWeight: '500' },
});
