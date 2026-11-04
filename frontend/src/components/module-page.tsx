import Link from "next/link";
import { Icon } from "@/components/icon";
import { modules } from "@/lib/navigation";
export function ModulePage({ route, home }: { route: string; home: string }) {
  const mod = modules[route];
  if (!mod) return <div className="new-page-heading"><h1>Page unavailable</h1><Link className="btn btn-outline" href={home}>Return home</Link></div>;
  return <div className="minimal-module"><Link className="back-text" href={home}><Icon name="arrow-left" size={16}/> Back to home</Link><div className="module-icon"><Icon name="info" size={26}/></div><span className="ui-kicker">PLANNED FEATURE</span><h1>{mod.title}</h1><p>{mod.description}</p><div className="planned-steps"><strong>What we're building next</strong><ul>{mod.steps.map(step=><li key={step}><Icon name="check" size={16}/>{step}</li>)}</ul></div><Link href={home} className="btn btn-primary">Return to dashboard <Icon name="arrow-right" size={16}/></Link></div>;
}
