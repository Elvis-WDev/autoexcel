export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
}

/**
 * Puerto de lectura de sesion. Lo implementa Better Auth en infraestructura; los
 * casos de uso solo reciben la identidad como datos planos, nunca un objeto del
 * framework.
 */
export interface SessionReader {
  getUser(headers: Headers): Promise<AuthenticatedUser | null>;
}
