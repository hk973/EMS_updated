import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/components/ui/ToastContext';
import ThemeProvider from '@/components/providers/ThemeProvider';
import ClientOnly from '@/components/providers/ClientOnly';

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Employee Management System",
  description: "A comprehensive HR management application with payroll processing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className} suppressHydrationWarning={true}>
        <ThemeProvider>
          <ClientOnly>
            <AuthProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </AuthProvider>
          </ClientOnly>
        </ThemeProvider>
      </body>
    </html>
  );
}
