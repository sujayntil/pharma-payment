import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAppDispatch, useAuth } from '../../hooks/useAppStore';
import { logout } from '../../store/slices/authSlice';
import PwaInstallButton from './PwaInstallButton';

export default function Topbar() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const handleLogout = () => {
    dispatch(logout());
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#d7dcd9] shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#2f6f4e] text-white flex items-center justify-center font-bold text-sm shadow-xs tracking-tight">
              PS
            </div>
            <div className="font-bold text-base sm:text-lg text-[#1c2321] tracking-tight">
              Pharma Sales <span className="hidden sm:inline">&amp; Collection</span>
            </div>
          </div>

          {/* Actions: PWA Install, User Profile & Logout */}
          <div className="flex items-center gap-2 sm:gap-4">
            <PwaInstallButton />

            <div className="flex items-center gap-2 text-xs sm:text-sm text-[#5b6660]">
              <div className="w-7 h-7 rounded-full bg-emerald-100 text-[#2f6f4e] flex items-center justify-center font-semibold text-xs">
                {user?.name ? user.name.charAt(0).toUpperCase() : <User size={14} />}
              </div>
              <span className="font-semibold text-[#1c2321] hidden xs:inline">
                {user?.name || 'User'}
              </span>
              <span className="hidden sm:inline text-gray-300">·</span>
              <span
                className={`hidden sm:inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${
                  role === 'ADMIN'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-emerald-100 text-[#2f6f4e]'
                }`}
              >
                {role === 'ADMIN' ? 'Admin' : 'MR'}
              </span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-medium text-[#1c2321] bg-gray-50 hover:bg-gray-100 border border-[#d7dcd9] rounded-lg transition-colors cursor-pointer"
              title="Log out"
            >
              <LogOut size={14} className="text-[#5b6660]" />
              <span className="hidden xs:inline">Log out</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
