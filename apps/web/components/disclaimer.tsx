import { cn } from '@/lib/utils';

export const DISCLAIMER =
  'O Somar ajuda-te a organizar a tua contabilidade e as tuas obrigações, mas não substitui um contabilista certificado. És responsável pelas declarações que submetes. Confirma sempre os valores nas fontes oficiais (Portal das Finanças e Segurança Social Direta).';

export function Disclaimer({ className }: { className?: string }) {
  return <p className={cn('text-xs leading-relaxed text-muted-foreground', className)}>{DISCLAIMER}</p>;
}
