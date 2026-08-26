import { Plus_Jakarta_Sans, IBM_Plex_Mono } from 'next/font/google';
import { Provider } from '@/components/provider';
import './global.css';

const sans = Plus_Jakarta_Sans({
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
    default: 'Pulse docs',
    template: '%s | Pulse',
  },
  description: 'Local-first desktop API client — requests, collections, variables, and inheritance.',
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
