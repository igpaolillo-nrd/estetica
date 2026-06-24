import { describe, it, expect } from 'vitest';
import { Visita, LedgerEntry } from './entities';
import { MontoPuntos } from './value-objects';
import { VisitaVacia, VisitaYaRevertida } from './errors';
import { proyectarHistorialServicios } from './operations';

describe('Visita', () => {
  it('lanza VisitaVacia si se crea sin servicios', () => {
    expect(() =>
      Visita.crear({
        id: 'v1',
        clienteId: 'c1',
        servicios: [],
        createdBy: 'op1',
      })
    ).toThrow(VisitaVacia);
  });

  it('lanza VisitaYaRevertida al revertir dos veces', () => {
    const visita = Visita.crear({
      id: 'v1',
      clienteId: 'c1',
      servicios: [{ servicioId: 's1', montoPuntos: MontoPuntos.crear(10) }],
      createdBy: 'op1',
    });

    visita.revertir();

    expect(() => visita.revertir()).toThrow(VisitaYaRevertida);
  });

  it('genera una entrada earn por servicio con el monto snapshotteado', () => {
    const visita = Visita.crear({
      id: 'v1',
      clienteId: 'c1',
      servicios: [
        { servicioId: 's1', montoPuntos: MontoPuntos.crear(10) },
        { servicioId: 's2', montoPuntos: MontoPuntos.crear(25) },
      ],
      nota: 'Corte y tintura',
      createdBy: 'op1',
    });

    const entradas = visita.generarEntradasEarn();

    expect(entradas).toHaveLength(2);
    expect(entradas[0]).toMatchObject({
      clienteId: 'c1',
      tipo: 'earn',
      montoPuntos: expect.objectContaining({ valor: 10 }),
      servicioId: 's1',
      visitaId: 'v1',
      nota: 'Corte y tintura',
      createdBy: 'op1',
    });
    expect(entradas[1]).toMatchObject({
      tipo: 'earn',
      montoPuntos: expect.objectContaining({ valor: 25 }),
      servicioId: 's2',
    });
  });
});

describe('proyectarHistorialServicios', () => {
  it('excluye entradas revertidas y filtra por servicio y fecha', () => {
    const base: Omit<LedgerEntry, 'id'> = {
      clienteId: 'c1',
      tipo: 'earn',
      montoPuntos: MontoPuntos.crear(10),
      servicioId: 's1',
      createdBy: 'op1',
    };

    const earn1: LedgerEntry = { ...base, id: 'e1', createdAt: new Date('2024-01-01') };
    const earn2: LedgerEntry = { ...base, id: 'e2', servicioId: 's2', createdAt: new Date('2024-01-15') };
    const reversal: LedgerEntry = {
      ...base,
      id: 'r1',
      tipo: 'reversal',
      montoPuntos: MontoPuntos.crear(-10),
      reversesEntryId: 'e1',
      createdAt: new Date('2024-01-20'),
    };

    const historial = proyectarHistorialServicios([earn1, earn2, reversal], {
      servicioId: 's1',
      desde: new Date('2023-12-01'),
      hasta: new Date('2024-01-31'),
    });

    expect(historial).toHaveLength(0); // e1 fue revertida
  });
});
