-- Siembra idempotente de las 7 categorías de activos.
--
-- Motivo: en producción el dropdown "Categoría del Bien" del cotizador
-- salía vacío porque `prisma migrate deploy` aplica migraciones pero NO
-- corre `src/seed.ts` (donde vivían las categorías). Esta migración las
-- mete como datos versionados, así cada deploy las garantiza en cualquier
-- BD. Mismo patrón que la migración de Catalog/RiskPreset (H4).
--
-- ON CONFLICT (nombre) DO NOTHING → idempotente: si ya existen (BD local
-- sembrada por seed.ts, o un re-deploy), no duplica ni pisa.
-- Ids deterministas (seed_cat_NN) para no depender de extensiones de UUID.

INSERT INTO "asset_categories" ("id", "nombre", "descripcion", "tipoSeguro", "requiereGPS", "activo", "orden", "createdAt")
VALUES
  ('seed_cat_01', 'Vehículos y Transporte',
   'Utilitarios, Pick-ups, SUVs, Camionetas de Carga, Chasis-Cabina, Camiones Ligeros, Remolques, Van de Transporte, Food Trucks, Tractocamiones, Cajas Secas y Plataformas',
   'Seguro Amplio (Full Coverage): Daños materiales, robo total y responsabilidad civil. Endoso preferente irrevocable a favor de Inyecta.',
   true, true, 1, now()),
  ('seed_cat_02', 'Maquinaria Ligera, Logística y Construcción',
   'Mini-Excavadoras, Generadores de Electricidad, Compresores de Aire Industriales, Torres de Iluminación Móviles, Plataformas de Elevación, Montacargas, Minicargadores',
   'Seguro de Todo Riesgo (All Risk): Cubre daños por operación, colisión, robo e incendio. Cobertura adicional de Responsabilidad Civil.',
   true, true, 2, now()),
  ('seed_cat_03', 'Maquinaria Amarilla y Equipo Pesado Ligero',
   'Retroexcavadoras, Motoniveladoras, Compactadoras, Rodillos Vibratorios, Motoconformadoras, Grúas Pequeñas, Equipos de Perforación Ligeros',
   'Seguro de Todo Riesgo (All Risk): Cubre daños en operación, vuelco, colisión, robo e incendio. Responsabilidad Civil frente a terceros.',
   true, true, 3, now()),
  ('seed_cat_04', 'Equipo Médico y de Especialidad',
   'Equipo de Diagnóstico (Rayos X, Digitalizadores), Equipo de Laboratorio, Equipo de Estética y Dermatología, Autoclaves y Esterilizadores, Ultrasonidos, Silla de dentista, Equipo de tomografía',
   'Seguro de Equipo Fijo y Electrónico: Cobertura por daños internos o fallas inherentes, robo e incendio.',
   false, true, 4, now()),
  ('seed_cat_05', 'Equipos Comerciales y de Uso General',
   'Equipo de Gimnasio, Plotters e Impresoras de Gran Formato, Paneles Solares, Mobiliario de Oficina, Sistemas de seguridad',
   'Seguro de Maquinaria y Equipo (Todo Riesgo): Para Paneles Solares, debe cubrir riesgos de instalación, daños climáticos y el valor del sistema completo.',
   false, true, 5, now()),
  ('seed_cat_06', 'Carpintería y Metalmecánica Ligera',
   'Sierras Escuadradoras, Enchapadoras de Cantos, Routers CNC, Prensas Plegadoras Hidráulicas, Cizallas Hidráulicas, Máquinas de Corte por Plasma CNC',
   'Seguro de Equipo Fijo y Operación: Cubre daños por incendio, robo y fallas mecánicas. Cobertura de desmontaje y traslado en caso de siniestro total.',
   false, true, 6, now()),
  ('seed_cat_07', 'Equipo de Tecnología',
   'Estaciones de trabajo, Laptops, Monitores, Impresoras multifuncionales, Equipos de red (Routers, Switches), Sistemas de telefonía, IP Proyectores',
   'Seguro de Equipo Electrónico: Cobertura por daños internos, robo e incendio.',
   false, true, 7, now())
ON CONFLICT ("nombre") DO NOTHING;
