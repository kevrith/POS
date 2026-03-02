import AsyncStorage from '@react-native-async-storage/async-storage';

export const STORAGE_KEYS = {
  BUSINESS_ID: 'businessId',
  PHONE: 'customerPhone',
};

export async function getBusinessId(): Promise<string> {
  return (await AsyncStorage.getItem(STORAGE_KEYS.BUSINESS_ID)) ?? 'biz-001';
}

export async function setBusinessId(id: string) {
  await AsyncStorage.setItem(STORAGE_KEYS.BUSINESS_ID, id);
}

export async function getPhone(): Promise<string | null> {
  return AsyncStorage.getItem(STORAGE_KEYS.PHONE);
}

export async function setPhone(phone: string) {
  await AsyncStorage.setItem(STORAGE_KEYS.PHONE, phone);
}
