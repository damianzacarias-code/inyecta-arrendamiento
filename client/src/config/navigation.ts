/**
 * Configuración del menú lateral — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * Seis secciones planas, como máximo dos niveles de profundidad
 * (Sección → Item). Se eliminaron ocho entradas que apuntaban a
 * `<EnConstruccion>` (CRM, Solicitudes, Administración, etc.) y se
 * unificó el grupo de Estadísticas/Reportes bajo `/reportes/*`.
 *
 * Las rutas legacy (`/estadisticas/*`, `/admin/bitacora`) se mantienen
 * disponibles con redirect desde `App.tsx` para no romper bookmarks.
 */
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Calculator,
  FileText,
  Users,
  User,
  FilePlus,
  FolderOpen,
  Briefcase,
  Shield,
  MapPin,
  CreditCard,
  Banknote,
  Receipt,
  FileBarChart,
  Wallet,
  AlertTriangle,
  TrendingUp,
  Activity,
  ScrollText,
  FileCheck2,
  FileUp,
  Settings,
} from 'lucide-react';

export interface NavSubItem {
  label: string;
  path:  string;
}

export interface NavItem {
  label:     string;
  icon:      LucideIcon;
  path?:     string;        // si no tiene hijos, va directo
  children?: NavSubItem[];
}

export interface NavSection {
  label: string;
  icon:  LucideIcon;
  items: NavItem[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    label: 'Inicio',
    icon:  LayoutDashboard,
    items: [
      { label: 'Dashboard', icon: LayoutDashboard, path: '/' },
    ],
  },
  {
    label: 'Cotizaciones',
    icon:  Calculator,
    items: [
      { label: 'Nueva cotización', icon: FilePlus, path: '/cotizador'    },
      { label: 'Listado',          icon: FileText, path: '/cotizaciones' },
    ],
  },
  {
    label: 'Arrendatarios',
    icon:  Users,
    items: [
      { label: 'Nuevo arrendatario', icon: User,       path: '/clientes/nuevo'  },
      { label: 'Listado',            icon: Users,      path: '/clientes'        },
      { label: 'Documentos',         icon: FolderOpen, path: '/documentos'      },
      { label: 'Círculo de Crédito', icon: Shield,     path: '/circulo-credito' },
    ],
  },
  {
    label: 'Operaciones',
    icon:  Briefcase,
    items: [
      { label: 'Cargar solicitud PDF', icon: FileUp,   path: '/solicitudes/cargar' },
      { label: 'Nueva operación',    icon: FilePlus,  path: '/contratos/nuevo' },
      { label: 'Mesa de registros',  icon: Briefcase, path: '/contratos'       },
      { label: 'Seguros',            icon: Shield,    path: '/seguros'         },
      { label: 'GPS',                icon: MapPin,    path: '/gps'             },
    ],
  },
  {
    label: 'Cobranza',
    icon:  CreditCard,
    items: [
      { label: 'Caja receptora',        icon: CreditCard, path: '/cobranza'      },
      { label: 'Conciliación bancaria', icon: Banknote,   path: '/conciliacion'  },
      { label: 'Facturas',              icon: Receipt,    path: '/facturas'      },
    ],
  },
  {
    label: 'Reportes',
    icon:  FileBarChart,
    items: [
      { label: 'Portafolio vigente',  icon: Wallet,         path: '/reportes/portafolio'      },
      { label: 'Cartera vencida',     icon: AlertTriangle,  path: '/reportes/cartera-vencida' },
      { label: 'Producción mensual',  icon: TrendingUp,     path: '/reportes/produccion'      },
      { label: 'Métricas generales',  icon: Activity,       path: '/reportes/metricas'        },
      { label: 'Reportes operativos', icon: FileBarChart,   path: '/reportes'                 },
      { label: 'Bitácora',            icon: ScrollText,     path: '/reportes/bitacora'        },
      { label: 'Catálogo (admin)',    icon: Settings,       path: '/admin/catalogo'           },
      { label: 'Plantillas (admin)',  icon: FileCheck2,     path: '/admin/templates'          },
    ],
  },
];

/**
 * Retorna la sección + item abiertos por defecto según la ruta actual.
 * Permite que al navegar directo a /cotizador el acordeón se abra
 * en "Cotizaciones → Nueva cotización" automáticamente.
 */
export function findActiveBranch(pathname: string): { section?: string; item?: string } {
  for (const section of NAV_SECTIONS) {
    for (const item of section.items) {
      if (item.path === pathname) {
        return { section: section.label, item: item.label };
      }
      if (item.children?.some(c => pathname === c.path || pathname.startsWith(c.path + '/'))) {
        return { section: section.label, item: item.label };
      }
    }
  }
  return {};
}
