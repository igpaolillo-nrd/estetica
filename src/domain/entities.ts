import { MontoPuntos } from './value-objects';
import { VisitaVacia, VisitaYaRevertida } from './errors';

export type LedgerTipo = 'earn' | 'redeem' | 'reversal';

/**
 * Snapshot de un servicio en el momento de la visita.
 * El dominio copia puntos_default como monto para garantizar inmutabilidad histórica.
 * El nombre del servicio vive en el catálogo y se resuelve en presentación, no aquí.
 */
export interface ServicioSnapshot {
  servicioId: string;
  montoPuntos: MontoPuntos;
}

/**
 * Snapshot de un premio en el momento del canje.
 * El nombre del premio vive en el catálogo; el dominio no lo necesita para el ledger.
 */
export interface PremioSnapshot {
  premioId: string;
  costoPuntos: MontoPuntos;
}

/**
 * Entrada del ledger. Es la única fuente de verdad de movimientos de puntos.
 * El campo montoPuntos es autoritativo; los ids de servicio/premio/visita son descriptivos.
 */
export interface LedgerEntry {
  id?: string;
  clienteId: string;
  tipo: LedgerTipo;
  montoPuntos: MontoPuntos;
  servicioId?: string;
  premioId?: string;
  visitaId?: string;
  reversesEntryId?: string;
  nota?: string;
  createdBy: string;
  createdAt?: Date;
}

/**
 * Raíz de agregado: Visita.
 * Agrupa uno o más servicios realizados en un mismo acto.
 * Al confirmarse emite entradas earn; al deshacerse emite reversal compensatorios.
 */
export class Visita {
  public readonly id: string;
  public readonly clienteId: string;
  public readonly servicios: ServicioSnapshot[];
  public readonly nota?: string;
  public readonly createdBy: string;
  public readonly createdAt: Date;
  public revertidaAt?: Date;

  private constructor(props: {
    id: string;
    clienteId: string;
    servicios: ServicioSnapshot[];
    nota?: string;
    createdBy: string;
    createdAt?: Date;
    revertidaAt?: Date;
  }) {
    if (props.servicios.length === 0) {
      throw new VisitaVacia();
    }

    this.id = props.id;
    this.clienteId = props.clienteId;
    this.servicios = props.servicios;
    this.nota = props.nota;
    this.createdBy = props.createdBy;
    this.createdAt = props.createdAt ?? new Date();
    this.revertidaAt = props.revertidaAt;
  }

  static crear(props: {
    id: string;
    clienteId: string;
    servicios: ServicioSnapshot[];
    nota?: string;
    createdBy: string;
    createdAt?: Date;
  }): Visita {
    return new Visita(props);
  }

  estaRevertida(): boolean {
    return this.revertidaAt !== undefined;
  }

  revertir(): void {
    if (this.estaRevertida()) {
      throw new VisitaYaRevertida(this.id);
    }
    this.revertidaAt = new Date();
  }

  /**
   * Genera las entradas earn correspondientes a esta visita.
   * Cada servicio produce una entrada con el monto snapshotteado.
   */
  generarEntradasEarn(): LedgerEntry[] {
    return this.servicios.map((servicio) => ({
      clienteId: this.clienteId,
      tipo: 'earn' as const,
      montoPuntos: servicio.montoPuntos,
      servicioId: servicio.servicioId,
      visitaId: this.id,
      nota: this.nota,
      createdBy: this.createdBy,
      createdAt: this.createdAt,
    }));
  }
}
