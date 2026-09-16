'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { FormDialog } from '@/components/app/form-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { clavesDeProyectos, crearProyecto } from '@/lib/api/proyectos';

/**
 * Las reglas del nombre, copiadas del backend a proposito.
 *
 * `forms-and-workflows.md`: la pantalla no debe dejar componer una peticion que
 * la API va a rechazar. Los textos son **los mismos** que devuelve el servidor,
 * para que la persona no lea dos redacciones distintas del mismo limite segun
 * donde se detecte.
 *
 * Sigue siendo una conveniencia, no una garantia: el backend valida igual.
 */
const esquema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, 'Escribe un nombre para el proyecto.')
    .max(120, 'El nombre no puede pasar de 120 caracteres.'),
});

type Valores = z.infer<typeof esquema>;

export function DialogoNuevoProyecto({
  abierto,
  onAbiertoChange,
}: {
  abierto: boolean;
  onAbiertoChange: (abierto: boolean) => void;
}): React.ReactElement {
  const router = useRouter();

  const formulario = useForm<Valores>({
    resolver: zodResolver(esquema),
    defaultValues: { nombre: '' },
  });

  const crear = useMutationFeedback({
    mutationFn: (valores: Valores) => crearProyecto(valores.nombre),
    success: 'Proyecto creado.',
    invalidate: [clavesDeProyectos.todas],
    onSuccess: (proyecto) => {
      onAbiertoChange(false);
      formulario.reset();
      // Un proyecto recien creado esta vacio: lo util es seguir subiendo el
      // Excel, no volver a una lista donde solo se ve su nombre.
      router.push(`/proyectos/${proyecto.id}`);
    },
  });

  const error = formulario.formState.errors.nombre?.message;

  return (
    <FormDialog
      abierto={abierto}
      descripcion="Le pondras un Excel encima en el siguiente paso."
      guardando={crear.isPending}
      onAbiertoChange={(siguiente) => {
        if (!siguiente) formulario.reset();
        onAbiertoChange(siguiente);
      }}
      onSubmit={() => void formulario.handleSubmit((valores) => crear.mutate(valores))()}
      textoDeAccion="Crear proyecto"
      titulo="Nuevo proyecto"
    >
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input
          aria-describedby={error ? 'nombre-error' : undefined}
          aria-invalid={error ? true : undefined}
          autoComplete="off"
          id="nombre"
          {...formulario.register('nombre')}
        />
        {error ? (
          <p className="text-destructive text-sm" id="nombre-error">
            {error}
          </p>
        ) : null}
      </div>
    </FormDialog>
  );
}
