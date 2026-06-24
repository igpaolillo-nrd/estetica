import { describe, it, expect, beforeEach, beforeAll, afterAll } from 'vitest';
import { Pool } from 'pg';

const pool = new Pool({
  host: process.env.PGHOST ?? 'localhost',
  port: Number(process.env.PGPORT ?? 5432),
  database: process.env.PGDATABASE ?? 'estetica_test',
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
});

describe('Capa SQL del ledger (integración)', () => {
  beforeAll(async () => {
    // Verifica que la conexión funcione.
    await pool.query('SELECT 1');
  });

  beforeEach(async () => {
    await pool.query(
      'TRUNCATE clientes, servicios, premios, visitas, ledger_entries RESTART IDENTITY CASCADE'
    );
  });

  afterAll(async () => {
    await pool.end();
  });

  async function crearCliente(id: string, nombre: string) {
    await pool.query(
      'INSERT INTO clientes (id, nombre, telefono) VALUES ($1, $2, $3)',
      [id, nombre, '123456']
    );
  }

  async function crearServicio(id: string, puntos: number) {
    await pool.query(
      'INSERT INTO servicios (id, nombre, puntos_default) VALUES ($1, $2, $3)',
      [id, `servicio-${id}`, puntos]
    );
  }

  async function crearPremio(id: string, costo: number) {
    await pool.query(
      'INSERT INTO premios (id, nombre, costo_puntos) VALUES ($1, $2, $3)',
      [id, `premio-${id}`, costo]
    );
  }

  it('guardar_visita_y_entradas inserta visita y N entradas earn', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12';
    const servicio1Id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a13';
    const servicio2Id = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a14';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a15';

    await crearCliente(clienteId, 'María');
    await crearServicio(servicio1Id, 10);
    await crearServicio(servicio2Id, 25);

    const entradas = [
      {
        tipo: 'earn',
        monto_puntos: 10,
        servicio_id: servicio1Id,
      },
      {
        tipo: 'earn',
        monto_puntos: 25,
        servicio_id: servicio2Id,
      },
    ];

    await pool.query(
      'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
      [visitaId, clienteId, 'Corte y tintura', operadorId, JSON.stringify(entradas)]
    );

    const visita = await pool.query('SELECT * FROM visitas WHERE id = $1', [visitaId]);
    expect(visita.rows).toHaveLength(1);
    expect(visita.rows[0].cliente_id).toBe(clienteId);

    const ledger = await pool.query(
      'SELECT * FROM ledger_entries WHERE visita_id = $1 ORDER BY monto_puntos',
      [visitaId]
    );
    expect(ledger.rows).toHaveLength(2);
    expect(ledger.rows.map((r) => r.monto_puntos)).toEqual([10, 25]);
    expect(ledger.rows.every((r) => r.tipo === 'earn')).toBe(true);
  });

  it('el trigger append-only bloquea UPDATE y DELETE sobre ledger_entries', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a21';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a23';

    await crearCliente(clienteId, 'Juana');

    await pool.query(
      'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
      [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: 5 }]),
      ]
    );

    const entry = await pool.query(
      'SELECT id FROM ledger_entries WHERE visita_id = $1 LIMIT 1',
      [visitaId]
    );
    const entryId = entry.rows[0].id;

    await expect(
      pool.query('UPDATE ledger_entries SET monto_puntos = 999 WHERE id = $1', [entryId])
    ).rejects.toThrow('append-only');

    await expect(
      pool.query('DELETE FROM ledger_entries WHERE id = $1', [entryId])
    ).rejects.toThrow('append-only');
  });

  it('guardar_canje inserta entrada redeem', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a31';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a32';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33';

    await crearCliente(clienteId, 'Ana');
    await crearPremio(premioId, 50);

    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -50,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);

    const redeem = await pool.query('SELECT * FROM ledger_entries WHERE tipo = $1', ['redeem']);
    expect(redeem.rows).toHaveLength(1);
    expect(redeem.rows[0].monto_puntos).toBe(-50);
    expect(redeem.rows[0].premio_id).toBe(premioId);
  });

  it('guardar_reversion_visita marca revertida_at e inserta reversales; segundo intento falla', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a41';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a42';
    const servicioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a43';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a44';

    await crearCliente(clienteId, 'Luisa');
    await crearServicio(servicioId, 15);

    await pool.query(
      'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
      [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: 15, servicio_id: servicioId }]),
      ]
    );

    const earnEntry = await pool.query(
      'SELECT id FROM ledger_entries WHERE visita_id = $1 AND tipo = $2',
      [visitaId, 'earn']
    );

    await pool.query('SELECT guardar_reversion_visita($1, $2, $3)', [
      visitaId,
      operadorId,
      JSON.stringify([
        {
          cliente_id: clienteId,
          tipo: 'reversal',
          monto_puntos: -15,
          servicio_id: servicioId,
          visita_id: visitaId,
          reverses_entry_id: earnEntry.rows[0].id,
          created_by: operadorId,
        },
      ]),
    ]);

    const visita = await pool.query('SELECT revertida_at FROM visitas WHERE id = $1', [visitaId]);
    expect(visita.rows[0].revertida_at).not.toBeNull();

    const reversal = await pool.query(
      'SELECT * FROM ledger_entries WHERE tipo = $1',
      ['reversal']
    );
    expect(reversal.rows).toHaveLength(1);
    expect(reversal.rows[0].monto_puntos).toBe(-15);
    expect(reversal.rows[0].reverses_entry_id).toBe(earnEntry.rows[0].id);

    await expect(
      pool.query('SELECT guardar_reversion_visita($1, $2, $3)', [
        visitaId,
        operadorId,
        JSON.stringify([]),
      ])
    ).rejects.toThrow('Visita ya revertida');
  });

  it('guardar_reversion_canje inserta la reversal calculada por el dominio', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a51';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a52';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a53';

    await crearCliente(clienteId, 'Carmen');
    await crearPremio(premioId, 30);

    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -30,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);

    const redeemRow = await pool.query(
      'SELECT id FROM ledger_entries WHERE tipo = $1',
      ['redeem']
    );
    const redeemId = redeemRow.rows[0].id;

    await pool.query('SELECT guardar_reversion_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'reversal',
        monto_puntos: 30,
        premio_id: premioId,
        reverses_entry_id: redeemId,
        created_by: operadorId,
        nota: 'Reversión de canje manual',
      }),
    ]);

    const reversal = await pool.query(
      'SELECT * FROM ledger_entries WHERE tipo = $1',
      ['reversal']
    );
    expect(reversal.rows).toHaveLength(1);
    expect(reversal.rows[0].monto_puntos).toBe(30);
    expect(reversal.rows[0].reverses_entry_id).toBe(redeemId);
    expect(reversal.rows[0].nota).toBe('Reversión de canje manual');
  });

  it('obtener_ultima_accion devuelve la acción más reciente no revertida', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a61';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a62';
    const servicioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a63';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a64';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a65';

    await crearCliente(clienteId, 'Rosa');
    await crearServicio(servicioId, 10);
    await crearPremio(premioId, 5);

    // Registrar visita (más antigua).
    await pool.query(
      'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
      [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: 10, servicio_id: servicioId }]),
      ]
    );

    // Pequeña pausa para asegurar orden cronológico distinto.
    await new Promise((r) => setTimeout(r, 50));

    // Canje (más reciente).
    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -5,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);

    const result = await pool.query('SELECT obtener_ultima_accion($1) AS accion', [operadorId]);
    const accion = result.rows[0].accion;

    expect(accion.tipo).toBe('redeem');
    expect(accion.entrada.tipo).toBe('redeem');
    expect(accion.entrada.monto_puntos).toBe(-5);
  });

  it('el saldo computado es correcto después de earn, redeem y reversal', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a71';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a72';
    const servicioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a73';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a74';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a75';

    await crearCliente(clienteId, 'Elena');
    await crearServicio(servicioId, 40);
    await crearPremio(premioId, 20);

    await pool.query(
      'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
      [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: 40, servicio_id: servicioId }]),
      ]
    );

    let saldo = await pool.query(
      'SELECT COALESCE(SUM(monto_puntos), 0) AS saldo FROM ledger_entries WHERE cliente_id = $1',
      [clienteId]
    );
    expect(Number(saldo.rows[0].saldo)).toBe(40);

    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -20,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);

    saldo = await pool.query(
      'SELECT COALESCE(SUM(monto_puntos), 0) AS saldo FROM ledger_entries WHERE cliente_id = $1',
      [clienteId]
    );
    expect(Number(saldo.rows[0].saldo)).toBe(20);

    const earnEntry = await pool.query(
      'SELECT id FROM ledger_entries WHERE visita_id = $1 AND tipo = $2',
      [visitaId, 'earn']
    );

    await pool.query('SELECT guardar_reversion_visita($1, $2, $3)', [
      visitaId,
      operadorId,
      JSON.stringify([
        {
          cliente_id: clienteId,
          tipo: 'reversal',
          monto_puntos: -40,
          servicio_id: servicioId,
          visita_id: visitaId,
          reverses_entry_id: earnEntry.rows[0].id,
          created_by: operadorId,
        },
      ]),
    ]);

    saldo = await pool.query(
      'SELECT COALESCE(SUM(monto_puntos), 0) AS saldo FROM ledger_entries WHERE cliente_id = $1',
      [clienteId]
    );
    expect(Number(saldo.rows[0].saldo)).toBe(-20);
  });
});
