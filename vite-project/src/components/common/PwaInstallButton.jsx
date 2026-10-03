import { useState } from 'react';
import { Download, Share, PlusSquare, Smartphone, CheckCircle } from 'lucide-react';
import { usePwaInstall } from '../../hooks/usePwaInstall';
import Modal from './Modal';

export default function PwaInstallButton({ className = '', variant = 'button' }) {
  const { isInstallable, isInstalled, isIos, promptInstall } = usePwaInstall();
  const [showIosModal, setShowIosModal] = useState(false);
  const [justInstalled, setJustInstalled] = useState(false);

  // If already installed in standalone mode, show a small subtle installed checkmark or nothing
  if (isInstalled && !justInstalled) {
    return null;
  }

  // If not installable and not iOS, don't show
  if (!isInstallable && !isIos) {
    return null;
  }

  const handleClick = async () => {
    const res = await promptInstall();
    if (res === 'show-ios-instructions') {
      setShowIosModal(true);
    } else if (res === 'prompted') {
      setJustInstalled(true);
      setTimeout(() => setJustInstalled(false), 4000);
    }
  };

  return (
    <>
      {variant === 'banner' ? (
        <div
          className={`flex items-center justify-between p-3 bg-[#e3efe8] border border-[#2f6f4e]/30 rounded-xl text-xs sm:text-sm text-[#1f4d36] shadow-xs ${className}`}
        >
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-[#2f6f4e] text-white shrink-0">
              <Smartphone size={16} />
            </div>
            <div>
              <span className="font-bold">Install Pharma Sales App</span>
              <p className="text-[11px] text-[#2f6f4e] mt-0.5">
                Install on your phone or desktop for quick offline access and fullscreen experience.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClick}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white font-semibold text-xs rounded-lg shadow-xs transition-colors shrink-0 ml-3 cursor-pointer"
          >
            <Download size={13} />
            <span>Install</span>
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#2f6f4e] bg-emerald-50 hover:bg-emerald-100 border border-[#2f6f4e]/30 rounded-lg shadow-2xs transition-colors cursor-pointer ${className}`}
          title="Install App on Phone or PC"
        >
          {justInstalled ? (
            <>
              <CheckCircle size={14} className="text-[#2f6f4e]" />
              <span>Installed!</span>
            </>
          ) : (
            <>
              <Download size={14} />
              <span>Install App</span>
            </>
          )}
        </button>
      )}

      {/* iOS Add to Home Screen Instructions Modal */}
      <Modal
        isOpen={showIosModal}
        onClose={() => setShowIosModal(false)}
        title="Install on iPhone / iPad"
        maxWidth="max-w-sm"
      >
        <div className="space-y-4 text-xs sm:text-sm text-[#1c2321]">
          <p className="text-[#5b6660]">
            Install this app on your iOS home screen for instant full-screen access:
          </p>

          <ol className="space-y-3 pl-1">
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#2f6f4e] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                1
              </span>
              <div>
                Tap the <span className="font-semibold inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs"><Share size={12} /> Share</span> button at the bottom of Safari.
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#2f6f4e] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                2
              </span>
              <div>
                Scroll down and tap <span className="font-semibold inline-flex items-center gap-1 mx-1 px-1.5 py-0.5 bg-gray-100 rounded text-xs"><PlusSquare size={12} /> Add to Home Screen</span>.
              </div>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="w-5 h-5 rounded-full bg-[#2f6f4e] text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                3
              </span>
              <div>
                Tap <span className="font-semibold">Add</span> in the top right corner.
              </div>
            </li>
          </ol>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setShowIosModal(false)}
              className="px-4 py-2 bg-[#2f6f4e] text-white text-xs font-semibold rounded-lg hover:bg-[#1f4d36] transition-colors cursor-pointer"
            >
              Got it
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
