import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "EarnScore — Financial opportunity for everyone",
  description: "Explainable alternative credit assessment for gig workers, freelancers and lenders.",
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
