import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bhramari — Every hive has a story. Every jar has proof.",
  description: "A connected hive economy. Trace honey and beeswax, support beekeepers, and discover the story behind every jar with Bhramari.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><a className="skip-link" href="#main">Skip to content</a>{children}</body></html>;
}
