'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, FolderKanban, Table2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar';
import { Skeleton } from '@/components/ui/skeleton';
import { clavesDeLaAplicacion, obtenerManifiesto } from '@/lib/api/aplicacion';

/**
 * Navegacion del panel, con dos contextos.
 *
 * Fuera de una aplicacion generada muestra el unico destino del panel. Dentro,
 * muestra **los modulos de esa aplicacion**, leidos del manifiesto: los decidio
 * el Excel de otra persona, asi que no se pueden escribir aqui.
 *
 * Siguen siendo dos niveles como maximo, que es el limite de
 * `navigation-responsive.md`. El tratamiento activo solido va solo al destino
 * seleccionado.
 */
const DENTRO_DE_UNA_APP = /^\/proyectos\/([^/]+)\/app(?:\/([^/?]+))?/;

export function AppSidebar(): React.ReactElement {
  const ruta = usePathname();
  const dentro = DENTRO_DE_UNA_APP.exec(ruta);
  const proyectoId = dentro?.[1] ?? null;
  const moduloActual = dentro?.[2] ?? null;

  const manifiesto = useQuery({
    queryKey: clavesDeLaAplicacion.manifiesto(proyectoId ?? ''),
    queryFn: ({ signal }) => obtenerManifiesto(proyectoId!, signal),
    enabled: proyectoId !== null,
    // La estructura de una aplicacion creada ya no cambia: no hace falta
    // volver a pedirla en toda la sesion.
    staleTime: Infinity,
  });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="h-14 justify-center px-4">
        <Link className="truncate text-sm font-semibold tracking-tight" href="/proyectos">
          {proyectoId && manifiesto.data ? manifiesto.data.applicationName : 'excel-to-software'}
        </Link>
      </SidebarHeader>

      {/*
        `nav` explicito: shadcn monta la barra con `div`, asi que sin esto no hay
        punto de referencia de navegacion y quien usa lector de pantalla no
        puede saltar a los destinos. El checklist lo pide, y lo descubrio la
        primera prueba de navegador al no encontrar el rol.
      */}
      <SidebarContent aria-label="Navegacion" role="navigation">
        {proyectoId ? (
          <>
            <SidebarGroup>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild tooltip="Volver a Proyectos">
                      <Link href="/proyectos">
                        <ArrowLeft aria-hidden />
                        <span>Proyectos</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Modulos</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {manifiesto.isPending
                    ? [0, 1, 2].map((i) => (
                        <SidebarMenuItem key={i}>
                          <Skeleton className="h-8 w-full" />
                        </SidebarMenuItem>
                      ))
                    : (manifiesto.data?.navigation ?? []).map((modulo) => (
                        <SidebarMenuItem key={modulo.name}>
                          <SidebarMenuButton
                            asChild
                            isActive={modulo.name === moduloActual}
                            tooltip={modulo.label}
                          >
                            <Link href={`/proyectos/${proyectoId}/app/${modulo.name}`}>
                              <Table2 aria-hidden />
                              <span>{modulo.label}</span>
                            </Link>
                          </SidebarMenuButton>
                        </SidebarMenuItem>
                      ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={ruta === '/proyectos' || ruta.startsWith('/proyectos/')}
                    tooltip="Proyectos"
                  >
                    <Link href="/proyectos">
                      <FolderKanban aria-hidden />
                      <span>Proyectos</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
