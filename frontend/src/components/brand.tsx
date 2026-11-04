import Link from "next/link";
import { ChartNoAxesCombined } from "lucide-react";
export function Brand({ inverse = false }: { inverse?: boolean }) {
  return <Link href="/" className={`brand ${inverse ? "brand-light" : ""}`}>
    <span className="brand-mark"><ChartNoAxesCombined size={23} strokeWidth={2.6} /></span>
    <span>earn<span className="brand-accent">score</span><span className="brand-dot">.</span></span>
  </Link>;
}
