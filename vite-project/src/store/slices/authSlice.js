import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { authApi } from '../../api/authApi';
import { decodeJwt, isTokenExpired } from '../../utils/formatters';
import { clearToken, getToken, rememberCode, saveToken } from '../../utils/authToken';

// The saved login: kept (localStorage) or this session only (sessionStorage).
const storedToken = typeof window !== 'undefined' ? getToken() : null;

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
  // Token is expired: remove it.
  if (typeof window !== 'undefined') clearToken();
}

export const loginUser = createAsyncThunk(
  'auth/loginUser',
  async ({ employeeCode, password, remember = true }, { rejectWithValue }) => {
    try {
      const data = await authApi.login(employeeCode, password, remember);
      saveToken(data.access_token, remember);
      rememberCode(employeeCode, remember);
      return {
        token: data.access_token,
        user: {
          id: data.user_id,
          role: data.role,
          name: data.name,
          title: data.title,
          employee_code: employeeCode,
          must_change_password: Boolean(data.must_change_password),
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
      if (typeof window !== 'undefined') clearToken();
    },
    // A kept session was renewed for another 30 days.
    tokenRenewed(state, action) {
      state.token = action.payload;
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

export const { logout, clearError, setUserData, tokenRenewed } = authSlice.actions;
export default authSlice.reducer;

