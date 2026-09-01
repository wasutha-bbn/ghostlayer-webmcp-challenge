import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'GhostLayer — Human-governed WebMCP challenge sandbox',
  description: 'A safe, fictional CRM where agents use structured WebMCP tools and humans approve consequential actions.',
  metadataBase: new URL(process.env.SITE_ORIGIN ?? 'http://localhost:4176'),
  openGraph: {
    title: 'GhostLayer — Agent speed, human authority',
    description: 'Give agents structured WebMCP tools while humans retain control of consequential actions.',
    images: [{ url: '/og.png', width: 1731, height: 909, alt: 'GhostLayer — Agent speed. Human authority.' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GhostLayer — Agent speed, human authority',
    description: 'Give agents structured WebMCP tools while humans retain control of consequential actions.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
