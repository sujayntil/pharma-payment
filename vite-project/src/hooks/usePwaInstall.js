import { useState, useEffect } from 'react';

function getIsStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true ||
    document.referrer.includes('android-app://')
  );
}

function getIsIos() {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return (
    /iphone|ipad|ipod/.test(userAgent) &&
    !window.MSStream &&
    !window.chrome
  );
}

export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(getIsStandalone);
  const [isIos] = useState(getIsIos);
  const [isInstallable, setIsInstallable] = useState(
    () => !getIsStandalone() && getIsIos()
  );

  useEffect(() => {
    // If already in standalone mode, no need to listen for prompt
    if (getIsStandalone()) {
      return;
    }

    // Listen for the standard beforeinstallprompt event (Desktop Chrome, Edge, Mobile Chrome, etc.)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
      }
      setDeferredPrompt(null);
      return 'prompted';
    }

    if (isIos) {
      return 'show-ios-instructions';
    }

    return 'unavailable';
  };

  return {
    isInstallable,
    isInstalled,
    isIos,
    promptInstall,
  };
}
