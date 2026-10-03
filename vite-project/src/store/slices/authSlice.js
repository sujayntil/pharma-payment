import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../../api/authApi';
import { decodeJwt, isTokenExpired } from '../../utils/formatters';

// Read initial token exclusively from localStorage
const storedToken =
  typeof window !== 'undefined'
    ? localStorage.getItem('token') || localStorage.getItem('pharma_token')
    : null;

let initialUser = null;
let initialIsAuthenticated = false;
let initialToken = null;

if (storedToken && !isTokenExpired(storedToken)) {
  const decoded = decodeJwt(storedToken);
  initialToken = storedToken;
  initialIsAuthenticated = true;
  initialUser = {
    id: decoded?.sub ? Number(decoded.sub) : null,
    role: decoded?.role || null,
    name: decoded?.name || '',
    employee_code: decoded?.employee_code || '',
  };
} else if (storedToken) {
  // Token is expired, purge from localStorage
  if (typeof window !== 'undefined') {
    localStorage.removeItem('token');
    localStorage.removeItem('pharma_token');
  }
}

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ employeeCode, password }, { rejectWithValue }) => {
    try {
      const data = await authApi.login(employeeCode, password);
      // STRICT REQUIREMENT: Only store token in localStorage
      localStorage.setItem('token', data.access_token);
      localStorage.removeItem('pharma_token'); // clean legacy key if any
      return {
        token: data.access_token,
        user: {
          id: data.user_id,
          role: data.role,
          name: data.name,
          employee_code: employeeCode,
        },
      };
    } catch (err) {
      return rejectWithValue(
        err.detail || err.message || 'Login failed. Please check your credentials.'
      );
    }
  }
);

const authSlice = createSlice({
  name: 'auth',
  initialState: {
    token: initialToken,
    user: initialUser,
    isAuthenticated: initialIsAuthenticated,
    loading: false,
    error: null,
  },
  reducers: {
    logout(state) {
      state.token = null;
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
      // Only remove token from localStorage
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('pharma_token');
      }
    },
    clearError(state) {
      state.error = null;
    },
    setUserData(state, action) {
      state.user = { ...state.user, ...action.payload };
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.token = action.payload.token;
        state.user = action.payload.user;
        state.isAuthenticated = true;
        state.error = null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
        state.isAuthenticated = false;
      });
  },
});

export const { logout, clearError, setUserData } = authSlice.actions;
export default authSlice.reducer;

