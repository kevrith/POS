/**
 * Register a new customer (shop). Captures basic details + optional GPS,
 * which van-sales/distribution businesses use to map and route customers.
 */
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, ScrollView,
  TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import * as Location from 'expo-location';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { agentApi } from '../lib/api';
import { enqueue, uuid } from '../lib/offline';
import { useAuthStore } from '../stores/auth';
import { Colors } from '../constants/theme';

const SHOP_TYPES = ['Kiosk', 'Supermarket', 'Wholesaler', 'Hotel', 'Restaurant', 'Pharmacy', 'Other'];

export default function CustomerRegisterScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const agentId = user?.id ?? '';

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [shopType, setShopType] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);

  async function captureLocation() {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow location access to tag this shop.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      Alert.alert('Could not get location', 'Try again with GPS enabled.');
    } finally {
      setLocating(false);
    }
  }

  const register = useMutation({
    mutationFn: async () => {
      const offlineId = uuid();
      const body = {
        offlineId,
        agentId,
        businessId,
        name: name.trim(),
        phone: phone.trim(),
        kraPin: kraPin.trim() || undefined,
        shopType: shopType || undefined,
        gpsLat: gps?.lat,
        gpsLng: gps?.lng,
        creditLimitCents: creditLimit ? Math.round(parseFloat(creditLimit) * 100) : undefined,
      };
      try {
        return await agentApi.post('/field-sales/customers', body);
      } catch (e) {
        const msg = (e as Error)?.message ?? '';
        if (!msg.includes('Network request failed')) throw e; // server error → surface
        await enqueue({
          offlineId,
          type: 'REGISTER_CUSTOMER',
          path: '/field-sales/customers',
          body,
          label: `New customer · ${name.trim()}`,
        });
        return { queued: true };
      }
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['agent-customers'] });
      void qc.invalidateQueries({ queryKey: ['call-plan'] });
      const queued = (res as { queued?: boolean })?.queued;
      Alert.alert(
        queued ? 'Saved Offline' : 'Customer Registered',
        queued
          ? `${name.trim()} is saved on your phone and will sync when you’re back online.`
          : `${name.trim()} has been added.`,
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    onError: (e) => Alert.alert('Could not register', (e as Error)?.message || 'Please try again.'),
  });

  function submit() {
    if (!name.trim()) { Alert.alert('Required', 'Enter the shop/customer name.'); return; }
    if (!phone.trim()) { Alert.alert('Required', 'Enter a phone number.'); return; }
    register.mutate();
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <TouchableOpacity onPress={() => router.back()}><Ionicons name="arrow-back" size={24} color={Colors.text} /></TouchableOpacity>
        <Text style={st.title}>New Customer</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <Text style={st.label}>Shop / Customer Name *</Text>
          <TextInput style={st.input} value={name} onChangeText={setName} placeholder="e.g. Mama Mboga Stores" placeholderTextColor={Colors.textSecondary} />

          <Text style={st.label}>Phone *</Text>
          <TextInput style={st.input} value={phone} onChangeText={setPhone} placeholder="07XX XXX XXX" keyboardType="phone-pad" placeholderTextColor={Colors.textSecondary} />

          <Text style={st.label}>KRA PIN (optional)</Text>
          <TextInput style={st.input} value={kraPin} onChangeText={setKraPin} placeholder="P0XXXXXXXX" autoCapitalize="characters" placeholderTextColor={Colors.textSecondary} />

          <Text style={st.label}>Shop Type</Text>
          <View style={st.chipRow}>
            {SHOP_TYPES.map((t) => (
              <TouchableOpacity key={t} style={[st.chip, shopType === t && st.chipActive]} onPress={() => setShopType(t === shopType ? '' : t)}>
                <Text style={[st.chipText, shopType === t && { color: '#FFF' }]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={st.label}>Credit Limit (KES, optional)</Text>
          <TextInput style={st.input} value={creditLimit} onChangeText={setCreditLimit} placeholder="0" keyboardType="decimal-pad" placeholderTextColor={Colors.textSecondary} />

          <Text style={st.label}>Location</Text>
          <TouchableOpacity style={[st.gpsBtn, gps && st.gpsBtnDone]} onPress={captureLocation} disabled={locating}>
            {locating
              ? <ActivityIndicator color={Colors.primary} />
              : <>
                  <Ionicons name={gps ? 'checkmark-circle' : 'location'} size={20} color={gps ? Colors.success : Colors.primary} />
                  <Text style={[st.gpsText, gps && { color: Colors.success }]}>
                    {gps ? `Location captured (${gps.lat.toFixed(4)}, ${gps.lng.toFixed(4)})` : 'Capture GPS location'}
                  </Text>
                </>}
          </TouchableOpacity>

          <TouchableOpacity style={[st.submitBtn, register.isPending && { opacity: 0.7 }]} onPress={submit} disabled={register.isPending}>
            {register.isPending ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="person-add" size={20} color="#FFF" /><Text style={st.submitText}>Register Customer</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  title: { fontSize: 18, fontWeight: '800', color: Colors.text },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 16, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.card, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, color: Colors.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.card },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: Colors.border, borderRadius: 12, backgroundColor: Colors.card, paddingVertical: 14 },
  gpsBtnDone: { borderColor: Colors.success, backgroundColor: Colors.success + '11' },
  gpsText: { fontSize: 14, fontWeight: '600', color: Colors.primary },
  submitBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 15, marginTop: 28 },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
