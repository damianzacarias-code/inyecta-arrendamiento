# Disaster Recovery — Inyecta Arrendamiento

> Plan de continuidad operativa. Esto es un manual de incendios:
> léelo cuando todo está bien, úsalo cuando algo se rompe.

**Última revisión:** 2026-04-29
**Owner:** Damián Zacarias

---

## 0. Resumen ejecutivo (30 segundos)

- **Respaldo:** automático diario a las 03:00 AM, comprimido y cifrado, retenido 30 días.
- **Verificación:** automática mensual (primer domingo del mes), restaura el último respaldo a una BD temporal y valida integridad.
- **Offsite:** copia diaria a un bucket S3 / R2 / Backblaze (ver §5).
- **RTO** (tiempo objetivo de recuperación tras un desastre): **4 horas**.
- **RPO** (cuánta data podemos perder en el peor caso): **24 horas** (un día desde el último respaldo).

Si todo está bien, no necesitas tocar este documento. Si algo se rompe, ve directo a la §3 (procedimientos por incidente).

---

## 1. ¿Qué se respalda?

La base de datos PostgreSQL completa (tablas + datos + índices). Se respalda con `pg_dump --format=custom`, que es el formato que recomienda PostgreSQL para restaurar a otra instancia.

**No se respalda:**
- El código del sistema (ya vive en GitHub).
- Las imágenes de Docker (se reconstruyen del código).
- Los archivos PDFs subidos a `server/uploads/` — **PENDIENTE**: ver §6.

**Lo que SÍ se respalda incluye:**
- Todos los clientes (PFAE/PM con sus actores, RFC, CURP, datos de contacto).
- Todos los contratos firmados, sus cotizaciones origen, sus pagos aplicados.
- Bitácora completa (audit trail PLD/CNBV).
- Usuarios del sistema (empleados Inyecta, con hash de su contraseña).
- Catálogos de tasas, comisiones, presets de riesgo.
- Notificaciones in-app, plantillas, todo lo demás.

---

## 2. ¿Cómo se respalda? (no requiere acción manual)

### 2.1 Cron diario

Un cron en el servidor de producción ejecuta `scripts/backup_db.sh` todos los días a las 03:00 AM UTC.

```cron
0 3 * * * cd /opt/inyecta && \
  BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
  ./scripts/backup_db.sh >> /var/log/inyecta-backup.log 2>&1
```

**Qué hace ese cron:**
1. Lee la URL de la BD desde `server/.env` o el ambiente.
2. Genera el dump comprimido con `pg_dump | gzip -9`.
3. Lo cifra con AES-256 usando la passphrase del archivo `/etc/inyecta/backup.key`.
4. Guarda el archivo en `~/.inyecta-backups/inyecta_<timestamp>.dump.gz.enc`.
5. Borra los respaldos más viejos que 30 días (configurable con `RETENTION_DAYS`).

**El archivo de passphrase es CRÍTICO**: sin él los respaldos no se pueden restaurar. Guarda una copia en 1Password o equivalente, separado del servidor.

```bash
# Generar passphrase nueva (solo se hace UNA vez al setup inicial):
openssl rand -base64 48 > /etc/inyecta/backup.key
chmod 600 /etc/inyecta/backup.key
```

### 2.2 Cron mensual de verificación

Otro cron corre `scripts/verify_backup.sh` el primer domingo del mes a las 04:00 AM:

```cron
0 4 1-7 * 0 cd /opt/inyecta && \
  BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
  ./scripts/verify_backup.sh >> /var/log/inyecta-verify.log 2>&1
```

**Qué hace:**
1. Toma el respaldo más reciente.
2. Crea una BD temporal en el mismo servidor (`inyecta_verify_<timestamp>`).
3. Restaura el respaldo ahí.
4. Corre 8 sanity checks (tablas presentes, conteos > 0, al menos un ADMIN activo, integridad referencial de pagos).
5. Borra la BD temporal.
6. Sale con código `0` si todo OK, código `!= 0` si algo falla.

**Configura una alerta** que mande email a Damián cuando el log contenga "ERROR" o cuando el cron falle. Sin la alerta, este check no sirve de nada.

