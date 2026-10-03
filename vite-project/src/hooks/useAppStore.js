import { useDispatch, useSelector } from 'react-redux';

export const useAppDispatch = () => useDispatch();
export const useAppSelector = useSelector;

export const useAuth = () => {
  const auth = useSelector((state) => state.auth);
  return {
    user: auth.user,
    role: auth.user?.role,
    name: auth.user?.name,
    userId: auth.user?.id,
    token: auth.token,
    isAuthenticated: auth.isAuthenticated,
    loading: auth.loading,
    error: auth.error,
  };
};

