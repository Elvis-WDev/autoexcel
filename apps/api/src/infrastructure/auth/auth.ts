import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { SessionReader } from '../../application/ports/session.js';
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
