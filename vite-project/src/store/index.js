import { configureStore } from '@reduxjs/toolkit';
import authReducer, { logout, setUserData } from './slices/authSlice';
import invoiceReducer from './slices/invoiceSlice';
import customerReducer from './slices/customerSlice';
import adminReducer from './slices/adminSlice';
import mrReducer from './slices/mrSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    invoices: invoiceReducer,
    customers: customerReducer,
    admin: adminReducer,
    mr: mrReducer,
  },
});

// Automatically trigger logout in Redux if axios intercepts a 401
if (typeof window !== 'undefined') {
  window.addEventListener('auth:unauthorized', () => {
    store.dispatch(logout());
  });
  // The server says a new password must be set first: show that screen.
  window.addEventListener('auth:password-change', () => {
    store.dispatch(setUserData({ must_change_password: true }));
  });
}

export default store;

