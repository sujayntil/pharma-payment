import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { customersApi } from '../../api/customersApi';

export const fetchCustomers = createAsyncThunk(
  'customers/fetchCustomers',
  async (_, { rejectWithValue }) => {
    try {
      return await customersApi.getCustomers();
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load customers');
    }
  }
);

export const fetchCustomerLedger = createAsyncThunk(
  'customers/fetchCustomerLedger',
  async (customerId, { rejectWithValue }) => {
    try {
      return await customersApi.getCustomerLedger(customerId);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load customer ledger');
    }
  }
);

const customerSlice = createSlice({
  name: 'customers',
  initialState: {
    customers: [],
    selectedLedger: null,
    loading: false,
    ledgerLoading: false,
    error: null,
    searchQuery: '',
    ledgerSearchQuery: '',
  },
  reducers: {
    setSearchQuery(state, action) {
      state.searchQuery = action.payload;
    },
    setLedgerSearchQuery(state, action) {
      state.ledgerSearchQuery = action.payload;
    },
    clearSelectedLedger(state) {
      state.selectedLedger = null;
      state.ledgerSearchQuery = '';
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false;
        state.customers = action.payload;
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      })
      .addCase(fetchCustomerLedger.pending, (state) => {
        state.ledgerLoading = true;
        state.error = null;
      })
      .addCase(fetchCustomerLedger.fulfilled, (state, action) => {
        state.ledgerLoading = false;
        state.selectedLedger = action.payload;
      })
      .addCase(fetchCustomerLedger.rejected, (state, action) => {
        state.ledgerLoading = false;
        state.error = action.payload;
      });
  },
});

export const { setSearchQuery, setLedgerSearchQuery, clearSelectedLedger } =
  customerSlice.actions;

export default customerSlice.reducer;

