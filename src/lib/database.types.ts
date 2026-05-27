export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      app_users: {
        Row: {
          created_at: string | null
          display_name: string
          email: string | null
          id: string
          role: string | null
          username: string
        }
        Insert: {
          created_at?: string | null
          display_name: string
          email?: string | null
          id?: string
          role?: string | null
          username: string
        }
        Update: {
          created_at?: string | null
          display_name?: string
          email?: string | null
          id?: string
          role?: string | null
          username?: string
        }
        Relationships: []
      }
      branches: {
        Row: {
          address: string | null
          created_at: string | null
          fax: string | null
          id: string
          name: string
          note: string | null
          short_name: string
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          fax?: string | null
          id?: string
          name: string
          note?: string | null
          short_name: string
        }
        Update: {
          address?: string | null
          created_at?: string | null
          fax?: string | null
          id?: string
          name?: string
          note?: string | null
          short_name?: string
        }
        Relationships: []
      }
      demand_lines: {
        Row: {
          created_at: string | null
          id: string
          job_id: string
          note: string | null
          product_id: string | null
          purpose: string | null
          raw_name: string
          required_qty: number
          sort_order: number | null
          unit_label: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          job_id: string
          note?: string | null
          product_id?: string | null
          purpose?: string | null
          raw_name: string
          required_qty?: number
          sort_order?: number | null
          unit_label?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          job_id?: string
          note?: string | null
          product_id?: string | null
          purpose?: string | null
          raw_name?: string
          required_qty?: number
          sort_order?: number | null
          unit_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "demand_lines_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sourcing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "demand_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      expense_reports: {
        Row: {
          created_at: string | null
          file_url: string | null
          id: string
          purchase_order_id: string | null
          report_date: string | null
          total_amount: number | null
          vendor_name: string | null
        }
        Insert: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          purchase_order_id?: string | null
          report_date?: string | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Update: {
          created_at?: string | null
          file_url?: string | null
          id?: string
          purchase_order_id?: string | null
          report_date?: string | null
          total_amount?: number | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expense_reports_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          branch_id: string | null
          created_at: string | null
          file_url: string | null
          id: string
          invoice_date: string | null
          order_id: string | null
          total_amount: number | null
          total_supply: number | null
          total_tax: number | null
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          order_id?: string | null
          total_amount?: number | null
          total_supply?: number | null
          total_tax?: number | null
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          file_url?: string | null
          id?: string
          invoice_date?: string | null
          order_id?: string | null
          total_amount?: number | null
          total_supply?: number | null
          total_tax?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          confirmed_qty: number | null
          created_at: string | null
          edi_code: string | null
          id: string
          item_status: string | null
          margin: number | null
          order_id: string
          product_id: string | null
          purchase_price: number | null
          quantity: number
          raw_product_name: string | null
          shipped_qty: number | null
          supply_price: number | null
          total_purchase: number | null
          total_supply: number | null
          vendor_id: string | null
        }
        Insert: {
          confirmed_qty?: number | null
          created_at?: string | null
          edi_code?: string | null
          id?: string
          item_status?: string | null
          margin?: number | null
          order_id: string
          product_id?: string | null
          purchase_price?: number | null
          quantity: number
          raw_product_name?: string | null
          shipped_qty?: number | null
          supply_price?: number | null
          total_purchase?: number | null
          total_supply?: number | null
          vendor_id?: string | null
        }
        Update: {
          confirmed_qty?: number | null
          created_at?: string | null
          edi_code?: string | null
          id?: string
          item_status?: string | null
          margin?: number | null
          order_id?: string
          product_id?: string | null
          purchase_price?: number | null
          quantity?: number
          raw_product_name?: string | null
          shipped_qty?: number | null
          supply_price?: number | null
          total_purchase?: number | null
          total_supply?: number | null
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_log: {
        Row: {
          changed_at: string | null
          id: string
          new_status: string
          note: string | null
          old_status: string | null
          order_id: string
        }
        Insert: {
          changed_at?: string | null
          id?: string
          new_status: string
          note?: string | null
          old_status?: string | null
          order_id: string
        }
        Update: {
          changed_at?: string | null
          id?: string
          new_status?: string
          note?: string | null
          old_status?: string | null
          order_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_status_log_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          branch_id: string | null
          category: string | null
          confirmed_at: string | null
          created_at: string | null
          delivered_at: string | null
          estimated_delivery_days: number | null
          id: string
          note: string | null
          order_date: string
          order_number: string | null
          shipped_at: string | null
          status: string | null
          total_margin: number | null
          total_purchase_amount: number | null
          total_supply_amount: number | null
          vendor_name: string | null
        }
        Insert: {
          branch_id?: string | null
          category?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          estimated_delivery_days?: number | null
          id?: string
          note?: string | null
          order_date: string
          order_number?: string | null
          shipped_at?: string | null
          status?: string | null
          total_margin?: number | null
          total_purchase_amount?: number | null
          total_supply_amount?: number | null
          vendor_name?: string | null
        }
        Update: {
          branch_id?: string | null
          category?: string | null
          confirmed_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          estimated_delivery_days?: number | null
          id?: string
          note?: string | null
          order_date?: string
          order_number?: string | null
          shipped_at?: string | null
          status?: string | null
          total_margin?: number | null
          total_purchase_amount?: number | null
          total_supply_amount?: number | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      price_history: {
        Row: {
          changed_at: string
          id: string
          new_price: number | null
          old_price: number | null
          price_field: string
          product_id: string | null
          reason: string | null
          source_id: string
          source_table: string
          vendor_id: string | null
        }
        Insert: {
          changed_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          price_field?: string
          product_id?: string | null
          reason?: string | null
          source_id: string
          source_table: string
          vendor_id?: string | null
        }
        Update: {
          changed_at?: string
          id?: string
          new_price?: number | null
          old_price?: number | null
          price_field?: string
          product_id?: string | null
          reason?: string | null
          source_id?: string
          source_table?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_history_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      price_tiers: {
        Row: {
          created_at: string | null
          id: string
          min_qty: number
          note: string | null
          product_id: string
          unit_price: number
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          min_qty: number
          note?: string | null
          product_id: string
          unit_price: number
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          min_qty?: number
          note?: string | null
          product_id?: string
          unit_price?: number
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "price_tiers_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string | null
          created_at: string | null
          edi_code: string | null
          id: string
          name: string
          product_spec: string | null
          spec: string | null
          supply_price: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          edi_code?: string | null
          id?: string
          name: string
          product_spec?: string | null
          spec?: string | null
          supply_price?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          edi_code?: string | null
          id?: string
          name?: string
          product_spec?: string | null
          spec?: string | null
          supply_price?: number | null
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          purchase_order_id: string
          quantity: number
          total_price: number | null
          unit_price: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id: string
          quantity: number
          total_price?: number | null
          unit_price?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          purchase_order_id?: string
          quantity?: number
          total_price?: number | null
          unit_price?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          created_at: string | null
          id: string
          order_id: string | null
          po_date: string
          po_number: string | null
          shipping_cost: number | null
          status: string | null
          total_amount: number | null
          vendor_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          po_date: string
          po_number?: string | null
          shipping_cost?: number | null
          status?: string | null
          total_amount?: number | null
          vendor_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          order_id?: string | null
          po_date?: string
          po_number?: string | null
          shipping_cost?: number | null
          status?: string | null
          total_amount?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      returns: {
        Row: {
          charge_cost: boolean
          completed_at: string | null
          created_at: string | null
          id: string
          notes: string | null
          order_item_id: string | null
          quantity: number
          reason: string
          return_cost: number | null
          return_type: string
          status: string
        }
        Insert: {
          charge_cost?: boolean
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          quantity?: number
          reason: string
          return_cost?: number | null
          return_type: string
          status?: string
        }
        Update: {
          charge_cost?: boolean
          completed_at?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          order_item_id?: string | null
          quantity?: number
          reason?: string
          return_cost?: number | null
          return_type?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "returns_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "order_items"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_allocations: {
        Row: {
          created_at: string | null
          demand_line_id: string
          id: string
          note: string | null
          order_qty: number
          shipped_qty: number | null
          status: string
          unit_price: number | null
          updated_at: string | null
          vendor_id: string | null
          vendor_label: string | null
        }
        Insert: {
          created_at?: string | null
          demand_line_id: string
          id?: string
          note?: string | null
          order_qty?: number
          shipped_qty?: number | null
          status?: string
          unit_price?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_label?: string | null
        }
        Update: {
          created_at?: string | null
          demand_line_id?: string
          id?: string
          note?: string | null
          order_qty?: number
          shipped_qty?: number | null
          status?: string
          unit_price?: number | null
          updated_at?: string | null
          vendor_id?: string | null
          vendor_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_allocations_demand_line_id_fkey"
            columns: ["demand_line_id"]
            isOneToOne: false
            referencedRelation: "demand_lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_allocations_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_jobs: {
        Row: {
          branch_id: string | null
          created_at: string | null
          delivery_note: string | null
          id: string
          note: string | null
          requester: string | null
          status: string
          title: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string | null
          delivery_note?: string | null
          id?: string
          note?: string | null
          requester?: string | null
          status?: string
          title: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string | null
          delivery_note?: string | null
          id?: string
          note?: string | null
          requester?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_jobs_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      sourcing_settlements: {
        Row: {
          created_at: string | null
          doc_url: string | null
          id: string
          job_id: string
          note: string | null
          settled: boolean
          shipping_fee: number
          updated_at: string | null
          vendor_id: string | null
          vendor_label: string | null
        }
        Insert: {
          created_at?: string | null
          doc_url?: string | null
          id?: string
          job_id: string
          note?: string | null
          settled?: boolean
          shipping_fee?: number
          updated_at?: string | null
          vendor_id?: string | null
          vendor_label?: string | null
        }
        Update: {
          created_at?: string | null
          doc_url?: string | null
          id?: string
          job_id?: string
          note?: string | null
          settled?: boolean
          shipping_fee?: number
          updated_at?: string | null
          vendor_id?: string | null
          vendor_label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sourcing_settlements_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "sourcing_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sourcing_settlements_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_products: {
        Row: {
          id: string
          is_lowest: boolean | null
          last_updated: string | null
          product_id: string
          unit_price: number | null
          vendor_id: string
        }
        Insert: {
          id?: string
          is_lowest?: boolean | null
          last_updated?: string | null
          product_id: string
          unit_price?: number | null
          vendor_id: string
        }
        Update: {
          id?: string
          is_lowest?: boolean | null
          last_updated?: string | null
          product_id?: string
          unit_price?: number | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_products_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_supply_status: {
        Row: {
          id: string
          lead_time_days: number | null
          note: string | null
          product_id: string
          supply_status: string
          updated_at: string | null
          vendor_id: string
        }
        Insert: {
          id?: string
          lead_time_days?: number | null
          note?: string | null
          product_id: string
          supply_status?: string
          updated_at?: string | null
          vendor_id: string
        }
        Update: {
          id?: string
          lead_time_days?: number | null
          note?: string | null
          product_id?: string
          supply_status?: string
          updated_at?: string | null
          vendor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_supply_status_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_supply_status_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          auto_order_enabled: boolean | null
          category: string | null
          created_at: string | null
          delivery_note: string | null
          extra_note: string | null
          free_shipping_min: number | null
          id: string
          min_order_note: string | null
          name: string
          payment_method: string | null
          return_policy: string | null
          shipping_fee: number | null
          shipping_policy: string
          website_url: string | null
        }
        Insert: {
          auto_order_enabled?: boolean | null
          category?: string | null
          created_at?: string | null
          delivery_note?: string | null
          extra_note?: string | null
          free_shipping_min?: number | null
          id?: string
          min_order_note?: string | null
          name: string
          payment_method?: string | null
          return_policy?: string | null
          shipping_fee?: number | null
          shipping_policy?: string
          website_url?: string | null
        }
        Update: {
          auto_order_enabled?: boolean | null
          category?: string | null
          created_at?: string | null
          delivery_note?: string | null
          extra_note?: string | null
          free_shipping_min?: number | null
          id?: string
          min_order_note?: string | null
          name?: string
          payment_method?: string | null
          return_policy?: string | null
          shipping_fee?: number | null
          shipping_policy?: string
          website_url?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_dashboard_stats: { Args: never; Returns: Json }
      get_price_at: {
        Args: { p_date?: string; p_product_id: string; p_vendor_id: string }
        Returns: number
      }
      next_order_number: { Args: never; Returns: string }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
