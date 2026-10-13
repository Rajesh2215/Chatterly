import type { Metadata } from 'next';
import './globals.css';
import '@/styles/chat.css';
import '@/styles/auth.css';

export const metadata: Metadata = {
  title: 'Chatterly — Modern Real-Time Chat',
  description: 'High-performance WhatsApp & Telegram inspired chat application built with Next.js and TypeScript',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
