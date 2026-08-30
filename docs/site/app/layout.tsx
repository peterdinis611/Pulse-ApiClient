import { Fraunces, Figtree, IBM_Plex_Mono } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const display = Fraunces({
  subsets: ['latin'],
  variable: '--font-pulse-display',
});

const sans = Figtree({
  subsets: ['latin'],
  variable: '--font-pulse-sans',
});

const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-pulse-mono',
});

export const metadata = {
  title: {
    default: 'Pulse field manual',
    template: '%s · Pulse',
  },
  description:
    'Local-first desktop API client — requests, collections, variables, inheritance, and the HTTP engine.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${sans.variable} ${mono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
