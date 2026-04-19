/**
 * Configuración del menú lateral — Inyecta Arrendamiento
 * ---------------------------------------------------------------
 * Replica la estructura jerárquica del sistema legacy de créditos
 * (Administración / Créditos / Inversionistas) adaptada al contexto
 * de arrendamiento puro y financiero. Tres niveles de profundidad:
 *
 *   Sección (nivel 0)  →  Item (nivel 1)  →  Subitem (nivel 2)
 *
 * Los íconos se referencian por nombre del set lucide-react y se
 * resuelven dinámicamente en el Sidebar para evitar árboles enormes
 * de imports.
 */
import type { LucideIcon } from 'lucide-react';
import {
  Settings,
  BookOpen,
  FileText,
  Calculator,
  Users,
  User,
  Briefcase,
  CreditCard,
  Shield,
  FilePlus,
  BarChart2,
  LayoutDashboard,
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
    label: 'Administración',
    icon:  Settings,
    items: [
      {
        label: 'Catálogos',
        icon:  BookOpen,
        children: [
          { label: 'Tasas de Interés',  path: '/admin/tasas' },
          { label: 'Comisiones',        path: '/admin/comisiones' },
          { label: 'Configuración GPS', path: '/gps' },
        ],
      },
    ],
  },
  {
    label: 'Arrendamiento',
    icon:  FileText,
    items: [
      {
        label: 'Cotizador',
        icon:  Calculator,
        children: [
          { label: 'Nueva Cotización', path: '/cotizador' },
          { label: 'Cotizaciones',     path: '/cotizaciones' },
        ],
      },
      {
        label: 'CRM',
        icon:  Users,
        children: [
          { label: 'Prospectos', path: '/crm' },
          { label: 'Calendario', path: '/crm/calendario' },
        ],
      },
      {
        label: 'Arrendatarios',
        icon:  User,
        children: [
          { label: 'Nuevo Arrendatario', path: '/clientes/nuevo' },
          { label: 'Visor',              path: '/clientes' },
        ],
      },
      {
        label: 'Operaciones',
        icon:  Briefcase,
        children: [
          { label: 'Nueva Operación',    path: '/contratos/nuevo' },
          { label: 'Mesa de Registros',  path: '/contratos' },
          { label: 'Dispersión',         path: '/operaciones/dispersion' },
        ],
      },
      {
        label: 'Cobranza',
        icon:  CreditCard,
        children: [
          { label: 'Caja Receptora', path: '/cobranza' },
          { label: 'Conciliación',   path: '/conciliacion' },
          { label: 'Facturas',       path: '/facturas' },
          { label: 'Moratorios',     path: '/cobranza/moratorios' },
        ],
      },
      {
        label: 'Regulación',
        icon:  Shield,
        children: [
          { label: 'Círculo de Crédito', path: '/circulo-credito' },
          { label: 'Seguros',            path: '/seguros' },
          { label: 'Documentos',         path: '/documentos' },
        ],
      },
      {
        label: 'Solicitudes',
        icon:  FilePlus,
        children: [
          { label: 'Nueva Solicitud',    path: '/solicitudes/nueva' },
          { label: 'Carga Masiva Excel', path: '/solicitudes/excel' },
        ],
      },
      {
        label: 'Estadísticas',
        icon:  BarChart2,
        children: [
          { label: 'Portafolio Vigente', path: '/estadisticas/portafolio' },
          { label: 'Cartera Vencida',    path: '/estadisticas/vencida' },
          { label: 'Producción Mensual', path: '/estadisticas/produccion' },
          { label: 'Métricas Generales', path: '/reportes' },
        ],
      },
    ],
  },
];

/**
 * Retorna la sección + item abiertos por defecto según la ruta actual.
 * Permite que al navegar directo a /cotizador/puro el acordeón se abra
 * en "Arrendamiento → Cotizador" automáticamente.
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
