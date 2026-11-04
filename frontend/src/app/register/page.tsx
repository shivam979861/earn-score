import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { getSession } from "@/lib/server-auth";
export default async function Register(){
  const user=await getSession();if(user)redirect(`/${user.role}`);
  return <div className="auth-clean"><header className="auth-clean-header"><Brand/></header><main className="auth-clean-main"><section className="auth-clean-aside"><span className="ui-kicker">LET'S GET STARTED</span><h2>Your earnings deserve to be understood.</h2><p>Create a free worker demo account to explore the EarnScore experience.</p><div className="auth-clean-benefits"><div><Icon name="cloud-upload" size={19}/><span>Preview an income statement locally</span></div><div><Icon name="gauge" size={19}/><span>Explore an illustrative score</span></div><div><Icon name="shield-check" size={19}/><span>Manage your consent</span></div></div><small>Worker signup only. Lenders and admins are added by an administrator.</small></section><section className="auth-clean-panel"><span className="auth-heading-icon"><Icon name="user" size={20}/></span><h1>Create account</h1><p>Start exploring with a worker account.</p><AuthForm mode="register"/></section></main></div>;
}
