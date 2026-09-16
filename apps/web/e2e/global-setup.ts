import { execFileSync } from 'node:child_process';
import { CUENTA, DIRECTORIO_DE_ARCHIVOS } from './datos';

/**
 * Deja la base y el disco listos antes de abrir el navegador.
 *
 * Dos cosas: los archivos de demo —los mismos del ERS 18 que usa la aceptacion
 * del backend— y una cuenta desechable, porque el registro publico esta cerrado
 * y sin cuenta no se puede ni entrar.
 */
/** `Record` y no `ProcessEnv`: Next declara `NODE_ENV` obligatorio y aqui solo
 *  se anaden variables sueltas a las que ya hay. */
function enLaApi(
  comando: string,
  argumentos: string[],
  entorno: Record<string, string> = {},
): void {
  execFileSync(comando, argumentos, {
    cwd: new URL('../../api', import.meta.url).pathname,
    env: { ...process.env, ...entorno },
    stdio: 'pipe',
  });
}

export default function preparar(): void {
  enLaApi('corepack', ['pnpm', 'demo:files', DIRECTORIO_DE_ARCHIVOS]);

  // `db:seed` no hace nada si la cuenta ya existe, asi que repetir es seguro.
  enLaApi('corepack', ['pnpm', 'db:seed'], {
    SEED_EMAIL: CUENTA.correo,
    SEED_PASSWORD: CUENTA.contrasena,
    SEED_NAME: CUENTA.nombre,
  });
}