---

## 3. Procedimientos por tipo de incidente

### 3.1 La BD de Neon se cayó pero no perdió datos

**Síntoma:** los endpoints regresan errores 503, el log muestra "Can't reach database server".

**Acción:** ninguna inmediata. Neon resuelve cortes en minutos. Si excede 30 minutos:
1. Entra a la consola de Neon → status del proyecto.
2. Si Neon reporta incidente → espera y monitorea.
3. Si Neon dice OK → revisa que la URL de la BD en Render env vars siga apuntando al endpoint correcto.

### 3.2 Alguien borró datos accidentalmente

**Ejemplo:** un ADMIN ejecutó por error un DELETE masivo, o una migración nueva borró una columna que tenía datos.

**Acción:**
1. **NO hagas nada destructivo más.** Detén la app si hay riesgo de empeorarlo (`docker compose stop server` o pausa el servicio en Render).
2. Identifica el último respaldo "bueno" (anterior al desastre):
   ```bash
   ls -lt ~/.inyecta-backups/
   ```
3. Restaura ese respaldo a una BD temporal:
   ```bash
   # Crea una BD temporal vacía en Neon (desde la consola web).
   # Cópiate el URL de esa BD temporal.

   DATABASE_URL='postgresql://...temporal...' \
     BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
     ./scripts/restore_db.sh ~/.inyecta-backups/inyecta_<timestamp>.dump.gz.enc
   ```
4. Compara la BD temporal vs la BD productiva. Identifica qué se perdió.
5. **Decide entre dos caminos:**
   - **A) Restaurar todo:** apunta el sistema a la BD temporal, descarta la BD rota. Pierdes la actividad entre el respaldo y el desastre (hasta 24h).
   - **B) Restaurar selectivamente:** copia solo las tablas/filas afectadas desde la BD temporal a la productiva con SQL. Más complejo pero conserva todo lo nuevo.
6. **Antes de cualquier acción destructiva:** toma un dump manual de la BD productiva tal como está ahora (`./scripts/backup_db.sh`), por si el plan de recuperación tampoco funciona.

### 3.3 Neon perdió datos del lado del proveedor

**Síntoma:** Neon restauró desde su propio backup y encontraste que faltan días enteros de actividad.

**Acción:** mismo procedimiento que 3.2, pero el respaldo "bueno" lo eliges para tener el corte más reciente posible antes del incidente reportado por Neon.

### 3.4 Alguien comprometió el servidor

**Síntoma:** logs raros, alertas de seguridad activas, sospecha de exfiltración de datos.

**Acción:**
1. **Aísla:** `docker compose down` o pausa el servicio en Render. Cierra acceso público.
2. **Cambia las llaves de TODO:**
   - JWT_SECRET (todos los tokens emitidos quedan inválidos automáticamente).
   - DATABASE_URL (rota credenciales en Neon).
   - BACKUP_PASSPHRASE (genera nueva, re-encripta los respaldos pendientes).
   - UPLOAD_MASTER_KEY (genera nueva).
   - Credenciales de Render y Vercel.
   - GitHub Personal Access Token.
3. **Forza logout de todos los usuarios:**
   ```sql
   UPDATE users SET "passwordChangedAt" = NOW();
   ```
   Esto invalida todos los JWT vivos (barrera 3 de S4).
4. **Resetea contraseñas:** marca a todos los usuarios con `mustChangePassword = true`.
5. **Auditoría:** revisa la tabla `bitacora` por actividad anómala (logins fuera de horario, IPs raras, ediciones masivas) en las últimas 30 días.
6. **Reporta a CNBV / CONDUSEF** según el procedimiento PLD si hubo exposición de datos de cliente.

### 3.5 Ransomware en el servidor de producción

**Síntoma:** el servidor está cifrado, alguien pide rescate.

