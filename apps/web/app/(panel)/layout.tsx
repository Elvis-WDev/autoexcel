import { AppHeader } from '@/components/app/app-header';
import { AppSidebar } from '@/components/app/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';

/**
 * El armazon.
 *
 * Todo lo que hay detras de una sesion cuelga de aqui. El guardia de rutas vive
 * en `middleware.ts` y solo mira si la cookie existe; la autoridad sigue siendo
 * el backend, y el interceptor de `401` que vive en las caches de
 * TanStack Query es quien reacciona cuando el backend dice que no.
 */
export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <SidebarProvider>
      <AppSidebar />
      {/*
        `min-w-0` en los dos niveles, y no es cosmetico: un hijo flexible no
        encoge por debajo del ancho de su contenido a menos que se le diga. Sin
        esto, una tabla ancha empuja el panel entero y a 320px la pagina
        desborda 70px hacia la derecha —contenido inalcanzable en un movil—,
        aunque la tabla ya tenga su propio scroll horizontal.
      */}
      <SidebarInset className="min-w-0">
        <AppHeader />
        <div className="min-w-0 flex-1 px-4 py-6 md:px-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
