import type { AppRouterInstance } from "next/navigation";

export const navigateToProfile = (router: AppRouterInstance, userId: string) => {
  if (!userId) {
    return;
  }
  router.push(`/users/${userId}`);
};
