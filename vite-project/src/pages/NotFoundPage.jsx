import { useNavigate } from 'react-router-dom';
import { FileQuestion, ArrowLeft } from 'lucide-react';
import { useAuth } from '../hooks/useAppStore';

export default function NotFoundPage() {
  const navigate = useNavigate();
  const { isAuthenticated, role } = useAuth();

  const handleReturn = () => {
    if (!isAuthenticated) {
      navigate('/login');
    } else if (role === 'ADMIN') {
      navigate('/admin');
    } else {
      navigate('/mr');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[#f4f6f4]">
      <div className="w-full max-w-md bg-white border border-[#d7dcd9] rounded-2xl p-6 sm:p-8 text-center shadow-xs">
        <div className="w-14 h-14 rounded-full bg-gray-100 text-[#5b6660] flex items-center justify-center mx-auto mb-4">
          <FileQuestion size={28} />
        </div>
        <h1 className="text-xl sm:text-2xl font-bold text-[#1c2321]">
          Page Not Found
        </h1>
        <p className="mt-2 text-xs sm:text-sm text-[#5b6660]">
          The page you requested does not exist or has been moved.
        </p>
        <button
          type="button"
          onClick={handleReturn}
          className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-sm font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
        >
          <ArrowLeft size={16} /> Go Home
        </button>
      </div>
    </div>
  );
}

