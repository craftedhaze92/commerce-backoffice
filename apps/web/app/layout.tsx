import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/shared/api';
import { ThemeProvider } from '@/shared/ui/theme-provider';

export const metadata: Metadata = {
  title: '커머스 백오피스',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning className="h-full antialiased">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-canvas flex min-h-full flex-col">
        <ThemeProvider attribute="class" forcedTheme="light">
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
