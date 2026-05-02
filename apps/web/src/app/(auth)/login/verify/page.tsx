import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import VerifyLoginCard from '@/components/auth/VerifyLoginCard';

interface Props {
  readonly searchParams: Promise<{
    readonly email?: string;
    readonly callbackUrl?: string;
    readonly error?: string;
    readonly name?: string;
  }>;
}

export default async function VerifyLoginPage(props: Readonly<Props>) {
  const session = await getSession();
  if (session.isLoggedIn) redirect('/home');

  const params = await props.searchParams;
  const pendingLogin = session.pendingLogin;
  const email = params.email ?? pendingLogin?.email;

  if (!email || !pendingLogin) {
    redirect('/login?error=session_expired');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-brand-50 to-brand-100">
      <VerifyLoginCard
        email={email}
        callbackUrl={params.callbackUrl ?? pendingLogin.callbackUrl}
        error={params.error}
        name={params.name ?? pendingLogin.name ?? undefined}
        debugCode={pendingLogin.debugCode}
      />
    </div>
  );
}