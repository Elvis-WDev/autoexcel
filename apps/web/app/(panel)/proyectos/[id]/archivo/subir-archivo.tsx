'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { MarcoDelAsistente } from '@/components/app/asistente/marco-del-asistente';
import { FileField } from '@/components/app/fields/file-field';
import { useMutationFeedback } from '@/hooks/use-mutation-feedback';
import { subirArchivo, type ProyectoDetalle } from '@/lib/api/asistente';
import { ApiError } from '@/lib/api/errors';

/** El limite del backend: `MAX_UPLOAD_BYTES` por defecto. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * V4 — Sube tu Excel.
 *
 * Solo `.xlsx`. No es una restriccion de esta pantalla: la API rechaza lo demas
 * comprobando la **firma** del archivo, no su extension, asi que ofrecer CSV o
 * el `.xls` antiguo seria provocar un rechazo garantizado.
 *
 * Los fallos del archivo se muestran **en la propia zona**, no en un toast: el
 * error esta en lo que se acaba de elegir y se corrige ahi mismo. Solo lo que no
 * es del archivo —un limite de peticiones, un fallo del servidor— sale por el
 * camino normal del toast.
 */
export function SubirArchivo({ proyecto }: { proyecto: ProyectoDetalle }): React.ReactElement {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState<number | null>(null);
  const [errorDelArchivo, setErrorDelArchivo] = useState<string | null>(null);

  const subir = useMutationFeedback({
    mutationFn: (elegido: File) => {
      setProgreso(0);
      return subirArchivo(proyecto.id, elegido, setProgreso);
    },
    onSuccess: () => {
      router.replace(`/proyectos/${proyecto.id}/hojas`);
      router.refresh();
    },
  });

  function enviar(): void {
    if (!archivo) return;
    setErrorDelArchivo(null);

    subir.mutate(archivo, {
      onError: (error) => {
        setProgreso(null);
        // 413 y 415 son del archivo elegido: van en linea, no en un toast.
        if (
          error instanceof ApiError &&
          (error.code === 'PAYLOAD_TOO_LARGE' || error.code === 'UNSUPPORTED_FILE')
        ) {
          setErrorDelArchivo(error.message);
        }
      },
    });
  }

  const yaTieneArchivo = proyecto.status === 'uploaded';

  return (
    <MarcoDelAsistente
      accion={
        <AsyncButton
          disabled={!archivo}
          onClick={enviar}
          pending={subir.isPending}
          pendingLabel="Subiendo..."
        >
          Continuar
        </AsyncButton>
      }
      descripcion="Leeremos todas sus hojas y te propondremos como organizarlas."
      proyecto={proyecto}
      titulo="Sube tu Excel"
    >
      <FileField
        advertencia={
          yaTieneArchivo
            ? 'Este proyecto ya tiene un archivo. Si subes otro, reemplazara el analisis anterior.'
            : undefined
        }
        error={errorDelArchivo ?? undefined}
        extensiones={['.xlsx']}
        label="Archivo de Excel"
        maxBytes={MAX_BYTES}
        onChange={(elegido) => {
          setArchivo(elegido);
          setErrorDelArchivo(null);
        }}
        progreso={progreso}
        value={archivo}
      />
    </MarcoDelAsistente>
  );
}
