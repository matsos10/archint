import type { Metadata } from 'next';
import { PARTNER_SPECIALTIES, getPartnerForUser } from '@somar/core';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getDb } from '@/lib/db';
import { requireUser } from '@/lib/session';
import { PartnerForm } from './form';

export const metadata: Metadata = { title: 'Perfil de contabilista' };

export default async function PartnerProfilePage() {
  const s = await requireUser();
  const p = await getPartnerForUser(getDb(), s.user.id);
  return (
    <div className="grid max-w-3xl gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{p ? 'Perfil de contabilista' : 'Junta-te à rede de contabilistas Somar'}</h1>
        <p className="text-sm text-muted-foreground">Os clientes escolhem-te no diretório e decidem o que podes ver e fazer na conta deles. Os honorários são acordados diretamente contigo.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Dados profissionais</CardTitle>
          <CardDescription>{p?.verifiedAt ? `Inscrição verificada a ${p.verifiedAt.toLocaleDateString('pt-PT')}.` : 'A inscrição na OCC é verificada manualmente pelo Somar.'}</CardDescription>
        </CardHeader>
        <CardContent>
          <PartnerForm
            specialties={Object.entries(PARTNER_SPECIALTIES)}
            values={{
              name: p?.name ?? s.user.name,
              firmName: p?.firmName ?? '',
              occNumber: p?.occNumber ?? '',
              email: p?.email ?? s.user.email,
              city: p?.city ?? '',
              bio: p?.bio ?? '',
              specialties: p?.specialties ?? [],
              services: p?.services ?? [],
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
