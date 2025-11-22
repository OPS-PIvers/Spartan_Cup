/**
 * gasService.ts
 * Service module to handle communication with Google Apps Script API
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Config } from '../config';

const API_URL = Config.GAS_WEB_APP_URL;

// Warn if API_URL is not set or is still the placeholder
if (!API_URL || API_URL === 'YOUR_GAS_WEB_APP_URL') {
  console.warn(
    '[GasService] GAS Web App URL is not configured. Please replace YOUR_GAS_WEB_APP_URL with your actual deployment URL in src/config.ts.'
  );
}

interface ApiResponse<T> {
  status: 'success' | 'error';
  data: T;
  message?: string;
}

export const GasService = {
  /**
   * Helper to get the current ID token
   */
  async getIdToken(): Promise<string> {
    try {
      const tokens = await GoogleSignin.getTokens();
      return tokens.idToken;
    } catch (error) {
      // If no tokens, try to retrieve silently or re-signin
      // For now, assuming user is signed in
      const userInfo = await GoogleSignin.signInSilently();
      return userInfo.idToken || '';
    }
  },

  /**
   * Generic fetch wrapper
   */
  async request<T>(endpoint: string, params: Record<string, any> = {}, method: 'GET' | 'POST' = 'GET'): Promise<T> {
    const token = await this.getIdToken();
    if (!token) {
      throw new Error('User not authenticated');
    }

    // Construct URL with endpoint
    const url = new URL(API_URL);
    url.searchParams.append('endpoint', endpoint);

    // Add other params for GET requests
    if (method === 'GET') {
      url.searchParams.append('token', token); // For GET, token must be in query param
      Object.keys(params).forEach(key => {
        url.searchParams.append(key, String(params[key]));
      });
    }

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (method === 'POST') {
      // For POST, send token in body along with other params
      options.body = JSON.stringify({
        token,
        ...params
      });
    }

    try {
      const response = await fetch(url.toString(), options);
      const json: ApiResponse<T> = await response.json();

      if (json.status === 'error') {
        throw new Error(json.message || 'API Error');
      }

      return json.data;
    } catch (error) {
      console.error(`API Request failed for ${endpoint}:`, error);
      throw error;
    }
  },

  /**
   * API Methods
   */
  async getProfile() {
    return this.request('profile');
  },

  async getEvents(location?: { lat: number; lon: number }) {
    const params = location ? { lat: location.lat, lon: location.lon } : {};
    return this.request('events', params);
  },

  async checkIn(eventCode: string, location: { lat: number; lon: number }) {
    return this.request('checkin', {
      eventCode,
      lat: location.lat,
      lon: location.lon
    });
  }
};
