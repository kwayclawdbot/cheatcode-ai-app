import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { env } from './env';

/**
 * Session storage: expo-secure-store on native, localStorage on web.
 * SecureStore caps a value at ~2KB and a Supabase session is bigger, so the
 * native adapter chunks; AsyncStorage holds the chunk count.
 */
const CHUNK = 1800;

const secureAdapter = {
  async getItem(key: string) {
    const countRaw = await AsyncStorage.getItem(`${key}.n`);
    if (!countRaw) return SecureStore.getItemAsync(key).catch(() => null);
    const n = parseInt(countRaw, 10);
    const parts: string[] = [];
    for (let i = 0; i < n; i++) {
      const p = await SecureStore.getItemAsync(`${key}.${i}`).catch(() => null);
      if (p == null) return null;
      parts.push(p);
    }
    return parts.join('');
  },
  async setItem(key: string, value: string) {
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) {
      await SecureStore.setItemAsync(`${key}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK));
    }
    await AsyncStorage.setItem(`${key}.n`, String(n));
  },
  async removeItem(key: string) {
    const countRaw = await AsyncStorage.getItem(`${key}.n`);
    const n = countRaw ? parseInt(countRaw, 10) : 0;
    for (let i = 0; i < n; i++) await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
    await AsyncStorage.removeItem(`${key}.n`);
    await SecureStore.deleteItemAsync(key).catch(() => {});
  },
};

/** Static web export prerenders in Node — there is no window there. */
const memory = new Map<string, string>();
const webAdapter = {
  getItem: async (k: string) => (typeof window === 'undefined' ? memory.get(k) ?? null : window.localStorage.getItem(k)),
  setItem: async (k: string, v: string) => {
    if (typeof window === 'undefined') memory.set(k, v);
    else window.localStorage.setItem(k, v);
  },
  removeItem: async (k: string) => {
    if (typeof window === 'undefined') memory.delete(k);
    else window.localStorage.removeItem(k);
  },
};

export const supabase: SupabaseClient | null = env.hasSupabase
  ? createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? webAdapter : secureAdapter,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
        flowType: 'pkce',
      },
    })
  : null;

/** Auth errors, in plain English (UX spec: never show a raw provider string). */
export function plainAuthError(message?: string | null): string {
  const m = (message ?? '').toLowerCase();
  if (!m) return 'Something went wrong. Please try again.';
  if (m.includes('invalid login')) return "That email and password don't match. Check them and try again.";
  if (m.includes('email not confirmed')) return 'Confirm your email first — check your inbox for the link we sent.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'You already have an account with that email. Sign in instead.';
  if (m.includes('password') && m.includes('6')) return 'Use at least 6 characters for your password.';
  if (m.includes('weak password')) return 'That password is too easy to guess. Try a longer one.';
  if (m.includes('rate') || m.includes('too many')) return 'Too many tries. Wait a minute and try again.';
  if (m.includes('valid email') || m.includes('invalid email')) return "That doesn't look like an email address.";
  if (m.includes('network') || m.includes('fetch')) return "We couldn't reach the server. Check your connection.";
  return 'Something went wrong. Please try again.';
}
