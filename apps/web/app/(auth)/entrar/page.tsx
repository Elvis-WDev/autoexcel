import { Suspense } from 'react';
import { FormularioEntrar } from './formulario-entrar';

export const metadata = { title: 'Entrar · excel-to-software' };

export default function Entrar(): React.ReactElement {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-12">
      <Suspense>
        <FormularioEntrar />
      </Suspense>
    </main>
  );
}
