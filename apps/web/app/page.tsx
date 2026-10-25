import Link from 'next/link';
import { ArrowRight, CalendarClock, Camera, FileText, Landmark, ShieldCheck, Sparkles } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { Disclaimer } from '@/components/disclaimer';
import { ThemeToggle } from '@/components/theme-toggle';

const FEATURES = [
  { icon: Landmark, title: 'Contabilidade automática', text: 'Liga o teu banco e as transações ficam categorizadas, com o IVA identificado.' },
  { icon: FileText, title: 'Faturas sem complicações', text: 'Orçamentos e faturas ilimitados, com ATCUD e QR code, e lembretes de cobrança.' },
  { icon: CalendarClock, title: 'Nunca mais falhas um prazo', text: 'IVA, IRS, Segurança Social: o calendário é teu e avisamos-te a tempo.' },
  { icon: Sparkles, title: 'Impostos em tempo real', text: 'Sabe hoje quanto vais pagar de IRS, IVA e contribuições, e quanto podes poupar.' },
  { icon: Camera, title: 'Despesas numa foto', text: 'Fotografa o talão: lemos os dados e associamos à transação certa.' },
  { icon: ShieldCheck, title: 'Contabilista quando precisas', text: 'Delega declarações ou certifica contas com um contabilista certificado parceiro.' },
];

export default function Home() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild>
            <Link href="/entrar">Entrar</Link>
          </Button>
          <Button asChild>
            <Link href="/registar">Começar grátis</Link>
          </Button>
        </nav>
      </header>
      <main>
        <section className="mx-auto grid max-w-4xl gap-8 px-6 pt-16 pb-20 text-center sm:pt-24">
          <p className="mx-auto rounded-full bg-accent px-4 py-1.5 text-sm text-accent-foreground">Para recibos verdes, ENI e pequenas empresas</p>
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-6xl">A tua contabilidade, finalmente simples.</h1>
          <p className="mx-auto max-w-2xl text-lg text-pretty text-muted-foreground">
            Faturas, despesas, IVA, IRS e Segurança Social num só sítio, em linguagem clara. Tu decides tudo; nós fazemos as contas.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild>
              <Link href="/registar">
                Criar conta grátis <ArrowRight />
              </Link>
            </Button>
          </div>
        </section>
        <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="grid gap-3 rounded-2xl border bg-card p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <Icon className="size-5" />
              </span>
              <h2 className="font-semibold">{title}</h2>
              <p className="text-sm text-muted-foreground">{text}</p>
            </div>
          ))}
        </section>
      </main>
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-10 text-sm text-muted-foreground sm:grid-cols-[1fr_auto]">
          <Disclaimer />
          <div className="flex gap-4">
            <Link href="/termos" className="hover:text-foreground">Termos</Link>
            <Link href="/privacidade" className="hover:text-foreground">Privacidade</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
