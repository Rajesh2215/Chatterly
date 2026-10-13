import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Chatterly — Sign In',
  description: 'Sign in to your Chatterly account',
};

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      {children}
    </div>
  );
}
