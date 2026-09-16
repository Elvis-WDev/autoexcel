'use client';

import { AlertCircle } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { AsyncButton } from '@/components/app/async-button';
import { PasswordField } from '@/components/app/password-field';
import { useHydrated } from '@/hooks/use-hydrated';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { signIn } from '@/lib/auth/client';
import { mensajeDeAutenticacion } from '@/lib/auth/messages';
import { esDestinoSeguro } from '@/lib/auth/destino';

/**
 * V1 — Entrar.
 *
 * No hay enlace a "crear cuenta": el registro publico esta cerrado en el
 * backend (`disableSignUp`), y ofrecerlo seria mentir.
 *
 * El error va **en linea sobre el formulario**, no en un toast. Es una
 * condicion que persiste hasta corregirla, y el toast esta reservado para lo
 * transitorio (`feedback-and-states.md`). Los valores escritos se conservan.
 */
export function FormularioEntrar(): React.ReactElement {
  const router = useRouter();
  const parametros = useSearchParams();
  const destino = esDestinoSeguro(parametros.get('destino')) ?? '/proyectos';

  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  /**
   * El boton no se habilita hasta que React ha hidratado.
   *
   * Antes de eso `onSubmit` no existe todavia, asi que el navegador envia el
   * formulario **de forma nativa**: una peticion GET a esta misma ruta con los
   * campos en la barra de direcciones. La contrasena acabaria en el historial
   * del navegador, en los registros del servidor y en la cabecera `Referer`.
   *
   * No es teorico: ocurrio la primera vez que una prueba de navegador relleno
   * este formulario mas rapido de lo que tardo la pagina en hidratarse, que es
   * justo lo que le pasa a alguien con una conexion lenta que teclea rapido.
   * Sin JavaScript no hay forma de impedir el envio nativo; lo unico que se
   * puede hacer es no ofrecer el boton hasta poder atenderlo.
   */
  const hidratado = useHydrated();

  async function enviar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

    const resultado = await signIn.email({ email: correo, password: contrasena });

    if (resultado.error) {
      setError(mensajeDeAutenticacion(resultado.error.code, resultado.error.status));
      setEnviando(false);
      return;
    }

    // `refresh` antes de navegar: el guardia de rutas lee la cookie en el
    // servidor, y sin esto vuelve a ver la peticion anterior.
    router.replace(destino);
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 space-y-1.5">
        <h1 className="text-xl font-semibold tracking-tight">excel-to-software</h1>
        <p className="text-muted-foreground text-sm">Entra para abrir tus proyectos.</p>
      </div>

      {error ? (
        <div
          className="border-destructive/30 bg-destructive/5 text-destructive mb-6 flex items-start gap-2.5 rounded-md border p-3 text-sm"
          role="alert"
        >
          <AlertCircle aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      ) : null}

      <form className="space-y-5" noValidate onSubmit={(e) => void enviar(e)}>
        <div className="space-y-2">
          <Label htmlFor="correo">Correo</Label>
          <Input
            autoComplete="username"
            autoFocus
            id="correo"
            name="correo"
            onChange={(e) => setCorreo(e.target.value)}
            required
            type="email"
            value={correo}
          />
        </div>

        <PasswordField
          autoComplete="current-password"
          label="Contrasena"
          name="contrasena"
          onChange={(e) => setContrasena(e.target.value)}
          required
          value={contrasena}
        />

        <AsyncButton
          className="w-full"
          disabled={!hidratado}
          pending={enviando}
          pendingLabel="Entrando..."
          type="submit"
        >
          Entrar
        </AsyncButton>
      </form>
    </div>
  );
}
