import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Somar — contabilidade simples para independentes', template: '%s · Somar' },
  description:
    'Contabilidade, faturação e obrigações fiscais para trabalhadores independentes e pequenas empresas em Portugal.',
  applicationName: 'Somar',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Somar', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fcfbf8' },
    { media: '(prefers-color-scheme: dark)', color: '#16181d' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// Aplica o tema antes da pintura para evitar "flash" (preferência guardada ou do sistema).
const themeScript = `try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d)}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-PT" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans">{children}</body>
    </html>
  );
}
