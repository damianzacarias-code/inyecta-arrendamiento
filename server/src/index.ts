import express from 'express';
import cors from 'cors';
import path from 'path';
import { config } from './config/env';
import authRoutes from './routes/auth';
import catalogRoutes from './routes/catalogs';
import quotationRoutes from './routes/quotations';
import clientRoutes from './routes/clients';
import contractRoutes from './routes/contracts';
import cobranzaRoutes from './routes/cobranza';
import insuranceRoutes from './routes/insurance';
import gpsRoutes from './routes/gps';
import documentsRoutes from './routes/documents';
import circuloCreditoRoutes from './routes/circuloCredito';
import reportsRoutes from './routes/reports';
import contractDocumentsRoutes from './routes/contractDocuments';
import invoicesRoutes from './routes/invoices';
import portalRoutes from './routes/portal';
import conciliationRoutes from './routes/conciliation';
import searchRoutes from './routes/search';

const app = express();

// Middleware
app.use(cors({ origin: ['http://localhost:5173', 'http://localhost:3000'], credentials: true }));
app.use(express.json({ limit: '10mb' }));

// Servir archivos subidos (PDFs, imágenes de documentos)
app.use('/uploads', express.static(path.resolve(__dirname, '..', 'uploads')));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/catalogs', catalogRoutes);
app.use('/api/quotations', quotationRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/contracts', contractRoutes);
app.use('/api/cobranza', cobranzaRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/gps', gpsRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/circulo-credito', circuloCreditoRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/contract-documents', contractDocumentsRoutes);
app.use('/api/invoices', invoicesRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/conciliation', conciliationRoutes);
app.use('/api/search', searchRoutes);

// Start
app.listen(config.port, () => {
  console.log(`🏢 Inyecta Arrendamiento API running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
});

export default app;
