import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Política de privacidade' };

export default function PrivacyPage() {
  return (
    <main className="mx-auto grid max-w-2xl gap-4 px-6 py-16">
      <Link href="/" className="text-sm text-primary">← Voltar</Link>
      <h1 className="text-3xl font-semibold">Política de privacidade</h1>
      <p className="text-sm text-muted-foreground">Versão provisória — a rever pelo encarregado de proteção de dados.</p>
      <ul className="grid list-disc gap-2 pl-5">
        <li>Tratamos dados financeiros e fiscais apenas para prestar o serviço (RGPD, art. 6.º, n.º 1, b).</li>
        <li>Os dados são encriptados em trânsito (TLS) e em repouso (AES-256-GCM para ficheiros e campos sensíveis).</li>
        <li>Nunca recebemos as tuas credenciais bancárias: o acesso é feito por um agregador licenciado (PSD2), só de leitura.</li>
        <li>Cada acesso e alteração fica registado. Um contabilista só acede à tua conta se o autorizares.</li>
        <li>Podes exportar ou eliminar os teus dados a qualquer momento nas definições, salvo obrigações legais de conservação (ex.: faturas emitidas, art. 52.º CIVA).</li>
      </ul>
    </main>
  );
}
