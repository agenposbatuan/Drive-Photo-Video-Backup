import { useState, useEffect } from 'react';
import { PwaService, PwaState } from '../services/PwaService';

export function usePwa() {
  const [pwaState, setPwaState] = useState<PwaState>(PwaService.getState());

  useEffect(() => {
    return PwaService.subscribe(setPwaState);
  }, []);

  const installApp = async () => {
    return await PwaService.promptInstall();
  };

  const updateApp = () => {
    PwaService.applyUpdate();
  };

  return {
    ...pwaState,
    installApp,
    updateApp,
  };
}
