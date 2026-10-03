import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAppStore';

import LoginPage from './pages/LoginPage';
import UnauthorizedPage from './pages/UnauthorizedPage';
import NotFoundPage from './pages/NotFoundPage';
import AdminLayout from './pages/admin/AdminLayout';
import MrLayout from './pages/mr/MrLayout';

import ProtectedRoute from './components/auth/ProtectedRoute';
import RoleRoute from './components/auth/RoleRoute';

// Root redirect handler based on current auth and role
function RootRedirect() {
  const { isAuthenticated, role } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (role === 'ADMIN') {
    return <Navigate to="/admin" replace />;
  }

  if (role === 'MR') {
    return <Navigate to="/mr" replace />;
  }

  return <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/unauthorized" element={<UnauthorizedPage />} />

      {/* Admin routes with authentication and ADMIN role requirement */}
      <Route
        path="/admin/*"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['ADMIN']}>
              <AdminLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* MR routes with authentication and MR role requirement */}
      <Route
        path="/mr/*"
        element={
          <ProtectedRoute>
            <RoleRoute allowedRoles={['MR']}>
              <MrLayout />
            </RoleRoute>
          </ProtectedRoute>
        }
      />

      {/* Root redirect */}
      <Route path="/" element={<RootRedirect />} />

      {/* 404 Fallback */}
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

