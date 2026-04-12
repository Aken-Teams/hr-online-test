import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: '智考云 - 企业员工在线考核平台',
    template: '%s | 智考云',
  },
  description: '智考云是专业的企业员工在线考核平台，支持选择题、判断题、简答题等多种题型，提供限时考试、自动评分、成绩统计等功能。',
  keywords: ['在线考试', '企业考核', '员工测试', '技能考核', '智考云'],
  authors: [{ name: '智合科技', url: 'https://www.zh-aoi.com/' }],
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: '智考云 - 企业员工在线考核平台',
    description: '专业的企业员工在线考核平台，支持多种题型与自动评分',
    siteName: '智考云',
    locale: 'zh_CN',
    type: 'website',
  },
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Noto+Serif+SC:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full bg-stone-50 text-stone-800">{children}</body>
    </html>
  );
}
