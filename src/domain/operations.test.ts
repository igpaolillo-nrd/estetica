import { describe, it, expect, vi } from 'vitest';
import { registrarVisita, canjearPremio, deshacerUltimaAccion } from './operations';
import { LedgerRepository } from './ports';
import { Visita, LedgerEntry } from './entities';
import { MontoPuntos } from './value-objects';
import { SaldoInsuficiente } from './errors';

function mockRepository(
  overrides: Partial<LedgerRepository> = {}
): LedgerRepository {
  return {
    registrarVisita: vi.fn(async (visita) => visita),
    canjearPremio: vi.fn(),
    obtenerSaldo: vi.fn(),
    obtenerEntradasDeVisita: vi.fn(),
    obtenerUltimaAccion: vi.fn(),
    guardarReversion: vi.fn(),
    ...overrides,
  };
}

describe('canjearPremio', () => {
  it('lanza SaldoInsuficiente cuando el saldo es menor al costo', async () => {
    const repo = mockRepository({ obtenerSaldo: vi.fn(async () => 5) });

    await expect(
      canjearPremio(repo, {
        clienteId: 'c1',
        premio: { premioId: 'p1', costoPuntos: MontoPuntos.crear(10) },
        createdBy: 'op1',
      })
    ).rejects.toThrow(SaldoInsuficiente);

    expect(repo.canjearPremio).not.toHaveBeenCalled();
  });

  it('persiste un canje cuando el saldo es suficiente', async () => {
    const repo = mockRepository({ obtenerSaldo: vi.fn(async () => 20) });

    await canjearPremio(repo, {
      clienteId: 'c1',
      premio: { premioId: 'p1', costoPuntos: MontoPuntos.crear(10) },
      createdBy: 'op1',
    });

    expect(repo.canjearPremio).toHaveBeenCalledOnce();
    const entrada = vi.mocked(repo.canjearPremio).mock.calls[0][0];
    expect(entrada).toMatchObject({
      clienteId: 'c1',
      tipo: 'redeem',
      premioId: 'p1',
      createdBy: 'op1',
    });
    expect(entrada.montoPuntos.valor).toBe(-10);
  });
});

describe('deshacerUltimaAccion', () => {
  it('sobre una visita genera una reversal por cada earn con signo opuesto y referencia correcta', async () => {
    const entradasEarn: LedgerEntry[] = [
      {
        id: 'e1',
        clienteId: 'c1',
        tipo: 'earn',
        montoPuntos: MontoPuntos.crear(10),
        servicioId: 's1',
        visitaId: 'v1',
        createdBy: 'op1',
      },
      {
        id: 'e2',
        clienteId: 'c1',
        tipo: 'earn',
        montoPuntos: MontoPuntos.crear(25),
        servicioId: 's2',
        visitaId: 'v1',
        createdBy: 'op1',
      },
    ];

    const visita = Visita.crear({
      id: 'v1',
      clienteId: 'c1',
      servicios: [
        { servicioId: 's1', montoPuntos: MontoPuntos.crear(10) },
        { servicioId: 's2', montoPuntos: MontoPuntos.crear(25) },
      ],
      createdBy: 'op1',
    });

    const repo = mockRepository({
      obtenerUltimaAccion: vi.fn(async () => ({
        tipo: 'visita' as const,
        visita,
        entradas: entradasEarn,
      })),
    });

    await deshacerUltimaAccion(repo, { operadorId: 'op1' });

    expect(repo.guardarReversion).toHaveBeenCalledOnce();
    const [visitaRevertida, reversales] = vi.mocked(repo.guardarReversion).mock.calls[0];

    expect(visitaRevertida?.estaRevertida()).toBe(true);
    expect(reversales).toHaveLength(2);

    expect(reversales[0]).toMatchObject({
      clienteId: 'c1',
      tipo: 'reversal',
      servicioId: 's1',
      visitaId: 'v1',
      reversesEntryId: 'e1',
      createdBy: 'op1',
    });
    expect(reversales[0].montoPuntos.valor).toBe(-10);

    expect(reversales[1]).toMatchObject({
      tipo: 'reversal',
      servicioId: 's2',
      reversesEntryId: 'e2',
    });
    expect(reversales[1].montoPuntos.valor).toBe(-25);
  });
});

describe('registrarVisita', () => {
  it('persiste la visita y sus entradas earn calculadas por el dominio', async () => {
    const repo = mockRepository();

    const visita = await registrarVisita(repo, {
      visitaId: 'v1',
      clienteId: 'c1',
      servicios: [{ servicioId: 's1', montoPuntos: MontoPuntos.crear(10) }],
      createdBy: 'op1',
    });

    expect(repo.registrarVisita).toHaveBeenCalledOnce();
    const [, entradas] = vi.mocked(repo.registrarVisita).mock.calls[0];

    expect(visita.id).toBe('v1');
    expect(entradas).toHaveLength(1);
    expect(entradas[0]).toMatchObject({
      clienteId: 'c1',
      tipo: 'earn',
      servicioId: 's1',
      visitaId: 'v1',
      montoPuntos: expect.objectContaining({ valor: 10 }),
    });
  });
});
