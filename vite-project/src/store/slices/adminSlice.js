import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { adminApi } from '../../api/adminApi';

export const fetchAdminDashboard = createAsyncThunk(
  'admin/fetchAdminDashboard',
  async (params, { rejectWithValue }) => {
    try {
      return await adminApi.getDashboard(params);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load dashboard');
    }
  }
);

export const fetchOutstandingAlerts = createAsyncThunk(
  'admin/fetchOutstandingAlerts',
  async (threshold = 50000, { rejectWithValue }) => {
    try {
      return await adminApi.getOutstandingAlerts(threshold);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load alerts');
    }
  }
);

export const fetchMrPerformance = createAsyncThunk(
  'admin/fetchMrPerformance',
  async (params, { rejectWithValue }) => {
    try {
      return await adminApi.getMrPerformance(params);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load performance');
    }
  }
);

export const fetchUsers = createAsyncThunk(
  'admin/fetchUsers',
  async (_, { rejectWithValue }) => {
    try {
      return await adminApi.getUsers();
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load users');
    }
  }
);

export const createNewUser = createAsyncThunk(
  'admin/createNewUser',
  async (userData, { rejectWithValue }) => {
    try {
      return await adminApi.createUser(userData);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to create user');
    }
  }
);

export const updateExistingUser = createAsyncThunk(
  'admin/updateExistingUser',
  async ({ userId, userData }, { rejectWithValue }) => {
    try {
      return await adminApi.updateUser(userId, userData);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to update user');
    }
  }
);

export const deleteExistingUser = createAsyncThunk(
  'admin/deleteExistingUser',
  async (userId, { rejectWithValue }) => {
    try {
      await adminApi.deleteUser(userId);
      return userId;
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to delete user');
    }
  }
);

const adminSlice = createSlice({
  name: 'admin',
  initialState: {
    dashboard: {
      total_sales: 0,
      collected: 0,
      outstanding: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
    },
    alerts: [],
    mrPerformance: [],
    users: [],

    dashFilters: { dateFrom: null, dateTo: null },
    perfFilters: { dateFrom: null, dateTo: null },

    loading: false,
    userActionLoading: false,
    userActionError: null,
    error: null,
  },
  reducers: {
    setDashFilters(state, action) {
      state.dashFilters = { ...state.dashFilters, ...action.payload };
    },
    setPerfFilters(state, action) {
      state.perfFilters = { ...state.perfFilters, ...action.payload };
    },
    clearUserActionError(state) {
      state.userActionError = null;
    },
  },
  extraReducers: (builder) => {
    // Dashboard
    builder
      .addCase(fetchAdminDashboard.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchAdminDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.dashboard = action.payload;
      })
      .addCase(fetchAdminDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Alerts
    builder.addCase(fetchOutstandingAlerts.fulfilled, (state, action) => {
      state.alerts = action.payload;
    });

    // MR Performance
    builder
      .addCase(fetchMrPerformance.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMrPerformance.fulfilled, (state, action) => {
        state.loading = false;
        state.mrPerformance = action.payload;
      })
      .addCase(fetchMrPerformance.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Users
    builder
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.users = action.payload;
      })
      .addCase(createNewUser.pending, (state) => {
        state.userActionLoading = true;
        state.userActionError = null;
      })
      .addCase(createNewUser.fulfilled, (state, action) => {
        state.userActionLoading = false;
        state.users.unshift(action.payload);
      })
      .addCase(createNewUser.rejected, (state, action) => {
        state.userActionLoading = false;
        state.userActionError = action.payload;
      })
      .addCase(updateExistingUser.pending, (state) => {
        state.userActionLoading = true;
        state.userActionError = null;
      })
      .addCase(updateExistingUser.fulfilled, (state, action) => {
        state.userActionLoading = false;
        const updated = action.payload;
        state.users = state.users.map((u) => (u.id === updated.id ? updated : u));
      })
      .addCase(updateExistingUser.rejected, (state, action) => {
        state.userActionLoading = false;
        state.userActionError = action.payload;
      })
      .addCase(deleteExistingUser.fulfilled, (state, action) => {
        state.users = state.users.filter((u) => u.id !== action.payload);
      });
  },
});

export const { setDashFilters, setPerfFilters, clearUserActionError } =
  adminSlice.actions;

export default adminSlice.reducer;

