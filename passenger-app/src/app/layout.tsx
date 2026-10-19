import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'SpotHail | NIT Calicut Transit Radar',
  description: 'Booking-free real-time visibility radar for unorganized shared transit (autos/e-rickshaws) at NIT Calicut.',
  applicationName: 'SpotHail',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SpotHail',
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
    <html lang="en" className="dark">
      <body
        className={`${inter.className} h-screen w-screen overflow-hidden touch-none antialiased bg-slate-950 text-slate-100`}
      >
        {children}
      </body>
    </html>
  );
}
