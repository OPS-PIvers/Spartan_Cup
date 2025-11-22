/**
 * gasService.ts
 * Service module to handle communication with Google Apps Script API
 */
import { GoogleSignin } from '@react-native-google-signin/google-signin';

// Replace this with your deployed Web App URL
// Note: This must be the URL ending in /exec, typically:
// https://script.google.com/macros/s/DEPLOYMENT_ID/exec
const API_URL = 'YOUR_GAS_WEB_APP_URL';

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

    // Construct URL with endpoint and token (and other params for GET)
    const url = new URL(API_URL);
    url.searchParams.append('endpoint', endpoint);
    url.searchParams.append('token', token); // Passing token as param for now

    // Add other params for GET requests
    if (method === 'GET') {
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
      options.body = JSON.stringify(params);
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
