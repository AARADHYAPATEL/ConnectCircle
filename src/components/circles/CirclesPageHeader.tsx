import { AppHeader } from "@/components/layout/AppHeader";

type CirclesPageHeaderProps = {
  username: string;
};

export function CirclesPageHeader({ username }: CirclesPageHeaderProps) {
  return <AppHeader activeSection="groups" username={username} />;
}
