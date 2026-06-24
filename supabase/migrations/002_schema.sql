-- Migración 002: tablas del dominio

-- Clientas. Búsqueda por nombre es la operación más frecuente.
CREATE TABLE IF NOT EXISTS clientes (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre text NOT NULL,
    telefono text NOT NULL,
    dni text NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Servicios del centro. CRUD simple; puntos_default es regla de negocio.
CREATE TABLE IF NOT EXISTS servicios (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre text NOT NULL,
    puntos_default int NOT NULL CHECK (puntos_default >= 0),
    activo bool NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Premios canjeables. CRUD simple.
CREATE TABLE IF NOT EXISTS premios (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    nombre text NOT NULL,
    costo_puntos int NOT NULL CHECK (costo_puntos >= 0),
    activo bool NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Visitas: agregado que agrupa uno o más servicios realizados en un mismo acto.
CREATE TABLE IF NOT EXISTS visitas (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id uuid NOT NULL REFERENCES clientes(id),
    nota text NULL,
    created_by uuid NOT NULL, -- referencia a auth.users, sin FK explícita para evitar acoplamiento a auth
    created_at timestamptz NOT NULL DEFAULT now(),
    revertida_at timestamptz NULL
);

-- Tipo de entrada del ledger.
CREATE TYPE ledger_tipo AS ENUM ('earn', 'redeem', 'reversal');

-- Ledger de puntos: única fuente de verdad. Append-only por diseño.
CREATE TABLE IF NOT EXISTS ledger_entries (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    cliente_id uuid NOT NULL REFERENCES clientes(id),
    tipo ledger_tipo NOT NULL,
    monto_puntos int NOT NULL,
    servicio_id uuid NULL REFERENCES servicios(id),
    premio_id uuid NULL REFERENCES premios(id),
    visita_id uuid NULL REFERENCES visitas(id),
    reverses_entry_id uuid NULL REFERENCES ledger_entries(id),
    nota text NULL,
    created_by uuid NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
