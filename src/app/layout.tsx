"use client"; // Amplifyの設定をブラウザ側で適用するために必要です

import { Amplify } from 'aws-amplify';
import amplifyconfig from '../aws-exports'; // amplify pushで自動生成された設定ファイル
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// AWS AppSyncやDynamoDBへの接続情報をアプリに認識させます
Amplify.configure(amplifyconfig);

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}