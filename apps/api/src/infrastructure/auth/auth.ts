import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import type { SessionReader } from '../../application/ports/session.js';
import { registrarIntentoDeAcceso } from './login-throttle.js';
import type { Env } from '../../config/env.js';
import type { PrismaClient } from '../database/prisma.js';

export type Auth = ReturnType<typeof createAuth>;

/**
 * Better Auth es duenno de la autenticacion completa: hash de contrasenas,
 * sesiones, cookies y sus tablas. `AGENTS.md` lo exige y nada del codigo de la
 * aplicacion debe reimplementar ninguna de esas piezas.
 *
 * Registro cerrado (`disableSignUp`). Abrir el registro es una decision de
 * producto, no un efecto secundario de la configuracion por defecto.
 *
 * `allowSignUp` existe solo para el script de siembra: `disableSignUp` bloquea
 * tambien las llamadas desde el propio servidor, asi que la unica forma de crear
 * la primera cuenta sin escribir el hash a mano es levantar una instancia
 * aparte con el registro abierto. Ningun camino HTTP puede activarlo.
 */
export interface AuthOptions {
  allowSignUp?: boolean;
}

export function createAuth(prisma: PrismaClient, env: Env, options: AuthOptions = {}) {
  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: env.AUTH_SECRET,
    baseURL: env.AUTH_BASE_URL,
    basePath: '/api/auth',
    trustedOrigins: env.AUTH_TRUSTED_ORIGINS,
    emailAndPassword: {
      enabled: true,
      disableSignUp: options.allowSignUp !== true,
      minPasswordLength: 12,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      useSecureCookies: env.NODE_ENV === 'production',
      /**
       * De quien fiarse al resolver la direccion del cliente.
       *
       * Vacio por defecto: sin proxies declarados, `normalizeClientAddress` ya
       * sustituyo la cabecera por la direccion del socket, asi que aqui no llega
       * nada que un cliente haya podido escribir.
       */
      ipAddress: { trustedProxies: [...env.AUTH_TRUSTED_PROXIES] },
    },

    hooks: {
      /**
       * Limite de intentos **por cuenta**, antes de comprobar la contrasena.
       *
       * El limite por IP que trae Better Auth no sirve en este despliegue: la
       * API no puede conocer la direccion de la persona. Ver el comentario de
       * `login-throttle.ts`, que lo explica con lo que se midio.
       */
      before: createAuthMiddleware((ctx) => {
        if (ctx.path !== '/sign-in/email') return Promise.resolve();

        const correo = (ctx.body as { email?: unknown } | undefined)?.email;
        if (typeof correo !== 'string' || correo.length === 0) return Promise.resolve();

        const resultado = registrarIntentoDeAcceso(correo, {
          intentos: env.AUTH_LOGIN_ATTEMPTS,
          ventanaMs: env.AUTH_LOGIN_WINDOW_MINUTES * 60_000,
        });

        if (!resultado.permitido) {
          /*
           * El `APIError` de Better Auth, no el `AppError` del dominio: este
           * hook corre dentro de su manejador, que captura lo que no reconoce y
           * responde 500. Con su propio error responde 429, y con el codigo que
           * el panel ya sabe traducir.
           */
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'TOO_MANY_REQUESTS',
            message:
              'Demasiados intentos con esta cuenta. Espera un momento antes de volver a probar.',
            retryAfter: resultado.reintentarEn,
          });
        }

        return Promise.resolve();
      }),
    },
  });
}

/**
 * Adapta Better Auth al puerto `SessionReader`, para que la capa de aplicacion
 * reciba la identidad como datos planos y no como un objeto del framework.
 */
export function createSessionReader(auth: Auth): SessionReader {
  return {
    async getUser(headers: Headers) {
      const session = await auth.api.getSession({ headers });
      if (!session) return null;

      return {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      };
    },
  };
}
