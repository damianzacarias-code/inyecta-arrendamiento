// Polyfill de Buffer para el navegador. @react-pdf/renderer usa el
// global `Buffer` de Node al armar los PDFs; el build de producción
// (Vite/Rolldown en Vercel) NO lo incluye, así que sin esto las
// pantallas que generan PDF truenan con "Buffer is not defined" →
// pantalla blanca. Corre antes de renderizar el árbol (que es donde
// @react-pdf toca Buffer).
import { Buffer } from 'buffer'
const _g = globalThis as unknown as { Buffer?: typeof Buffer }
if (!_g.Buffer) _g.Buffer = Buffer

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
