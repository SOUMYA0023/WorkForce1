import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WorkForce One — Enterprise Attendance Management",
  description: "Enterprise Workforce Attendance System for Tamil Nadu Coke and Power Private Limited",
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
