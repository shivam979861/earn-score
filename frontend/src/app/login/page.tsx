import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { getSession } from "@/lib/server-auth";
export default async function Login(){
  const user=await getSession();if(user)redirect(`/${user.role}`);
  return <div className="auth-clean"><header className="auth-clean-header"><Brand/></header><main className="auth-clean-main"><section className="auth-clean-aside"><span className="ui-kicker">WELCOME BACK</span><h2>One place for a clearer financial picture.</h2><p>Access your worker, lender, or admin workspace securely.</p><div className="auth-clean-benefits"><div><Icon name="shield-check" size={19}/><span>Consent and privacy controls</span></div><div><Icon name="chart-no-axes-combined" size={19}/><span>Easy-to-understand financial insights</span></div><div><Icon name="user" size={19}/><span>Human-reviewed lending workflow</span></div></div><small>Hackathon prototype. Financial scoring uses fictional data.</small></section><section className="auth-clean-panel"><span className="auth-heading-icon"><Icon name="lock-keyhole" size={20}/></span><h1>Sign in</h1><p>Use your EarnScore account to continue.</p><AuthForm mode="login"/></section></main></div>;
}
