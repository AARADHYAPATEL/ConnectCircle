import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConnectCircle",
  description:
    "A private check-in and peer-support workspace for moods, friends, and trusted circles.",
  icons: {
    icon: "/icon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  const themePreference =
    user?.themePreference === "light" || user?.themePreference === "dark"
      ? user.themePreference
      : undefined;

  return (
    <html data-theme={themePreference} lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
