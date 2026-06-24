export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class SaldoInsuficiente extends DomainError {
  constructor(public readonly saldo: number, public readonly costo: number) {
    super(`Saldo insuficiente: ${saldo} puntos disponibles, ${costo} requeridos`);
  }
}

export class VisitaVacia extends DomainError {
  constructor() {
    super('Una visita debe incluir al menos un servicio');
  }
}

export class VisitaYaRevertida extends DomainError {
  constructor(visitaId: string) {
    super(`La visita ${visitaId} ya fue revertida`);
  }
}

export class AccionNoReversible extends DomainError {
  constructor() {
    super('No hay una acción previa no revertida para deshacer');
  }
}

export class MontoInvalido extends DomainError {
  constructor(valor: unknown) {
    super(`El monto de puntos debe ser un entero, recibido: ${String(valor)}`);
  }
}
