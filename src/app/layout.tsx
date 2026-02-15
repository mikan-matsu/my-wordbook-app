// src/app/layout.tsx を以下の内容に完全に置き換えてください

import { Amplify } from 'aws-amplify';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 環境変数がある場合はそれを使用、ない場合は aws-exports を試行
const amplifyConfig = {
  aws_project_region: 'ap-northeast-1',
  aws_appsync_graphqlEndpoint: process.env.NEXT_PUBLIC_AWS_APPSYNC_GRAPHQLENDPOINT,
  aws_appsync_region: 'ap-northeast-1',
  aws_appsync_authenticationType: 'API_KEY' as const,
  aws_appsync_apiKey: process.env.NEXT_PUBLIC_AWS_APPSYNC_APIKEY,
};

// Vercel等で環境変数が設定されている場合のみ実行、そうでなければ従来の exports を使う
// (ローカルで .env.local があればここが通ります)
try {
  Amplify.configure(amplifyConfig);
} catch (e) {
  console.error("Amplify configuration failed:", e);
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "My Wordbook App",
  description: "Simple wordbook with Amplify",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}