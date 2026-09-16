'use client';

import { LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { signOut, useSession } from '@/lib/auth/client';

/** Dos letras a partir del nombre, o del correo si no hay nombre. */
function iniciales(nombre: string | undefined, correo: string): string {
  const fuente = nombre?.trim() || correo;
  const partes = fuente.split(/[\s@._-]+/).filter(Boolean);
  return (partes[0]?.[0] ?? '?').concat(partes[1]?.[0] ?? '').toUpperCase();
}

/**
 * Menu de cuenta.
 *
 * El nombre completo vive dentro del menu y no en la cabecera: un correo largo
 * desplazaria los controles de al lado, y `navigation-responsive.md` pide
 * precisamente no mostrarlo cuando el menu puede darlo.
 */
export function AccountMenu(): React.ReactElement | null {
  const router = useRouter();
  const { data, isPending } = useSession();
  const [saliendo, setSaliendo] = useState(false);

  if (isPending) return <div className="bg-muted size-11 animate-pulse rounded-full" />;
  if (!data) return null;

  const { name, email } = data.user;

  async function salir(): Promise<void> {
    setSaliendo(true);
    // Invalida la sesion en el servidor; la cookie se limpia en la respuesta.
    await signOut();
    // La cache de consultas muere con el arbol al recargar la ruta: asi no
    // queda en memoria nada de la persona que acaba de salir.
    router.replace('/entrar');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button className="size-11 rounded-full" size="icon" variant="ghost">
          {/* Las iniciales son decoracion: sin esto el nombre accesible
              del boton seria "AD Abrir el menu de tu cuenta". */}
          <Avatar aria-hidden className="size-8">
            <AvatarFallback className="text-xs">{iniciales(name, email)}</AvatarFallback>
          </Avatar>
          <span className="sr-only">Abrir el menu de tu cuenta</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="text-muted-foreground truncate text-xs">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={saliendo} onSelect={() => void salir()}>
          <LogOut aria-hidden className="size-4" />
          {saliendo ? 'Saliendo...' : 'Cerrar sesion'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
