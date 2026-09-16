'use client';

import { createAuthClient } from 'better-auth/react';

/**
 * Cliente de sesion.
 *
 * `baseURL` vacio a proposito: el navegador habla con este mismo origen y Next
 * reescribe `/api/auth/*` hacia Express. Apuntar aqui al puerto de la API
 * romperia justo la propiedad que se busco en W0 —cookie *same-site*— y
 * obligaria a CORS.
 *
 * La sesion vive en una cookie `HttpOnly`: este cliente nunca la lee ni la
 * guarda, solo provoca que el navegador la mande.
 */
export const authClient = createAuthClient({ basePath: '/api/auth' });

export const { signIn, signOut, useSession } = authClient;
