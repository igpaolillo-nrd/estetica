import { MontoInvalido } from './errors';

/**
 * Value object: cantidad de puntos con signo.
 * Usado para montos en el ledger (earn positivo, redeem/reversal negativo).
 */
export class MontoPuntos {
  private constructor(public readonly valor: number) {}

  static crear(valor: number): MontoPuntos {
    if (!Number.isInteger(valor)) {
      throw new MontoInvalido(valor);
    }
    return new MontoPuntos(valor);
  }

  static cero(): MontoPuntos {
    return new MontoPuntos(0);
  }

  negativo(): MontoPuntos {
    return new MontoPuntos(-this.valor);
  }

  esPositivo(): boolean {
    return this.valor > 0;
  }

  esCero(): boolean {
    return this.valor === 0;
  }
}
