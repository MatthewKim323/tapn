import { create } from 'zustand';

export const useSceneStore = create((set, get) => ({
  navigationState: 'idle', // 'idle' | 'zoomingIn' | 'zoomingOut'
  overlayColor: '#000000',
  isLoading: true,
  isIntroComplete: false,

  setIsLoading: (loading) => set({ isLoading: loading }),
  setIntroComplete: () => set({ isIntroComplete: true }),
  setOverlayColor: (color) => set({ overlayColor: color }),

  triggerZoom: () => {
    const { navigationState } = get();
    if (navigationState === 'idle') {
      set({ navigationState: 'zoomingIn' });
    }
  },

  resetNavigation: () => set({ navigationState: 'idle', overlayColor: '#000000' }),
}));
