import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import LoginCard from '@/components/auth/LoginCard';

interface Props {
  readonly searchParams: Promise<{ readonly error?: string; readonly callbackUrl?: string }>;
}

export default async function LoginPage(props: Readonly<Props>) {
  const { searchParams } = props;
  const session = await getSession();
  if (session.isLoggedIn) redirect('/home');

  const params = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center py-10">
      <LoginCard error={params.error} callbackUrl={params.callbackUrl} />
    </div>
  );
}
