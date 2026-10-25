import Link from 'next/link';
import { Logo } from '@/components/brand/logo';
import { Disclaimer } from '@/components/disclaimer';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl items-center px-6 py-6">
        <Link href="/" aria-label="Somar, página inicial">
          <Logo />
        </Link>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 pt-6 pb-16 sm:pt-16">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="mx-auto w-full max-w-md px-6 pb-8">
        <Disclaimer className="text-center" />
      </footer>
    </div>
  );
}
