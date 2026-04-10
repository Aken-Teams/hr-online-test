import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '强茂科技 - 员工技能考核系统',
  description: '强茂半导体员工入职及技能在线测试平台',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
