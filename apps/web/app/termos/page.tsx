import type { Metadata } from 'next';
import Link from 'next/link';
import { DISCLAIMER } from '@/components/disclaimer';

export const metadata: Metadata = { title: 'Termos de utilização' };

export default function TermsPage() {
  return (
    <main className="prose mx-auto grid max-w-2xl gap-4 px-6 py-16">
      <Link href="/" className="text-sm text-primary">← Voltar</Link>
      <h1 className="text-3xl font-semibold">Termos de utilização</h1>
      <p className="text-sm text-muted-foreground">Versão provisória — a rever por um jurista antes do lançamento.</p>
      <p>{DISCLAIMER}</p>
      <p>
        Os cálculos de impostos e contribuições são estimativas baseadas nos parâmetros fiscais publicados para cada ano e
        nos dados que introduzes. A submissão de declarações é feita por ti, no Portal das Finanças e na Segurança Social
        Direta, ou por um contabilista certificado que escolheres.
      </p>
      <p>Os serviços bancários são prestados exclusivamente por entidades licenciadas parceiras; o Somar só tem acesso de leitura.</p>
    </main>
  );
}
