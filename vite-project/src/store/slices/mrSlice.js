import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { mrApi } from '../../api/mrApi';
import { paymentsApi } from '../../api/paymentsApi';

export const fetchMrDashboard = createAsyncThunk(
  'mr/fetchMrDashboard',
  async (_, { rejectWithValue }) => {
    try {
      return await mrApi.getDashboard();
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load MR dashboard');
    }
  }
);

export const fetchMrOutstanding = createAsyncThunk(
  'mr/fetchMrOutstanding',
  async (_, { rejectWithValue }) => {
    try {
      return await mrApi.getOutstanding();
    } catch (err) {
      return rejectWithValue(
        err.detail || err.message || 'Failed to load outstanding collections'
      );
    }
  }
);

export const recordPayment = createAsyncThunk(
  'mr/recordPayment',
  async (payload, { rejectWithValue, dispatch }) => {
    try {
      const result = await paymentsApi.createPayment(payload);
      // Re-fetch outstanding list
      dispatch(fetchMrOutstanding());
      return result;
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to record payment');
    }
  }
);

const mrSlice = createSlice({
  name: 'mr',
  initialState: {
    dashboard: {
      name: '',
      total_invoices: 0,
      paid: 0,
      partial: 0,
      unpaid: 0,
      recent: [],
    },
    outstanding: [],
    totalOutstanding: 0,
    loading: false,
    paymentLoading: false,
    paymentSuccess: false,
    paymentError: null,
    error: null,
    searchQuery: '',
  },
  reducers: {
    setSearchQuery(state, action) {
      state.searchQuery = action.payload;
    },
    resetPaymentStatus(state) {
      state.paymentSuccess = false;
      state.paymentError = null;
    },
  },
  extraReducers: (builder) => {
    // Dashboard
    builder
      .addCase(fetchMrDashboard.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMrDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.dashboard = action.payload;
      })
      .addCase(fetchMrDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Outstanding
    builder
      .addCase(fetchMrOutstanding.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchMrOutstanding.fulfilled, (state, action) => {
        state.loading = false;
        state.outstanding = action.payload.items || [];
        state.totalOutstanding = action.payload.total_outstanding || 0;
      })
      .addCase(fetchMrOutstanding.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // Payment
    builder
      .addCase(recordPayment.pending, (state) => {
        state.paymentLoading = true;
        state.paymentError = null;
        state.paymentSuccess = false;
      })
      .addCase(recordPayment.fulfilled, (state) => {
        state.paymentLoading = false;
        state.paymentSuccess = true;
      })
      .addCase(recordPayment.rejected, (state, action) => {
        state.paymentLoading = false;
        state.paymentError = action.payload;
      });
  },
});

export const { setSearchQuery, resetPaymentStatus } = mrSlice.actions;
export default mrSlice.reducer;

