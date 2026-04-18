import type { Metadata } from "next";
import { Inter, Noto_Sans_KR } from "next/font/google";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-noto-sans-kr",
});

export const metadata: Metadata = {
  title: "CHEEZE — Home",
  description: "Edelweiss 개인 서버 홈페이지",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${inter.variable} ${notoSansKR.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
