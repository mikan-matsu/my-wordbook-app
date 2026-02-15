import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import ConfigureAmplifyClient from './configure-amplify';

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
        <ConfigureAmplifyClient />
        {children}
      </body>
    </html>
  );
}