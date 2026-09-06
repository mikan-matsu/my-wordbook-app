import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import ConfigureAmplifyClient from './configure-amplify';

const adsenseClientId = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
// Google Analytics(GA4): main環境のみAmplify Consoleで環境変数を設定する想定。未設定のdevelop/ローカルでは読み込まれない。
const gaMeasurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

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
  manifest: "/manifest.json",
  icons: {
    icon: ["/icon-192.png", "/icon-512.png"],
    apple: "/icon-192.png",
  },
};

export const viewport = {
  themeColor: "#60a5fa",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {adsenseClientId && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClientId}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
        {gaMeasurementId && (
          <>
            <Script async src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`} strategy="afterInteractive" />
            <Script id="ga4-init" strategy="afterInteractive">
              {`
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${gaMeasurementId}');
              `}
            </Script>
          </>
        )}
        <ConfigureAmplifyClient />
        {children}
      </body>
    </html>
  );
}