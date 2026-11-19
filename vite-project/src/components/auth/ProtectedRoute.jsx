import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAppStore';
import ChangePasswordScreen from './ChangePasswordScreen';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  // Signed in with an easy-to-guess password: a new one first (the server
  // refuses everything else until then too).
  if (user?.must_change_password) return <ChangePasswordScreen />;

  return children;
}
