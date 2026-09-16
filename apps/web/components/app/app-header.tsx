'use client';

import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { AccountMenu } from './account-menu';
import { ThemeToggle } from './theme-toggle';

/**
 * Cabecera del panel.
 *
 * Compacta y estable: el control de la barra lateral, el contexto de la
 * pagina, el tema y la cuenta. Nada mas, y en ese orden en todas las pantallas.
 *
 * El titulo de la pagina lo pone cada pantalla y no se repite aqui: duplicarlo
 * es lo primero que prohibe `navigation-responsive.md`.
 */
export function AppHeader({ children }: { children?: React.ReactNode }): React.ReactElement {
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator className="mr-1 h-4" orientation="vertical" />
      <div className="min-w-0 flex-1 truncate text-sm font-medium">{children}</div>
      <ThemeToggle />
      <AccountMenu />
    </header>
  );
}
