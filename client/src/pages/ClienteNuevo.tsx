import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { ArrowLeft, Save, Building2, User } from 'lucide-react';

const estados = [
  'Aguascalientes', 'Baja California', 'Baja California Sur', 'Campeche', 'Chiapas',
  'Chihuahua', 'Coahuila', 'Colima', 'CDMX', 'Durango', 'Estado de Mexico',
  'Guanajuato', 'Guerrero', 'Hidalgo', 'Jalisco', 'Michoacan', 'Morelos', 'Nayarit',
  'Nuevo Leon', 'Oaxaca', 'Puebla', 'Queretaro', 'Quintana Roo', 'San Luis Potosi',
  'Sinaloa', 'Sonora', 'Tabasco', 'Tamaulipas', 'Tlaxcala', 'Veracruz', 'Yucatan', 'Zacatecas',
];

export default function ClienteNuevo() {
  const navigate = useNavigate();
  const [tipo, setTipo] = useState<'PFAE' | 'PM'>('PM');
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/clients', { ...form, tipo });
      navigate(`/clientes/${res.data.id}`);
    } catch (err: any) {
      const msg = err.response?.data?.error;
      if (typeof msg === 'string') setError(msg);
      else if (Array.isArray(msg)) setError(msg.map((e: any) => e.message).join(', '));
      else setError('Error al crear cliente');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link to="/clientes" className="text-gray-400 hover:text-gray-600">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo Cliente</h1>
          <p className="text-gray-500 text-sm">Registrar cliente para arrendamiento</p>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tipo */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Tipo de Cliente</h3>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setTipo('PM')}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
                tipo === 'PM' ? 'border-inyecta-600 bg-inyecta-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <Building2 size={24} className={tipo === 'PM' ? 'text-inyecta-600' : 'text-gray-400'} />
              <div className="text-left">
                <div className="font-medium text-gray-900">Persona Moral (PM)</div>
                <div className="text-xs text-gray-500">S.A., S. de R.L., S.P.R., etc.</div>
              </div>
            </button>
            <button
              type="button"
              onClick={() => setTipo('PFAE')}
              className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 transition-colors ${
                tipo === 'PFAE' ? 'border-inyecta-600 bg-inyecta-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <User size={24} className={tipo === 'PFAE' ? 'text-inyecta-600' : 'text-gray-400'} />
              <div className="text-left">
                <div className="font-medium text-gray-900">Persona Fisica (PFAE)</div>
                <div className="text-xs text-gray-500">Persona fisica con actividad empresarial</div>
              </div>
            </button>
          </div>
        </div>

        {/* Identity */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">
            {tipo === 'PM' ? 'Datos de la Empresa' : 'Datos Personales'}
          </h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {tipo === 'PM' ? (
              <>
                <div className="lg:col-span-2">
                  <label className="block text-sm font-medium text-gray-600 mb-1">Razon Social *</label>
                  <input type="text" value={form.razonSocial || ''} onChange={(e) => update('razonSocial', e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Representante Legal</label>
                  <input type="text" value={form.representanteLegal || ''} onChange={(e) => update('representanteLegal', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Nombre(s) *</label>
                  <input type="text" value={form.nombre || ''} onChange={(e) => update('nombre', e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Apellido Paterno *</label>
                  <input type="text" value={form.apellidoPaterno || ''} onChange={(e) => update('apellidoPaterno', e.target.value)} required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">Apellido Materno</label>
                  <input type="text" value={form.apellidoMaterno || ''} onChange={(e) => update('apellidoMaterno', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-1">CURP</label>
                  <input type="text" value={form.curp || ''} onChange={(e) => update('curp', e.target.value.toUpperCase())} maxLength={18}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
                </div>
              </>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">RFC</label>
              <input type="text" value={form.rfc || ''} onChange={(e) => update('rfc', e.target.value.toUpperCase())} maxLength={13}
                placeholder={tipo === 'PM' ? 'ABC123456XY0' : 'GARC850101AB1'}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email</label>
              <input type="email" value={form.email || ''} onChange={(e) => update('email', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Telefono</label>
              <input type="tel" value={form.telefono || ''} onChange={(e) => update('telefono', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Sector</label>
              <input type="text" value={form.sector || ''} onChange={(e) => update('sector', e.target.value)} placeholder="Transporte, Construccion, etc."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Actividad Economica</label>
              <input type="text" value={form.actividadEconomica || ''} onChange={(e) => update('actividadEconomica', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Domicilio Fiscal */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Domicilio Fiscal</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Calle</label>
              <input type="text" value={form.calle || ''} onChange={(e) => update('calle', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">No. Ext</label>
                <input type="text" value={form.numExterior || ''} onChange={(e) => update('numExterior', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">No. Int</label>
                <input type="text" value={form.numInterior || ''} onChange={(e) => update('numInterior', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Colonia</label>
              <input type="text" value={form.colonia || ''} onChange={(e) => update('colonia', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Municipio / Delegacion</label>
              <input type="text" value={form.municipio || ''} onChange={(e) => update('municipio', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Ciudad</label>
              <input type="text" value={form.ciudad || ''} onChange={(e) => update('ciudad', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Estado</label>
              <select value={form.estado || ''} onChange={(e) => update('estado', e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none">
                <option value="">Seleccionar...</option>
                {estados.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">C.P.</label>
              <input type="text" value={form.cp || ''} onChange={(e) => update('cp', e.target.value)} maxLength={5}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-inyecta-500 focus:border-inyecta-500 outline-none" />
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={saving}
          className="w-full bg-inyecta-700 hover:bg-inyecta-800 disabled:bg-inyecta-400 text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
        >
          {saving ? (
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
          ) : (
            <><Save size={16} /> Registrar Cliente</>
          )}
        </button>
      </form>
    </div>
  );
}
