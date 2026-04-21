-- CreateIndex
CREATE INDEX "bitacora_usuarioId_createdAt_idx" ON "bitacora"("usuarioId", "createdAt");

-- CreateIndex
CREATE INDEX "notificaciones_userId_leida_createdAt_idx" ON "notificaciones"("userId", "leida", "createdAt");

-- CreateIndex
CREATE INDEX "payments_contractId_periodo_idx" ON "payments"("contractId", "periodo");

-- CreateIndex
CREATE INDEX "payments_contractId_fechaPago_idx" ON "payments"("contractId", "fechaPago");

-- CreateIndex
CREATE INDEX "payments_fechaPago_idx" ON "payments"("fechaPago");
