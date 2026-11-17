import axios from 'axios';
import { clearToken, getToken } from '../utils/authToken';

// Backend base URL from Vite environment variable or fallback to production URL
export const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== 'undefined' && window.API_BASE) ||
  'https://pharma-payment.onrender.com';

const axiosClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Requests still loading, and how many have failed so far. The refresh
// button / pull-to-refresh use these to spin until the new data is in and to
// say so when it could not be loaded.
const activity = { pending: 0, failures: 0 };
const settle = () => { activity.pending = Math.max(0, activity.pending - 1); };

/** Resolves once no request is loading (checked every 80 ms, at most ~20 s). */
export function whenIdle() {
  return new Promise((resolve) => {
    const started = Date.now();
    const check = () => (activity.pending === 0 || Date.now() - started > 20000 ? resolve() : setTimeout(check, 80));
    setTimeout(check, 120);
  });
}

/** Number of failed requests so far (compare before / after a refresh). */
export const failureCount = () => activity.failures;

// Request interceptor: attach Bearer token stored in localStorage
axiosClient.interceptors.request.use(
  (config) => {
    activity.pending += 1;
    const token = getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 Unauthorized (session expired) and normalize error details
axiosClient.interceptors.response.use(
  (response) => { settle(); return response; },
  (error) => {
    settle();
    if (!axios.isCancel(error)) activity.failures += 1;
    if (error.response?.status === 401) {
      // Session ended (expired, logged out elsewhere, password reset).
      clearToken();

      // Dispatch a custom event so Redux store and app can react immediately
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('auth:unauthorized'));
      }
    }

    // Extract detail message from FastAPI backend if present
    const detail =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      'An unexpected error occurred';

    error.detail = detail;
    return Promise.reject(error);
  }
);

export default axiosClient;