**Acción:**
1. **NO pagues.** No hay garantía de recuperación y financias al atacante.
2. **NO arranques nada del servidor comprometido.** Apaga la VM completa.
3. **Levanta servidor nuevo desde cero:**
   - Despliega en una VM/Render service nuevo desde el código de GitHub.
   - Restaura la BD desde el último respaldo offsite (NO el local — puede estar comprometido).
   - Genera todas las llaves nuevas (§3.4 punto 2).
4. **Reporta a las autoridades** (Policía Cibernética, FGR Unidad de Cibernética).

---

## 4. Cómo restaurar manualmente (en una emergencia)

Lee esto antes de ejecutar. Hazlo despacio. Cada paso es reversible HASTA el momento en que ejecutas el `restore_db.sh` apuntando a la BD productiva.

### Paso 1: Identifica el respaldo a restaurar

```bash
ls -lt ~/.inyecta-backups/
```

Por defecto los respaldos se llaman `inyecta_YYYY-MM-DD_HH-MM-SS.dump.gz.enc`.

### Paso 2: Asegura la passphrase

```bash
# Verifica que tengas el archivo:
ls -la /etc/inyecta/backup.key

# Si NO lo tienes en el servidor pero sí en 1Password:
openssl rand -base64 48 > /tmp/backup.key.tmp  # ejemplo, pega tu passphrase real aquí
mv /tmp/backup.key.tmp /etc/inyecta/backup.key
chmod 600 /etc/inyecta/backup.key
```

### Paso 3: Decide a qué BD restaurar

**OPCIÓN A — BD temporal (recomendado):** crea una BD nueva vacía en Neon (consola web) y copia su connection string. Esto te permite verificar antes de tocar producción.

**OPCIÓN B — directo a producción:** SOLO si ya verificaste el dump y aceptas perder lo que esté en la BD actual. Es destructivo.

### Paso 4: Restaura

```bash
# Usa el URL de la BD destino (temporal o productiva)
DATABASE_URL='postgresql://USER:PASS@HOST/DB?sslmode=require' \
  BACKUP_PASSPHRASE_FILE=/etc/inyecta/backup.key \
  ./scripts/restore_db.sh ~/.inyecta-backups/inyecta_<el-que-elegiste>.dump.gz.enc
```

El script te va a pedir confirmación escribiendo "RESTAURAR". Si vas en automático sin tty (cron), exporta `NONINTERACTIVE=1` para saltar la confirmación.

### Paso 5: Verifica

```bash
# Conéctate a la BD restaurada y revisa:
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM contracts WHERE estatus='ACTIVO';"
psql "$DATABASE_URL" -c "SELECT MAX(\"createdAt\") FROM payments;"
psql "$DATABASE_URL" -c "SELECT email, rol FROM users WHERE activo=true;"
```

Confirma que los números son razonables. Si son 0 o muy bajos, restauraste el dump equivocado.

### Paso 6: Si era una BD temporal, apunta el sistema a ella

En Render: edita la variable `DATABASE_URL` del servicio para apuntar a la BD temporal. El servicio se reinicia automáticamente.

---

## 5. Backup offsite (PENDIENTE — instala antes de operaciones reales)

El cron actual deja los respaldos en el mismo servidor. Si el servidor se cae, también se pierden los respaldos.

**Solución:** copia diaria a un bucket externo. Tres opciones de costo bajo:

### Opción A: AWS S3 (Glacier Instant Retrieval)
~$0.004 USD por GB / mes. Para 10 GB de respaldos: $0.04/mes. Necesitas cuenta AWS.

### Opción B: Cloudflare R2
~$0.015 USD por GB / mes pero **0 costo de egreso** (descargar es gratis). Para 10 GB: $0.15/mes.

### Opción C: Backblaze B2
~$0.005 USD por GB / mes. Más barato que S3 si descargas seguido.

**Cron sugerido (después del backup local):**

```cron
30 3 * * * aws s3 sync ~/.inyecta-backups/ s3://inyecta-backups/ \
            --delete-excluded \
            --storage-class GLACIER_IR \
            >> /var/log/inyecta-offsite.log 2>&1
```

**TODO Damián:** elige proveedor, abre cuenta, instala el cron. Mientras esto no esté hecho, estamos en el "happy path" sin protección contra desastre del servidor.

