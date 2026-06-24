export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      clientes: {
        Row: {
          id: string;
          nombre: string;
          telefono: string;
          dni: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          telefono: string;
          dni?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          telefono?: string;
          dni?: string | null;
          created_at?: string;
        };
      };
      servicios: {
        Row: {
          id: string;
          nombre: string;
          puntos_default: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          puntos_default: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          puntos_default?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      premios: {
        Row: {
          id: string;
          nombre: string;
          costo_puntos: number;
          activo: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          nombre: string;
          costo_puntos: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          nombre?: string;
          costo_puntos?: number;
          activo?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      visitas: {
        Row: {
          id: string;
          cliente_id: string;
          nota: string | null;
          created_by: string;
          created_at: string;
          revertida_at: string | null;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          nota?: string | null;
          created_by: string;
          created_at?: string;
          revertida_at?: string | null;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          nota?: string | null;
          created_by?: string;
          created_at?: string;
          revertida_at?: string | null;
        };
      };
      ledger_entries: {
        Row: {
          id: string;
          cliente_id: string;
          tipo: 'earn' | 'redeem' | 'reversal';
          monto_puntos: number;
          servicio_id: string | null;
          premio_id: string | null;
          visita_id: string | null;
          reverses_entry_id: string | null;
          nota: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          cliente_id: string;
          tipo: 'earn' | 'redeem' | 'reversal';
          monto_puntos: number;
          servicio_id?: string | null;
          premio_id?: string | null;
          visita_id?: string | null;
          reverses_entry_id?: string | null;
          nota?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          cliente_id?: string;
          tipo?: 'earn' | 'redeem' | 'reversal';
          monto_puntos?: number;
          servicio_id?: string | null;
          premio_id?: string | null;
          visita_id?: string | null;
          reverses_entry_id?: string | null;
          nota?: string | null;
          created_by?: string;
          created_at?: string;
        };
      };
    };
    Functions: {
      guardar_visita_y_entradas: {
        Args: {
          p_visita_id: string;
          p_cliente_id: string;
          p_nota: string | null;
          p_created_by: string;
          p_servicios: Json;
        };
        Returns: string;
      };
      guardar_reversion_visita: {
        Args: {
          p_visita_id: string;
          p_operador_id: string;
        };
        Returns: undefined;
      };
      guardar_reversion_canje: {
        Args: {
          p_entry_id: string;
          p_operador_id: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      ledger_tipo: 'earn' | 'redeem' | 'reversal';
    };
  };
}
