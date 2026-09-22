import type { Metadata, Viewport } from "next";
import { Archivo, Fraunces } from "next/font/google";
/* Order matters: tokens and primitives first, then the per-surface sheets that
   build on them. An @import inside globals.css would load these too early and
   let the primitives win ties against the surfaces. */
import "./globals.css";
import "./styles/site.css";
import "./styles/passport.css";
import "./styles/workspace.css";
import { MotionProvider } from "@/components/motion-provider";

/* Fraunces carries the display voice: its SOFT and WONK axes round and tilt
   the letterforms just enough to read as hand-cut wax rather than a system
   serif. Archivo holds the text, with a width range wide enough for dense
   field data and running prose alike. */
const display = Fraunces({
  subsets: ["latin"],
  axes: ["SOFT", "WONK", "opsz"],
  variable: "--font-display-loaded",
  display: "swap",
});

const text = Archivo({
  subsets: ["latin"],
  variable: "--font-text-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Bhramari — every jar carries its own proof",
    template: "%s · Bhramari",
  },
  description:
    "A connected hive economy for India's beekeepers. Record work offline, keep custody accountable, and open the story behind any jar of honey with a scan.",
  openGraph: {
    title: "Bhramari — every jar carries its own proof",
    description:
      "A connected hive economy for India's beekeepers. Record work offline, keep custody accountable, and open the story behind any jar of honey with a scan.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#1b1205",
  colorScheme: "light",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${text.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
