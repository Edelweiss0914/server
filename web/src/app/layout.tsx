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
  title: "CHEEZE — 통합 업무 플랫폼",
  description: "소상공인을 위한 통합 IT 인프라 솔루션",
};

const themeInitScript = `
(function(){
  try {
    var t = localStorage.getItem('edelweiss-theme');
    if (!t) t = matchMedia('(prefers-color-scheme:dark)').matches ? 'dark' : 'light';
    if (t === 'dark') document.documentElement.classList.add('dark');
  } catch(e){}
  window.addEventListener('pageshow', function(e) {
    if (e.persisted) window.location.reload();
  });
})();
`;

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
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col font-sans">
        <ThemeToggle />
        {children}
      </body>
    </html>
  );
}
