/**
 * Placeholder para rutas del sidebar que todavía no tienen página propia.
 * Permite que la navegación jerárquica esté 100% funcional sin 404.
 */
import { useLocation } from 'react-router-dom';
import { Hammer } from 'lucide-react';

interface Props {
  titulo?: string;
}

export default function EnConstruccion({ titulo }: Props) {
  const { pathname } = useLocation();
  const nombre =
    titulo ??
    pathname
      .split('/')
      .filter(Boolean)
      .map(s => s.charAt(0).toUpperCase() + s.slice(1))
      .join(' / ');

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '40px auto',
        padding: 32,
        border: '1px dashed #d1d5db',
        borderRadius: 8,
        background: '#fafafa',
        textAlign: 'center',
        fontFamily: "'Roboto', sans-serif",
      }}
    >
      <div style={{ display: 'inline-flex', background: '#FFF4EC', padding: 14, borderRadius: '50%', marginBottom: 12 }}>
        <Hammer size={24} color="#FF6600" />
      </div>
      <h2 style={{ fontSize: 18, fontWeight: 700, color: '#112239', marginBottom: 6 }}>
        {nombre}
      </h2>
      <p style={{ fontSize: 13, color: '#666', margin: 0 }}>
        Este módulo está en construcción. La ruta ya está registrada en el sidebar;
        la funcionalidad se habilitará en próximas iteraciones.
      </p>
      <p style={{ fontSize: 11, color: '#999', marginTop: 14, fontFamily: 'monospace' }}>
        {pathname}
      </p>
    </div>
  );
}
