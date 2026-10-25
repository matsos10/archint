import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Logo } from '@/components/brand/logo';
import { requireUser } from '@/lib/session';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireUser();
  if (!s.user.isPlatformAdmin) notFound();
  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b px-6 py-4">
        <Link href="/app" className="flex items-center gap-3">
          <Logo /> <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs">Administração</span>
        </Link>
        <nav className="flex gap-4 text-sm">
          <Link href="/admin/parametros" className="hover:text-primary">Parâmetros fiscais</Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
