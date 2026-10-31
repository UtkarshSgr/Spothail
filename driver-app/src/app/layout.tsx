import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SpotHail Driver HUD | Auto #04',
  description: 'Tactile real-time cockpit & passenger visibility dashboard for auto drivers at NIT Calicut.',
  applicationName: 'SpotHail Driver',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SpotHail Driver',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#020617',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark h-full">
      <body className={`${inter.className} h-full bg-slate-950 text-slate-100 antialiased overflow-hidden select-none`}>
        {children}
      </body>
    </html>
  );
}
