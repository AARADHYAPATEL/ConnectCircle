import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ConnectCircle",
  description: "A student peer-support app for mood check-ins and kind messages.",
  icons: {
    icon: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
