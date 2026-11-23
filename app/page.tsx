import { redirect } from 'next/navigation';
import { crearClienteServidor } from '@/lib/supabase/server';
import { Encabezado } from './_mostrador/encabezado';
import { BuscarClienta } from './_mostrador/buscar-clienta';

/** Mostrador: buscar clienta (o darla de alta) para abrir su ficha. */
export default async function MostradorPage() {
  const {
    data: { user },
  } = await crearClienteServidor().auth.getUser();
  if (!user) redirect('/login');

  return (
    <main>
      <Encabezado />
      <BuscarClienta />
    </main>
  );
}
