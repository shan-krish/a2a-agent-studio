import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "A2A Agent Studio",
  description: "Agent-to-Agent Protocol Studio - Professional AI Agent Communication Interface",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <style>{`
          html {
            font-family: ${inter.style.fontFamily};
            --font-sans: ${inter.variable};
            --font-mono: ${jetbrainsMono.variable};
          }
        `}</style>
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} min-h-screen bg-navy-900 text-foreground font-sans antialiased`}
      >
        <TooltipProvider delay={300}>
          {children}
        </TooltipProvider>
      </body>
    </html>
  );
}
