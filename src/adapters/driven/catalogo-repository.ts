import { SupabaseClient } from '@supabase/supabase-js';
import { Database } from '@/lib/supabase/database.types';

/**
 * CRUD pragmático para catálogos (servicios, premios) y búsqueda de clientas.
 *
 * Este código NO pasa por el hexágono: son operaciones de lectura/escritura
 * directas, con la menor ceremonia posible. Se mantiene bajo acoplamiento
 * separando el acceso a datos de la UI.
 */
export class CatalogoRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // --- Servicios ---

  async listarServicios() {
    const { data, error } = await this.db
      .from('servicios')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw new Error(`Error listando servicios: ${error.message}`);
    return data ?? [];
  }

  async obtenerServicio(id: string) {
    const { data, error } = await this.db
      .from('servicios')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Error obteniendo servicio: ${error.message}`);
    return data;
  }

  async crearServicio(input: { nombre: string; puntos_default: number }) {
    const { data, error } = await this.db
      .from('servicios')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`Error creando servicio: ${error.message}`);
    return data;
  }

  async actualizarServicio(
    id: string,
    input: Partial<{ nombre: string; puntos_default: number; activo: boolean }>
  ) {
    const { data, error } = await this.db
      .from('servicios')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Error actualizando servicio: ${error.message}`);
    return data;
  }

  async eliminarServicio(id: string) {
    // Soft-delete: nunca hard-delete si está referenciado.
    return this.actualizarServicio(id, { activo: false });
  }

  // --- Premios ---

  async listarPremios() {
    const { data, error } = await this.db
      .from('premios')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (error) throw new Error(`Error listando premios: ${error.message}`);
    return data ?? [];
  }

  async obtenerPremio(id: string) {
    const { data, error } = await this.db
      .from('premios')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Error obteniendo premio: ${error.message}`);
    return data;
  }

  async crearPremio(input: { nombre: string; costo_puntos: number }) {
    const { data, error } = await this.db
      .from('premios')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`Error creando premio: ${error.message}`);
    return data;
  }

  async actualizarPremio(
    id: string,
    input: Partial<{ nombre: string; costo_puntos: number; activo: boolean }>
  ) {
    const { data, error } = await this.db
      .from('premios')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Error actualizando premio: ${error.message}`);
    return data;
  }

  async eliminarPremio(id: string) {
    return this.actualizarPremio(id, { activo: false });
  }

  // --- Clientas ---

  async buscarClientasPorNombre(parcial: string, limite: number = 10) {
    const normalizado = parcial.trim();
    if (!normalizado) return [];

    const { data, error } = await this.db
      .from('clientes')
      .select('*')
      .or(
        `nombre.ilike.%${normalizado}%,nombre.ilike.%${this.sinAcentos(normalizado)}%`
      )
      .limit(limite);

    if (error) throw new Error(`Error buscando clientas: ${error.message}`);
    return data ?? [];
  }

  async crearCliente(input: { nombre: string; telefono: string; dni?: string | null }) {
    const { data, error } = await this.db
      .from('clientes')
      .insert(input)
      .select()
      .single();

    if (error) throw new Error(`Error creando clienta: ${error.message}`);
    return data;
  }

  async obtenerCliente(id: string) {
    const { data, error } = await this.db
      .from('clientes')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw new Error(`Error obteniendo clienta: ${error.message}`);
    return data;
  }

  private sinAcentos(texto: string): string {
    // Fallback simple; en DB se usa unaccent via ILIKE.
    return texto
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }
}
