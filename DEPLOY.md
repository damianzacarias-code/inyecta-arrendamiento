# Deploy de Inyecta Arrendamiento

Esta guía te lleva paso a paso por el deploy a producción usando Vercel
(frontend) + Render (backend) + Neon (Postgres). Costo: $0 USD/mes en
free tier.

> **Importante**: este archivo está pensado para uso interno. NO contiene
> secrets — ésos viven en `/tmp/inyecta-prod-secrets.txt` (local) y en
> los dashboards de cada servicio.

## Antes de empezar

- GitHub: cuenta `damianzacarias-code` con repo `inyecta-arrendamiento` ya creado.
- Local: el código está pusheado al repo (ver paso 0 abajo si no).

## Paso 0 — Push del código a GitHub

```bash
cd /Users/dzs/Desktop/Inyecta/Arrendamiento/sistema
git push -u origin main
```

Si pide autenticación, usa tu SSH key (ya configurada porque el remote
es `git@github.com:...`). Si no tienes SSH key configurada, cambia el
remote a HTTPS y usa un Personal Access Token:

```bash
git remote set-url origin https://github.com/damianzacarias-code/inyecta-arrendamiento.git
git push -u origin main
# Te va a pedir usuario (damianzacarias-code) y password (un PAT, no tu pass de GitHub)
# Genera el PAT en: https://github.com/settings/tokens (con scope `repo`).
```

## Paso 1 — Neon (Postgres)

1. Entra a https://neon.tech, "Sign up with GitHub".
2. "Create Project":
   - Nombre: `inyecta-arrendamiento`
   - Región: **AWS US East (Ohio) — us-east-2** (la más cercana a México con free tier)
   - Postgres version: 16
3. Cuando termine de crear, te muestra una `Connection String` parecida a:
   ```
   postgresql://USER:PASS@ep-xxx-xxx.us-east-2.aws.neon.tech/inyecta?sslmode=require
   ```
4. **Cópiala completa y pásamela** — yo corro las migraciones y el seed.

## Paso 2 — Render (Backend API)

1. Entra a https://render.com, "Sign in with GitHub".
2. New + → "Web Service" → "Build and deploy from a Git repository".
3. Connect el repo `damianzacarias-code/inyecta-arrendamiento`.
4. **Configuración**:
   - Name: `inyecta-arrendamiento-api`
   - Region: **Oregon (US West)** (o la que prefieras — más cerca = mejor latencia)
   - Branch: `main`
   - Root Directory: `server`
   - Build Command:
     ```
     npm ci && npx prisma generate && npm run build
     ```
   - Start Command:
     ```
     node dist/index.js
     ```
   - Plan: **Free**

5. **Antes de "Create Web Service"**, baja a "Environment Variables" y
   pega TODAS las variables de la sección "Variables de entorno" abajo.
   Las que dicen `← TE LAS DOY YO` espera a que te las pase.

6. Click "Create Web Service". Render compila (~5-10 min).

7. Cuando termine, te asigna una URL tipo:
   ```
   https://inyecta-arrendamiento-api.onrender.com
   ```
   **Cópiala y pásamela** — la necesito para configurar Vercel.

## Paso 3 — Vercel (Frontend)

1. Entra a https://vercel.com, "Sign up with GitHub".
2. "Add New" → "Project" → escoge `damianzacarias-code/inyecta-arrendamiento`.
3. **Configuración**:
   - Framework Preset: **Vite** (debería detectarlo solo)
   - Root Directory: `client`
   - Build Command: `npm run build` (default)
   - Output Directory: `dist` (default)
4. Antes de Deploy, expande "Environment Variables" y agrega UNA variable:
   ```
   VITE_API_URL = https://inyecta-arrendamiento-api.onrender.com
   ```
   (la URL exacta que te dio Render en el paso 2.7)
5. Click "Deploy". Vercel compila (~1-2 min).
6. Te asigna URL tipo:
   ```
   https://inyecta-arrendamiento.vercel.app
   ```

## Paso 4 — Cerrar el loop CORS

Una vez que sepas la URL final de Vercel, vuelve al dashboard de Render
y agrega/edita la variable:

```
CORS_ALLOWED_ORIGINS = https://inyecta-arrendamiento.vercel.app
```

Render hará re-deploy automático. ~3 min y queda listo.

## Variables de entorno para Render (paso 2.5)

Pega TODAS estas en el bloque "Environment Variables" de Render:

```
NODE_ENV=production
PORT=3001
LOG_LEVEL=info

# === BD === (la pega Damián desde Neon)
DATABASE_URL=postgresql://USER:PASS@ep-xxx.us-east-2.aws.neon.tech/inyecta?sslmode=require

# === Auth === (← TE LAS DOY YO desde /tmp/inyecta-prod-secrets.txt)
JWT_SECRET=...
JWT_EXPIRES_IN=24h

# === CORS === (se completa en paso 4 cuando sepamos la URL de Vercel)
CORS_ALLOWED_ORIGINS=https://inyecta-arrendamiento.vercel.app

# === Branding del emisor (FSMP) ===
BRAND_RAZON_SOCIAL=FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.
BRAND_NOMBRE_COMERCIAL=Inyecta
BRAND_DIRECCION=Av. Sierra Vista N° 1305, Piso 4 Local 7, Colonia Lomas del Tecnológico, C.P. 78215, San Luis Potosí, S.L.P.
BRAND_TELEFONOS=(444) 521 7204
BRAND_EMAIL=contacto@inyecta.com.mx
BRAND_WEB=https://inyecta.com.mx

# === Banco para pagos ===
BANCO_NOMBRE=Banco Bancrea, S.A.
BANCO_CLABE=122700120000330044
BANCO_BENEFICIARIO=FSMP Soluciones de Capital, S.A. de C.V., SOFOM, E.N.R.

# === CFDI === (mock por ahora, hasta que Damián configure Facturama)
CFDI_PROVIDER=MOCK
CFDI_EMISOR_RFC=FSC181009SP9
CFDI_EMISOR_NOMBRE=FSMP SOLUCIONES DE CAPITAL
CFDI_EMISOR_REGIMEN=601
CFDI_EMISOR_LUGAR_EXPEDICION=78215

# === Email === (NOOP — no envía mails todavía; cambia cuando configures SMTP)
EMAIL_PROVIDER=NOOP
EMAIL_FROM=no-reply@inyecta.com.mx
FRONTEND_BASE_URL=https://inyecta-arrendamiento.vercel.app

# === Cifrado y backups === (← TE LAS DOY YO)
UPLOAD_MASTER_KEY=...
BACKUP_PASSPHRASE=...
BACKUP_ENCRYPT=auto

# === Bitácora ===
BITACORA_LOG_GETS=false
```

## Después del deploy

Te paso:
- URL final
- Credenciales:
  - `damian@inyecta.com / ZSdamian24` (ADMIN)
  - `sergio@inyecta.com / Demo2026#SLP` (ADMIN)

## Cuando se acabe el free tier o necesites upgrade

- **Render Starter**: $7/mes — quita el sleep (cold start de 30-60 seg desaparece).
- **Neon Pro**: $19/mes — autoscale + backups automáticos diarios.
- **Vercel Pro**: $20/mes — sólo si necesitas más bandwidth o team features.