---

## 6. Backup de archivos PDF (PENDIENTE)

`server/uploads/` contiene los PDFs de identificaciones, comprobantes, actas, expedientes. Hoy NO se respaldan.

**Por qué importa:** si el servidor se incendia, los datos de la BD se recuperan, pero los PDFs no. Sin las identificaciones de clientes, no podemos demostrar conocimiento del cliente (KYC) ante CNBV.

**Solución:** sync diario del directorio `uploads/` a S3/R2 después del backup de BD.

```cron
35 3 * * * tar czf - /opt/inyecta/server/uploads/ \
  | openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt \
                -pass file:/etc/inyecta/backup.key \
  | aws s3 cp - s3://inyecta-uploads/uploads_$(date -u +\%Y\%m\%d).tar.gz.enc \
  >> /var/log/inyecta-uploads-backup.log 2>&1
```

**TODO Damián:** instala este cron junto con §5.

---

## 7. RTO / RPO objetivos

| Métrica | Objetivo | Cómo se logra |
|---|---|---|
| **RTO** (tiempo de recuperación) | 4 horas | Restaurar dump más reciente a BD nueva, redeploy del backend, verificar smoke. |
| **RPO** (data perdida en peor caso) | 24 horas | Backup diario a las 03:00 AM. Para reducir a 1h habría que hacer respaldos cada hora (más costoso, más complejo). |

Para MVP de SOFOM piloto (5-10 clientes), 24h RPO es aceptable. Cuando crezcas a 100+ clientes activos, considera reducir a 4h con backups cada 4 horas.

---

## 8. Checklist de configuración inicial

Si nunca has corrido los respaldos, ejecuta esto UNA vez en el servidor de producción:

- [ ] Generar passphrase: `openssl rand -base64 48 > /etc/inyecta/backup.key && chmod 600 /etc/inyecta/backup.key`
- [ ] Guardar copia de la passphrase en 1Password (carpeta "Inyecta — Disaster Recovery").
- [ ] Instalar cron diario de respaldo (§2.1).
- [ ] Instalar cron mensual de verificación (§2.2).
- [ ] Configurar alerta por email si los logs contienen "ERROR".
- [ ] Setup de offsite (§5) — elegir proveedor, abrir cuenta, instalar cron.
- [ ] Setup de backup de uploads (§6) — instalar cron.
- [ ] Correr `./scripts/backup_db.sh` manualmente para producir el primer respaldo.
- [ ] Correr `./scripts/verify_backup.sh` manualmente para confirmar que el respaldo se puede restaurar.
- [ ] Documentar dónde está la copia de la passphrase y quién más la conoce (mínimo 2 personas).

---

## 9. Pruebas de fuego (calendario)

| Frecuencia | Qué probar | Quién |
|---|---|---|
| **Mensual** | Cron de verify_backup.sh corre y pasa. | Automatizado, alerta a Damián si falla. |
| **Trimestral** | Restaurar el respaldo a una BD temporal y entrar al sistema apuntándolo a ella. Confirmar que login funciona. | Damián (manual, ~30 min). |
| **Anual** | Simular pérdida total: levantar servidor desde cero en otra región, restaurar BD, redeploy. Cronometrar el tiempo total. Validar que cae dentro del RTO de 4 horas. | Damián + Claude (manual, ~4 horas). |

Sin estas pruebas, los respaldos son teatro: nadie sabe si realmente funcionan hasta que los necesitas.

---

## 10. Contactos de emergencia

- **Neon support** (BD): https://neon.tech/docs/introduction/support
- **Render support** (backend): https://render.com/docs/support
- **Vercel support** (frontend): https://vercel.com/help
- **CNBV — Vigilancia SOFOM:** mesa de ayuda institucional.
- **CONDUSEF — Quejas:** 800 999 8080.
- **Policía Cibernética CDMX:** 55 5242 5100 (24/7).

---

**Si lees esto en una emergencia:** respira. La data está respaldada. Los respaldos están verificados. El procedimiento existe. Tómate 5 minutos para leer la sección que aplique antes de teclear cualquier comando destructivo.
