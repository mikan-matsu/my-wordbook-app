// src/app/layout.tsx の内容を以下に書き換えてください（Vercel/ローカル両対応）

import { Amplify } from 'aws-amplify';
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// 環境変数から設定を構築（aws-exports.jsに依存しない）
const amplifyConfig = {
  aws_project_region: 'ap-northeast-1',
  aws_appsync_graphqlEndpoint: process.env.NEXT_PUBLIC_AWS_APPSYNC_GRAPHQLENDPOINT,
  aws_appsync_region: 'ap-northeast-1',
  aws_appsync_authenticationType: 'API_KEY' as const,
  aws_appsync_apiKey: process.env.NEXT_PUBLIC_AWS_APPSYNC_APIKEY,
};

Amplify.configure(amplifyConfig);

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