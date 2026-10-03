import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, User, AlertCircle, ArrowRight, Loader2 } from 'lucide-react';
import { useAppDispatch, useAuth } from '../hooks/useAppStore';
import { loginUser, clearError } from '../store/slices/authSlice';

export default function LoginPage() {
  const [employeeCode, setEmployeeCode] = useState('');
  const [password, setPassword] = useState('');
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated, role, loading, error } = useAuth();

  // If already logged in, redirect immediately to role home
  useEffect(() => {
    if (isAuthenticated && role) {
      const destination =
        location.state?.from?.pathname ||
        (role === 'ADMIN' ? '/admin' : '/mr');
      navigate(destination, { replace: true });
    }
  }, [isAuthenticated, role, navigate, location]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employeeCode.trim() || !password) return;

    dispatch(clearError());
    const resultAction = await dispatch(
      loginUser({ employeeCode: employeeCode.trim(), password })
    );

    if (loginUser.fulfilled.match(resultAction)) {
      const userRole = resultAction.payload.user.role;
      navigate(userRole === 'ADMIN' ? '/admin' : '/mr', { replace: true });
    }
  };

  const handleDemoFill = (code, pass) => {
    setEmployeeCode(code);
    setPassword(pass);
    dispatch(clearError());
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6f4]">
      <div className="w-full max-w-md bg-white border border-[#d7dcd9] rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Brand Icon and Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-12 h-12 rounded-xl bg-[#2f6f4e] text-white flex items-center justify-center font-bold text-lg mb-3 shadow-xs">
            PS
          </div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321] tracking-tight">
            Pharma Sales &amp; Collection
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-[#5b6660]">
            Sign in with your employee code to continue.
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-5 p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs sm:text-sm flex items-start gap-2 animate-in fade-in duration-200">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="employeeCode"
              className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1"
            >
              Employee code
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <User size={16} />
              </span>
              <input
                id="employeeCode"
                type="text"
                value={employeeCode}
                onChange={(e) => setEmployeeCode(e.target.value)}
                placeholder="e.g. MR001 or ADMIN01"
                required
                autoComplete="username"
                className="w-full pl-9 pr-3 py-2.5 bg-white text-[#1c2321] text-sm border border-[#d7dcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:border-transparent transition-all"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1"
            >
              Password
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                <Lock size={16} />
              </span>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="w-full pl-9 pr-3 py-2.5 bg-white text-[#1c2321] text-sm border border-[#d7dcd9] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#2f6f4e] focus:border-transparent transition-all"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 px-4 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white font-semibold text-sm rounded-lg shadow-xs transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Signing in…</span>
              </>
            ) : (
              <>
                <span>Sign in</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

        {/* Demo Credentials Helper */}
        <div className="mt-6 pt-5 border-t border-[#d7dcd9]">
          <div className="text-xs text-[#5b6660] font-medium mb-2.5 text-center">
            Demo credentials for quick sign-in:
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => handleDemoFill('ADMIN01', 'admin123')}
              className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-[#d7dcd9] rounded-md text-[11px] font-mono text-[#1c2321] transition-colors cursor-pointer text-center"
            >
              <div className="font-semibold">ADMIN01</div>
              <div className="text-[10px] text-gray-500">Admin</div>
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('MR001', 'mr123')}
              className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-[#d7dcd9] rounded-md text-[11px] font-mono text-[#1c2321] transition-colors cursor-pointer text-center"
            >
              <div className="font-semibold">MR001</div>
              <div className="text-[10px] text-gray-500">Rahul (MR)</div>
            </button>
            <button
              type="button"
              onClick={() => handleDemoFill('MR002', 'mr123')}
              className="px-2 py-1.5 bg-gray-50 hover:bg-gray-100 border border-[#d7dcd9] rounded-md text-[11px] font-mono text-[#1c2321] transition-colors cursor-pointer text-center"
            >
              <div className="font-semibold">MR002</div>
              <div className="text-[10px] text-gray-500">Neha (MR)</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

