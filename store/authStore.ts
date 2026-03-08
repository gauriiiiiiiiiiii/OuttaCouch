import { create } from "zustand";

type AuthState = {
  userId?: string;
  profileComplete: boolean;
  setUserId: (userId?: string) => void;
  setProfileComplete: (value: boolean) => void;
};

export const useAuthStore = create<AuthState>((set) => ({
  userId: undefined,
  profileComplete: false,
  setUserId: (userId) => set({ userId }),
  setProfileComplete: (profileComplete) => set({ profileComplete })
}));
