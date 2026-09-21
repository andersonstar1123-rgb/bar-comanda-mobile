import axios from 'axios';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { notifyUnauthorized } from './authEvents';

const API_URL = Constants.expoConfig?.extra?.apiUrl || 'http://192.168.1.100:3001/api';
const API_URL_KEY = 'api_url';

export const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' }
});

export async function initApiUrl() {
  try {
    const stored = await SecureStore.getItemAsync(API_URL_KEY);
    if (stored) {
      api.defaults.baseURL = stored;
    } else {
      await SecureStore.setItemAsync(API_URL_KEY, api.defaults.baseURL || API_URL);
    }
  } catch {
    // ignora falha de storage
  }
}

export const setApiUrl = async (url: string) => {
  api.defaults.baseURL = url.replace(/\/+$/, '');
  try {
    await SecureStore.setItemAsync(API_URL_KEY, api.defaults.baseURL || '');
  } catch {
    // ignora
  }
};

export function resolveAssetUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//i.test(path)) return path;
  const base = api.defaults.baseURL || API_URL;
  const origin = base.replace(/\/api\/?$/, '').replace(/\/+$/, '');
  return `${origin}${path.startsWith('/') ? '' : '/'}${path}`;
}

api.interceptors.request.use(async (config) => {
  const token = await SecureStore.getItemAsync('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await SecureStore.deleteItemAsync('token');
      await SecureStore.deleteItemAsync('user');
      notifyUnauthorized();
    }
    return Promise.reject(error);
  }
);

export default api;