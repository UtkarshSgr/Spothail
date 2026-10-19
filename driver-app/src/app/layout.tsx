import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SpotHail Driver HUD | Auto #04',
  description: 'Tactile real-time cockpit & passenger visibility radar for auto drivers at NIT Calicut.',
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
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full w-full">
      <body
        className={`${inter.className} h-full w-full overflow-hidden touch-none antialiased bg-slate-950 text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
