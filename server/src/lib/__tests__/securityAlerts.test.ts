/**
 * securityAlerts.test.ts — Tests unitarios del módulo de alertas
 * (CLAUDE.md §10 — Hardening S3).
 *
 * Mockean `notificarPorRol` para verificar:
 *   • Cada handler dispara la notificación con el shape correcto.
 *   • Cooldown evita alertas repetidas dentro de la ventana.
 *   • Burst detector dispara LOGIN_BURST tras N fallos en M segundos.
 *   • Filtros: rolAnterior===rolNuevo no dispara, actor===target en
 *     reset no dispara, etc.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// vi.mock se hoistea por vitest — el mock-fn debe vivir en vi.hoisted
// para evitar TDZ con el factory.
const { notificarPorRolMock } = vi.hoisted(() => ({
  notificarPorRolMock: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('../notificar', () => ({
  notificarPorRol: notificarPorRolMock,
}));

import {
  onLoginFailed,
  onLoginRateLimited,
  onPasswordChanged,
  onPasswordResetByAdmin,
  onUserCreated,
  onUserRoleChanged,
  onUserDeactivated,
  onUserActivated,
  _resetSecurityAlertsState,
  _snapshotBurstBuffer,
} from '../securityAlerts';

beforeEach(() => {
  notificarPorRolMock.mockClear();
  _resetSecurityAlertsState();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('onLoginFailed', () => {
  it('dispara LOGIN_FAILED con tipo SECURITY_LOGIN_FAILED', async () => {
    await onLoginFailed({ ip: '1.2.3.4', emailIntentado: 'x@y.com' });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    const [roles, payload] = notificarPorRolMock.mock.calls[0];
    expect(roles).toEqual(['ADMIN']);
    expect(payload.tipo).toBe('SECURITY_LOGIN_FAILED');
    expect(payload.mensaje).toContain('1.2.3.4');
    expect(payload.url).toBe('/admin/bitacora');
  });

  it('respeta cooldown por IP — 2do fallo desde la misma IP no re-alerta', async () => {
    await onLoginFailed({ ip: '1.2.3.4' });
    await onLoginFailed({ ip: '1.2.3.4' });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
  });

  it('IPs distintas SÍ generan alertas separadas', async () => {
    await onLoginFailed({ ip: '1.1.1.1' });
    await onLoginFailed({ ip: '2.2.2.2' });
    expect(notificarPorRolMock).toHaveBeenCalledTimes(2);
  });

  it('alimenta el burst buffer', async () => {
    await onLoginFailed({ ip: '1.1.1.1' });
    expect(_snapshotBurstBuffer().length).toBe(1);
  });

  it('dispara LOGIN_BURST cuando se acumulan 20+ fallos en la ventana', async () => {
    // 20 IPs distintas para no chocar con cooldown de LOGIN_FAILED.
    for (let i = 0; i < 20; i++) {
      await onLoginFailed({ ip: `10.0.0.${i}` });
    }
    // Una alerta por IP (20) + 1 LOGIN_BURST = 21.
    expect(notificarPorRolMock).toHaveBeenCalledTimes(21);
    const burst = notificarPorRolMock.mock.calls.find(
      ([, p]) => p.tipo === 'SECURITY_LOGIN_BURST',
    );
    expect(burst).toBeDefined();
    expect(burst![1].mensaje).toMatch(/\d+ intentos/);
  });
});

describe('onLoginRateLimited', () => {
  it('dispara LOGIN_RATE_LIMITED', async () => {
    await onLoginRateLimited({ ip: '5.5.5.5' });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].tipo).toBe('SECURITY_LOGIN_RATE_LIMITED');
  });

  it('cooldown por IP', async () => {
    await onLoginRateLimited({ ip: '5.5.5.5' });
    await onLoginRateLimited({ ip: '5.5.5.5' });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
  });
});

describe('onPasswordChanged', () => {
  it('dispara PASSWORD_CHANGED con email del usuario', async () => {
    await onPasswordChanged({ userId: 'u1', email: 'damian@inyecta.com' });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].tipo).toBe('SECURITY_PASSWORD_CHANGED');
    expect(notificarPorRolMock.mock.calls[0][1].mensaje).toContain('damian@inyecta.com');
  });
});

describe('onPasswordResetByAdmin', () => {
  it('dispara PASSWORD_RESET_BY_ADMIN cuando actor != target', async () => {
    await onPasswordResetByAdmin({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 't', targetEmail: 'user@x.com',
    });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].tipo).toBe('SECURITY_PASSWORD_RESET_BY_ADMIN');
  });

  it('NO dispara si actor === target (es PASSWORD_CHANGED)', async () => {
    await onPasswordResetByAdmin({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 'a', targetEmail: 'admin@x.com',
    });
    expect(notificarPorRolMock).not.toHaveBeenCalled();
  });
});

describe('onUserRoleChanged', () => {
  it('dispara con before/after en el mensaje', async () => {
    await onUserRoleChanged({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 't', targetEmail: 'user@x.com',
      rolAnterior: 'ANALISTA', rolNuevo: 'COBRANZA',
    });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    const msg = notificarPorRolMock.mock.calls[0][1].mensaje;
    expect(msg).toContain('ANALISTA');
    expect(msg).toContain('COBRANZA');
  });

  it('NO dispara si rolAnterior === rolNuevo', async () => {
    await onUserRoleChanged({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 't', targetEmail: 'user@x.com',
      rolAnterior: 'ANALISTA', rolNuevo: 'ANALISTA',
    });
    expect(notificarPorRolMock).not.toHaveBeenCalled();
  });
});

describe('onUserDeactivated / onUserActivated', () => {
  it('USER_DEACTIVATED dispara una vez', async () => {
    await onUserDeactivated({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 't', targetEmail: 'user@x.com',
    });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].tipo).toBe('SECURITY_USER_DEACTIVATED');
  });

  it('USER_ACTIVATED dispara una vez', async () => {
    await onUserActivated({
      actorId: 'a', actorEmail: 'admin@x.com',
      targetId: 't', targetEmail: 'user@x.com',
    });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].tipo).toBe('SECURITY_USER_ACTIVATED');
  });
});

describe('onUserCreated', () => {
  it('dispara con rol del nuevo usuario en el mensaje', async () => {
    await onUserCreated({
      actorId: 'a', actorEmail: 'admin@x.com',
      newUserId: 'n', newUserEmail: 'nuevo@x.com',
      rol: 'COBRANZA',
    });
    expect(notificarPorRolMock).toHaveBeenCalledOnce();
    expect(notificarPorRolMock.mock.calls[0][1].mensaje).toContain('COBRANZA');
  });
});

describe('robustez', () => {
  it('si notificarPorRol revierte rechazo, el helper NO propaga', async () => {
    notificarPorRolMock.mockRejectedValueOnce(new Error('boom'));
    await expect(
      onPasswordChanged({ userId: 'u', email: 'a@b.com' }),
    ).resolves.toBeUndefined();
  });
});
