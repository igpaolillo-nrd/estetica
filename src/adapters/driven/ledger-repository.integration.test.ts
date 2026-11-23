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
    const role = await pool.query(
      `SELECT 1 FROM pg_roles WHERE rolname = 'estetica_intruso'`
    );
    if (role.rowCount === 0) {
      await pool.query('CREATE ROLE estetica_intruso NOLOGIN');
    }
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

  it('obtener_ultima_accion devuelve la visita cuando es lo más reciente (o lo único)', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b61';
    const visitaVieja = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b62';
    const visitaNueva = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b63';
    const servicioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b64';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b65';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380b66';

    await crearCliente(clienteId, 'Inés');
    await crearServicio(servicioId, 10);
    await crearPremio(premioId, 5);

    const visita = (id: string) =>
      pool.query('SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)', [
        id,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: 10, servicio_id: servicioId }]),
      ]);
    const ultima = async () =>
      (await pool.query('SELECT obtener_ultima_accion($1) AS accion', [operadorId])).rows[0]
        .accion;

    // Sin acciones: null.
    expect(await ultima()).toBeNull();

    // Solo una visita (sin canjes): devuelve la visita con sus entradas earn.
    await visita(visitaVieja);
    let accion = await ultima();
    expect(accion.tipo).toBe('visita');
    expect(accion.visita.id).toBe(visitaVieja);
    expect(accion.entradas).toHaveLength(1);
    expect(accion.entradas[0].monto_puntos).toBe(10);

    // Canje y después visita: gana la visita más reciente.
    await new Promise((r) => setTimeout(r, 20));
    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -5,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);
    await new Promise((r) => setTimeout(r, 20));
    await visita(visitaNueva);
    accion = await ultima();
    expect(accion.tipo).toBe('visita');
    expect(accion.visita.id).toBe(visitaNueva);
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

    const saldoRpc = await pool.query('SELECT obtener_saldo($1) AS saldo', [clienteId]);
    expect(Number(saldoRpc.rows[0].saldo)).toBe(-20);
  });

  it('guardar_visita_y_entradas rechaza una visita sin entradas y no la persiste', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a81';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a82';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a83';

    await crearCliente(clienteId, 'Nora');

    await expect(
      pool.query('SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)', [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([]),
      ])
    ).rejects.toThrow(/al menos una entrada/i);

    const visita = await pool.query('SELECT id FROM visitas WHERE id = $1', [visitaId]);
    expect(visita.rows).toHaveLength(0);
    const ledger = await pool.query('SELECT id FROM ledger_entries WHERE cliente_id = $1', [
      clienteId,
    ]);
    expect(ledger.rows).toHaveLength(0);
  });

  it('el CHECK de signo rechaza earn negativo y redeem positivo, y acepta monto 0', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a91';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a92';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a93';

    await crearCliente(clienteId, 'Pilar');

    await expect(
      pool.query(
        `INSERT INTO ledger_entries (cliente_id, tipo, monto_puntos, created_by)
         VALUES ($1, 'earn', -1, $2)`,
        [clienteId, operadorId]
      )
    ).rejects.toThrow(/ledger_entries_monto_signo_chk/);

    await expect(
      pool.query(
        `INSERT INTO ledger_entries (cliente_id, tipo, monto_puntos, created_by)
         VALUES ($1, 'redeem', 10, $2)`,
        [clienteId, operadorId]
      )
    ).rejects.toThrow(/ledger_entries_monto_signo_chk/);

    await expect(
      pool.query('SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)', [
        visitaId,
        clienteId,
        null,
        operadorId,
        JSON.stringify([{ tipo: 'earn', monto_puntos: -5 }]),
      ])
    ).rejects.toThrow(/ledger_entries_monto_signo_chk/);

    const visita = await pool.query('SELECT id FROM visitas WHERE id = $1', [visitaId]);
    expect(visita.rows).toHaveLength(0);

    await pool.query('SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)', [
      visitaId,
      clienteId,
      null,
      operadorId,
      JSON.stringify([{ tipo: 'earn', monto_puntos: 0 }]),
    ]);

    const earn = await pool.query(
      'SELECT monto_puntos FROM ledger_entries WHERE visita_id = $1',
      [visitaId]
    );
    expect(earn.rows[0].monto_puntos).toBe(0);
  });

  it('no se puede revertir dos veces la misma entrada', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380aa1';
    const premioId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380aa2';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380aa3';

    await crearCliente(clienteId, 'Rita');
    await crearPremio(premioId, 10);

    await pool.query('SELECT guardar_canje($1)', [
      JSON.stringify({
        cliente_id: clienteId,
        tipo: 'redeem',
        monto_puntos: -10,
        premio_id: premioId,
        created_by: operadorId,
      }),
    ]);

    const redeem = await pool.query('SELECT id FROM ledger_entries WHERE tipo = $1', ['redeem']);
    const reversal = {
      cliente_id: clienteId,
      tipo: 'reversal',
      monto_puntos: 10,
      premio_id: premioId,
      reverses_entry_id: redeem.rows[0].id,
      created_by: operadorId,
    };

    await pool.query('SELECT guardar_reversion_canje($1)', [JSON.stringify(reversal)]);

    await expect(
      pool.query('SELECT guardar_reversion_canje($1)', [
        JSON.stringify({ ...reversal, id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380aa4' }),
      ])
    ).rejects.toThrow(/ledger_entries_reverses_entry_id_key/);
  });

  it('un rol sin privilegios no ejecuta las RPC ni inserta un canje salteando RLS', async () => {
    const clienteId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380ab1';
    const operadorId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380ab2';
    const visitaId = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380ab3';

    const definers = [
      {
        sql: 'SELECT guardar_visita_y_entradas($1, $2, $3, $4, $5)',
        params: [visitaId, clienteId, null, operadorId, JSON.stringify([])],
      },
      {
        sql: 'SELECT guardar_canje($1)',
        params: [
          JSON.stringify({
            cliente_id: clienteId,
            tipo: 'redeem',
            monto_puntos: -10,
            created_by: operadorId,
          }),
        ],
      },
      {
        sql: 'SELECT guardar_reversion_visita($1, $2, $3)',
        params: [visitaId, operadorId, JSON.stringify([])],
      },
      {
        sql: 'SELECT guardar_reversion_canje($1)',
        params: [JSON.stringify({ tipo: 'reversal', monto_puntos: 10 })],
      },
      {
        sql: 'SELECT obtener_ultima_accion($1)',
        params: [operadorId],
      },
    ];

    const client = await pool.connect();
    try {
      for (const call of definers) {
        await client.query('BEGIN');
        try {
          await client.query('SET LOCAL ROLE estetica_intruso');
          await expect(client.query(call.sql, call.params)).rejects.toThrow(
            /permission denied|permiso denegado/i
          );
        } finally {
          await client.query('ROLLBACK');
        }
      }

      await client.query('BEGIN');
      try {
        await client.query(
          'INSERT INTO clientes (id, nombre, telefono) VALUES ($1, $2, $3)',
          [clienteId, 'Intrusa', '000']
        );
        // Con INSERT concedido, el rechazo tiene que venir de RLS y no de un GRANT faltante.
        await client.query('GRANT INSERT ON ledger_entries TO estetica_intruso');
        await client.query('SET LOCAL ROLE estetica_intruso');
        await expect(
          client.query(
            `INSERT INTO ledger_entries (cliente_id, tipo, monto_puntos, created_by)
             VALUES ($1, 'redeem', -10, $2)`,
            [clienteId, operadorId]
          )
        ).rejects.toThrow(/row-level security|seguridad a nivel de fila/i);
      } finally {
        await client.query('ROLLBACK');
      }
    } finally {
      client.release();
    }

    const privilegios = await pool.query<{
      proname: string;
      prosecdef: boolean;
      proconfig: string[] | null;
      public_execute: boolean;
      authenticated_execute: boolean;
    }>(`
      SELECT p.proname,
             p.prosecdef,
             p.proconfig,
             EXISTS (
               SELECT 1
               FROM aclexplode(p.proacl) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'
             ) AS public_execute,
             has_function_privilege(
               'authenticated',
               p.oid,
               'EXECUTE'
             ) AS authenticated_execute
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'guardar_visita_y_entradas',
          'guardar_canje',
          'guardar_reversion_visita',
          'guardar_reversion_canje',
          'obtener_ultima_accion'
        )
    `);

    expect(privilegios.rows).toHaveLength(5);
    for (const row of privilegios.rows) {
      expect(row.prosecdef).toBe(true);
      expect(row.proconfig?.join(' ') ?? '').toMatch(/search_path/);
      expect(row.public_execute).toBe(false);
      expect(row.authenticated_execute).toBe(true);
    }

    const firmas = [
      'public.guardar_visita_y_entradas(uuid, uuid, text, uuid, jsonb)',
      'public.guardar_canje(jsonb)',
      'public.guardar_reversion_visita(uuid, uuid, jsonb)',
      'public.guardar_reversion_canje(jsonb)',
      'public.obtener_ultima_accion(uuid)',
    ];
    for (const firma of firmas) {
      const priv = await pool.query(
        `SELECT has_function_privilege('estetica_intruso', $1::regprocedure, 'EXECUTE') AS ok`,
        [firma]
      );
      expect(priv.rows[0].ok).toBe(false);
    }

    const anon = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') AS existe`
    );
    if (anon.rows[0].existe) {
      for (const firma of firmas) {
        const priv = await pool.query(
          `SELECT has_function_privilege('anon', $1::regprocedure, 'EXECUTE') AS ok`,
          [firma]
        );
        expect(priv.rows[0].ok).toBe(false);
      }
    }

    const queda = await pool.query('SELECT count(*)::int AS n FROM ledger_entries');
    expect(queda.rows[0].n).toBe(0);

    const auth = await pool.connect();
    try {
      await auth.query('BEGIN');
      await auth.query(
        'INSERT INTO clientes (id, nombre, telefono) VALUES ($1, $2, $3)',
        [clienteId, 'Dueña', '111']
      );
      await auth.query('SET LOCAL ROLE authenticated');
      await auth.query('SELECT guardar_canje($1)', [
        JSON.stringify({
          cliente_id: clienteId,
          tipo: 'redeem',
          monto_puntos: -10,
          created_by: operadorId,
        }),
      ]);
      await auth.query('RESET ROLE');
      const insertado = await auth.query(
        'SELECT count(*)::int AS n FROM ledger_entries WHERE cliente_id = $1',
        [clienteId]
      );
      expect(insertado.rows[0].n).toBe(1);
    } finally {
      await auth.query('ROLLBACK');
      auth.release();
    }
  });

  it('buscar_clientas ignora acentos y también matchea teléfono y DNI, usando el GIN', async () => {
    await pool.query(
      `INSERT INTO clientes (id, nombre, telefono, dni) VALUES
        ($1, 'María Pérez', '11-5555-0101', '30111222'),
        ($2, 'José Álvarez', '11-5555-0202', '28999888')`,
      [
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380ac1',
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380ac2',
      ]
    );

    const porNombre = await pool.query(`SELECT nombre FROM buscar_clientas('maria', 10)`);
    expect(porNombre.rows.map((r) => r.nombre)).toEqual(['María Pérez']);

    const porApellido = await pool.query(`SELECT nombre FROM buscar_clientas('perez', 10)`);
    expect(porApellido.rows.map((r) => r.nombre)).toEqual(['María Pérez']);

    const porTelefono = await pool.query(`SELECT nombre FROM buscar_clientas('5555-0202', 10)`);
    expect(porTelefono.rows.map((r) => r.nombre)).toEqual(['José Álvarez']);

    const porDni = await pool.query(`SELECT nombre FROM buscar_clientas('30111222', 10)`);
    expect(porDni.rows.map((r) => r.nombre)).toEqual(['María Pérez']);

    const inyeccion = await pool.query(
      `SELECT nombre FROM buscar_clientas($1, 10)`,
      [`%',telefono.ilike.%`]
    );
    expect(inyeccion.rows).toHaveLength(0);

    const def = await pool.query(
      `SELECT pg_get_functiondef('public.buscar_clientas(text, integer)'::regprocedure) AS src,
              proconfig
       FROM pg_proc
       WHERE proname = 'buscar_clientas'`
    );
    expect(def.rows[0].src).toContain('lower(f_unaccent(c.nombre)) LIKE v_pattern');
    expect(def.rows[0].src).toContain('UNION');
    expect((def.rows[0].proconfig as string[]).join(' ')).toMatch(/force_custom_plan/);

    await pool.query('ANALYZE clientes');

    const client = await pool.connect();
    try {
      await client.query('SET enable_seqscan = off');
      await client.query(`
        PREPARE buscar_idx_test (text) AS
          SELECT e.*
          FROM (
            SELECT c.*
            FROM clientes c
            WHERE lower(f_unaccent(c.nombre)) LIKE $1
            UNION
            SELECT c.*
            FROM clientes c
            WHERE c.telefono ILIKE $1
            UNION
            SELECT c.*
            FROM clientes c
            WHERE c.dni ILIKE $1
          ) e
          ORDER BY e.nombre
          LIMIT 10
      `);
      const plan = await client.query(`EXPLAIN EXECUTE buscar_idx_test('%maria%')`);
      const texto = plan.rows.map((r) => r['QUERY PLAN']).join('\n');
      expect(texto).toContain('idx_clientes_nombre_trgm');
    } finally {
      await client.query('DEALLOCATE PREPARE buscar_idx_test').catch(() => undefined);
      await client.query('RESET enable_seqscan');
      client.release();
    }
  });
});
