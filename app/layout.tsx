import "./globals.css";
import { Providers } from "./providers";

export const metadata = {
  title: "OUTTACOUCH",
  description: "Event-first social connection web app"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
