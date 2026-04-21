/**
 * shutdown.ts — Graceful shutdown del proceso.
 *
 * Por qué importa:
 *   - En Kubernetes / ECS / Railway, el orquestador manda SIGTERM y
 *     espera N segundos antes de SIGKILL. Si no cerramos limpiamente,
 *     dejamos requests a medias, conexiones de Prisma colgando, y los
 *     pacientes (clientes) ven 502.
 *   - En `tsx watch` durante desarrollo, también recibimos SIGTERM/SIGINT
 *     cada vez que el proceso reinicia → conviene cerrar Prisma para
 *     que no queden file descriptors abiertos.
 *
 * Plan de cierre:
 *   1. Recibe SIGTERM o SIGINT → marca shuttingDown=true.
 *      Cualquier señal posterior se ignora (idempotente).
 *   2. server.close(callback) → deja de aceptar conexiones nuevas y
 *      espera a que terminen las que están en vuelo. Express keep-alive
 *      puede mantener conexiones idle abiertas; las cerramos con
 *      destroy() pasados 5s (drainTimeoutMs).
 *   3. Cuando server.close() callback dispara → prisma.$disconnect().
 *   4. Si TODO el proceso tarda más de hardTimeoutMs (default 10s),
 *      hard-exit. Mejor 502 momentáneo que un pod zombie.
 *
 * También capturamos uncaughtException y unhandledRejection: loggea y
 * dispara el shutdown. Node los iba a tumbar igual; al menos liberamos
 * Prisma antes de morir.
 */
import type { Server } from 'http';
import type { PrismaClient } from '@prisma/client';
import { logger } from './logger';

interface ShutdownOptions {
  /** ms para esperar que se drenen requests en vuelo antes de force-close. */
  drainTimeoutMs?: number;
  /** ms hard-kill si todo el shutdown se cuelga. */
  hardTimeoutMs?: number;
}

export function installShutdown(
  server: Server,
  prisma: PrismaClient,
  opts: ShutdownOptions = {},
) {
  const drainTimeoutMs = opts.drainTimeoutMs ?? 5_000;
  const hardTimeoutMs = opts.hardTimeoutMs ?? 10_000;

  let shuttingDown = false;

  const shutdown = (signal: string, exitCode = 0) => {
    if (shuttingDown) {
      logger.warn({ signal }, '[shutdown] señal repetida ignorada');
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, '[shutdown] cierre iniciado');

    // Hard-kill timer: si el proceso se cuelga en cualquier paso, salimos.
    const hardKill = setTimeout(() => {
      logger.error({ hardTimeoutMs }, '[shutdown] timeout hard, forzando exit');
      process.exit(1);
    }, hardTimeoutMs);
    // unref() para que este timer NO mantenga el event loop vivo.
    hardKill.unref();

    // Force-close idle keep-alive después de drainTimeoutMs.
    const forceClose = setTimeout(() => {
      logger.warn(
        { drainTimeoutMs },
        '[shutdown] requests no drenadas, forzando cierre de sockets',
      );
      // Node 18+: closeIdleConnections + closeAllConnections.
      const s = server as unknown as {
        closeIdleConnections?: () => void;
        closeAllConnections?: () => void;
      };
      s.closeIdleConnections?.();
      s.closeAllConnections?.();
    }, drainTimeoutMs);
    forceClose.unref();

    server.close(async (err) => {
      clearTimeout(forceClose);
      if (err) {
        logger.error({ err }, '[shutdown] error cerrando HTTP server');
      } else {
        logger.info('[shutdown] HTTP server cerrado');
      }

      try {
        await prisma.$disconnect();
        logger.info('[shutdown] prisma desconectado');
      } catch (e) {
        logger.error({ err: e }, '[shutdown] error desconectando prisma');
      }

      clearTimeout(hardKill);
      logger.info({ exitCode }, '[shutdown] adiós');
      process.exit(exitCode);
    });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT', () => shutdown('SIGINT'));

  // Errores no atrapados — loggea y dispara shutdown con exit 1.
  // No los swallow: el proceso se va a morir, queremos que se vaya
  // limpiamente para no dejar Prisma colgado.
  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, '[shutdown] uncaughtException');
    shutdown('uncaughtException', 1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ err: reason }, '[shutdown] unhandledRejection');
    shutdown('unhandledRejection', 1);
  });
}
