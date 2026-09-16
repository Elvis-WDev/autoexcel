'use client';

import { ThemeProvider as NextThemes } from 'next-themes';

/**
 * Tema claro y oscuro.
 *
 * `attribute="class"` porque la paleta cuelga de `.dark` en `globals.css`.
 * `enableSystem` respeta la preferencia del sistema mientras no haya una
 * eleccion explicita, que es lo que pide `navigation-responsive.md`.
 *
 * El destello de tema equivocado lo evita el script que `next-themes` inyecta
 * antes de pintar, junto con `suppressHydrationWarning` en `<html>`.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <NextThemes attribute="class" defaultTheme="system" disableTransitionOnChange enableSystem>
      {children}
    </NextThemes>
  );
}
