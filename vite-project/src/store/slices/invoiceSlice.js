import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { invoicesApi } from '../../api/invoicesApi';

export const fetchAdminInvoices = createAsyncThunk(
  'invoices/fetchAdminInvoices',
  async (params, { rejectWithValue }) => {
    try {
      return await invoicesApi.getInvoices(params);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load invoices');
    }
  }
);

export const fetchMyInvoices = createAsyncThunk(
  'invoices/fetchMyInvoices',
  async (params, { rejectWithValue }) => {
    try {
      return await invoicesApi.getMyInvoices(params);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to load invoices');
    }
  }
);

export const extractInvoiceAI = createAsyncThunk(
  'invoices/extractInvoiceAI',
  async (file, { rejectWithValue }) => {
    try {
      return await invoicesApi.extractInvoice(file);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to extract invoice');
    }
  }
);

export const createNewInvoice = createAsyncThunk(
  'invoices/createNewInvoice',
  async ({ data, confirmDuplicate = false }, { rejectWithValue }) => {
    try {
      return await invoicesApi.createInvoice({ ...data, confirm_duplicate: confirmDuplicate });
    } catch (err) {
      return rejectWithValue({
        status: err.response?.status,
        message: err.detail || err.message || 'Failed to save invoice',
      });
    }
  }
);

export const updateExistingInvoice = createAsyncThunk(
  'invoices/updateExistingInvoice',
  async ({ id, data }, { rejectWithValue }) => {
    try {
      return await invoicesApi.updateInvoice(id, data);
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to update invoice');
    }
  }
);

export const deleteExistingInvoice = createAsyncThunk(
  'invoices/deleteExistingInvoice',
  async (id, { rejectWithValue }) => {
    try {
      await invoicesApi.deleteInvoice(id);
      return id;
    } catch (err) {
      return rejectWithValue(err.detail || err.message || 'Failed to delete invoice');
    }
  }
);

const invoiceSlice = createSlice({
  name: 'invoices',
  initialState: {
    allInvoices: [],
    myInvoices: [],
    loading: false,
    error: null,

    // AI Extract state
    extractLoading: false,
    extractError: null,
    extractResult: null,

    // Creation / Edit state
    actionLoading: false,
    actionError: null,
    saveSuccess: false,

    // Filter states
    adminFilters: {
      mrId: '',
      status: '',
      dateFrom: null,
      dateTo: null,
      search: '',
    },
    mrFilters: {
      dateFrom: null,
      dateTo: null,
      search: '',
    },
  },
  reducers: {
    setAdminFilters(state, action) {
      state.adminFilters = { ...state.adminFilters, ...action.payload };
    },
    setMrFilters(state, action) {
      state.mrFilters = { ...state.mrFilters, ...action.payload };
    },
    clearExtractResult(state) {
      state.extractResult = null;
      state.extractError = null;
    },
    resetSaveStatus(state) {
      state.saveSuccess = false;
      state.actionError = null;
    },
  },
  extraReducers: (builder) => {
    // Admin Invoices
    builder
      .addCase(fetchAdminInvoices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAdminInvoices.fulfilled, (state, action) => {
        state.loading = false;
        state.allInvoices = action.payload;
      })
      .addCase(fetchAdminInvoices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // MR Invoices
    builder
      .addCase(fetchMyInvoices.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMyInvoices.fulfilled, (state, action) => {
        state.loading = false;
        state.myInvoices = action.payload;
      })
      .addCase(fetchMyInvoices.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // AI Extract
    builder
      .addCase(extractInvoiceAI.pending, (state) => {
        state.extractLoading = true;
        state.extractError = null;
      })
      .addCase(extractInvoiceAI.fulfilled, (state, action) => {
        state.extractLoading = false;
        state.extractResult = action.payload;
      })
      .addCase(extractInvoiceAI.rejected, (state, action) => {
        state.extractLoading = false;
        state.extractError = action.payload;
      });

    // Create Invoice
    builder
      .addCase(createNewInvoice.pending, (state) => {
        state.actionLoading = true;
        state.actionError = null;
        state.saveSuccess = false;
      })
      .addCase(createNewInvoice.fulfilled, (state, action) => {
        state.actionLoading = false;
        state.saveSuccess = true;
        state.myInvoices.unshift(action.payload);
        state.extractResult = null;
      })
      .addCase(createNewInvoice.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionError = action.payload;
      });

    // Update Invoice
    builder
      .addCase(updateExistingInvoice.pending, (state) => {
        state.actionLoading = true;
        state.actionError = null;
      })
      .addCase(updateExistingInvoice.fulfilled, (state, action) => {
        state.actionLoading = false;
        const updated = action.payload;
        state.myInvoices = state.myInvoices.map((inv) =>
          inv.id === updated.id ? updated : inv
        );
        state.allInvoices = state.allInvoices.map((inv) =>
          inv.id === updated.id ? updated : inv
        );
      })
      .addCase(updateExistingInvoice.rejected, (state, action) => {
        state.actionLoading = false;
        state.actionError = action.payload;
      });

    // Delete Invoice
    builder
      .addCase(deleteExistingInvoice.fulfilled, (state, action) => {
        state.myInvoices = state.myInvoices.filter((inv) => inv.id !== action.payload);
        state.allInvoices = state.allInvoices.filter((inv) => inv.id !== action.payload);
      });
  },
});

export const {
  setAdminFilters,
  setMrFilters,
  clearExtractResult,
  resetSaveStatus,
} = invoiceSlice.actions;

export default invoiceSlice.reducer;

