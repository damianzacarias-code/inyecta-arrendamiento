import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/**
 * Resuelve la contraseña inicial del admin.
 *
 * Comportamiento por entorno:
 *   • development / test / staging → permite el default 'admin123'
 *     para no fricciones del primer login local. Si SEED_ADMIN_PASSWORD
 *     está set, se respeta.
 *   • production → exige SEED_ADMIN_PASSWORD (≥12 chars). Si falta o
 *     es trivial, abortamos: NO crear nunca un admin con password
 *     adivinable en producción.
 *
 * Idempotencia: el upsert del admin tiene `update: {}`, así que correr
 * el seed dos veces NO sobrescribe la password. Esta función solo
 * importa para la primera corrida en una BD limpia.
 */
function resolveAdminPassword(): string {
  const env = process.env.NODE_ENV ?? 'development';
  const fromEnv = process.env.SEED_ADMIN_PASSWORD;

  if (env === 'production') {
    if (!fromEnv || fromEnv.length < 12) {
      console.error(
        '❌ En production se requiere SEED_ADMIN_PASSWORD (≥12 caracteres) ' +
          'para crear el usuario admin inicial. Define la variable y vuelve ' +
          'a correr el seed.',
      );
      process.exit(1);
    }
    if (['admin123', 'password', 'changeme', '123456789012'].includes(fromEnv)) {
      console.error(
        '❌ SEED_ADMIN_PASSWORD es una contraseña trivial. ' +
          'Usa una contraseña fuerte y única para el admin inicial.',
      );
      process.exit(1);
    }
    return fromEnv;
  }

  return fromEnv ?? 'admin123';
}

async function seed() {
  console.log('🌱 Seeding database...');

  // Crear usuario admin (idempotente — no sobrescribe password si ya existe)
  const plainPassword = resolveAdminPassword();
  const adminPassword = await bcrypt.hash(plainPassword, 12);
  await prisma.user.upsert({
    where: { email: 'damian@inyecta.com' },
    update: {},
    create: {
      email: 'damian@inyecta.com',
      password: adminPassword,
      nombre: 'Damian',
      apellidos: 'Zacarias',
      rol: 'ADMIN',
    },
  });
  // No imprimimos la contraseña (puede ser real en production).
  console.log('  ✓ Usuario admin asegurado: damian@inyecta.com');
  if ((process.env.NODE_ENV ?? 'development') !== 'production' && plainPassword === 'admin123') {
    console.log('    (password de desarrollo: admin123 — cámbialo desde la UI)');
  }

  // Crear categorías de activos
  const categories = [
    {
      nombre: 'Vehículos y Transporte',
      descripcion: 'Utilitarios, Pick-ups, SUVs, Camionetas de Carga, Chasis-Cabina, Camiones Ligeros, Remolques, Van de Transporte, Food Trucks, Tractocamiones, Cajas Secas y Plataformas',
      tipoSeguro: 'Seguro Amplio (Full Coverage): Daños materiales, robo total y responsabilidad civil. Endoso preferente irrevocable a favor de Inyecta.',
      requiereGPS: true,
      orden: 1,
    },
    {
      nombre: 'Maquinaria Ligera, Logística y Construcción',
      descripcion: 'Mini-Excavadoras, Generadores de Electricidad, Compresores de Aire Industriales, Torres de Iluminación Móviles, Plataformas de Elevación, Montacargas, Minicargadores',
      tipoSeguro: 'Seguro de Todo Riesgo (All Risk): Cubre daños por operación, colisión, robo e incendio. Cobertura adicional de Responsabilidad Civil.',
      requiereGPS: true,
      orden: 2,
    },
    {
      nombre: 'Maquinaria Amarilla y Equipo Pesado Ligero',
      descripcion: 'Retroexcavadoras, Motoniveladoras, Compactadoras, Rodillos Vibratorios, Motoconformadoras, Grúas Pequeñas, Equipos de Perforación Ligeros',
      tipoSeguro: 'Seguro de Todo Riesgo (All Risk): Cubre daños en operación, vuelco, colisión, robo e incendio. Responsabilidad Civil frente a terceros.',
      requiereGPS: true,
      orden: 3,
    },
    {
      nombre: 'Equipo Médico y de Especialidad',
      descripcion: 'Equipo de Diagnóstico (Rayos X, Digitalizadores), Equipo de Laboratorio, Equipo de Estética y Dermatología, Autoclaves y Esterilizadores, Ultrasonidos, Silla de dentista, Equipo de tomografía',
      tipoSeguro: 'Seguro de Equipo Fijo y Electrónico: Cobertura por daños internos o fallas inherentes, robo e incendio.',
      requiereGPS: false,
      orden: 4,
    },
    {
      nombre: 'Equipos Comerciales y de Uso General',
      descripcion: 'Equipo de Gimnasio, Plotters e Impresoras de Gran Formato, Paneles Solares, Mobiliario de Oficina, Sistemas de seguridad',
      tipoSeguro: 'Seguro de Maquinaria y Equipo (Todo Riesgo): Para Paneles Solares, debe cubrir riesgos de instalación, daños climáticos y el valor del sistema completo.',
      requiereGPS: false,
      orden: 5,
    },
    {
      nombre: 'Carpintería y Metalmecánica Ligera',
      descripcion: 'Sierras Escuadradoras, Enchapadoras de Cantos, Routers CNC, Prensas Plegadoras Hidráulicas, Cizallas Hidráulicas, Máquinas de Corte por Plasma CNC',
      tipoSeguro: 'Seguro de Equipo Fijo y Operación: Cubre daños por incendio, robo y fallas mecánicas. Cobertura de desmontaje y traslado en caso de siniestro total.',
      requiereGPS: false,
      orden: 6,
    },
    {
      nombre: 'Equipo de Tecnología',
      descripcion: 'Estaciones de trabajo, Laptops, Monitores, Impresoras multifuncionales, Equipos de red (Routers, Switches), Sistemas de telefonía, IP Proyectores',
      tipoSeguro: 'Seguro de Equipo Electrónico: Cobertura por daños internos, robo e incendio.',
      requiereGPS: false,
      orden: 7,
    },
  ];

  for (const cat of categories) {
    await prisma.assetCategory.upsert({
      where: { nombre: cat.nombre },
      update: cat,
      create: cat,
    });
  }
  console.log('  ✓ 7 categorías de activos creadas');

  console.log('✅ Seed completado');
}

seed()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
