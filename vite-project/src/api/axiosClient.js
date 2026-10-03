import axios from 'axios';

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

// Request interceptor: attach Bearer token stored in localStorage
axiosClient.interceptors.request.use(
  (config) => {
    const token =
      localStorage.getItem('token') || localStorage.getItem('pharma_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor: handle 401 Unauthorized (session expired) and normalize error details
axiosClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Clear token from localStorage
      localStorage.removeItem('token');
      localStorage.removeItem('pharma_token');

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

