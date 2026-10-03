import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAppStore';

export default function RoleRoute({ allowedRoles, children }) {
  const { isAuthenticated, role } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!allowedRoles.includes(role)) {
    // If Admin attempts to access MR route, route to /admin
    if (role === 'ADMIN') {
      return <Navigate to="/admin" replace />;
    }
    // If MR attempts to access Admin route, route to /mr
    if (role === 'MR') {
      return <Navigate to="/mr" replace />;
    }
    // Otherwise show unauthorized page
    return <Navigate to="/unauthorized" replace />;
  }

  return children;
}

