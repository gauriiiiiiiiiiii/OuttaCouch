type RouterLike = { push: (href: string) => void };

export const navigateToProfile = (router: RouterLike, userId: string) => {
  if (!userId) {
    return;
  }
  router.push(`/users/${userId}`);
};
