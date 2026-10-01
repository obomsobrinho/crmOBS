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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      agent_publications: {
        Row: {
          client_id: string
          config: Json | null
          id: number
          persona: string
          prompt_mode: string
          published_at: string
          published_by: string | null
        }
        Insert: {
          client_id: string
          config?: Json | null
          id?: number
          persona: string
          prompt_mode: string
          published_at?: string
          published_by?: string | null
        }
        Update: {
          client_id?: string
          config?: Json | null
          id?: number
          persona?: string
          prompt_mode?: string
          published_at?: string
          published_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_publications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_turns: {
        Row: {
          action: string
          cached_input_tokens: number | null
          client_id: string
          created_at: string
          dry_run: boolean
          guardrail_blocked: boolean
          guardrail_reason: string | null
          id: number
          input_tokens: number | null
          latency_ms: number
          messages_sent: number
          model: string | null
          output_tokens: number | null
          phone: string
          rag_matches: number
          rag_searched: boolean
          rag_top_similarity: number | null
          silenced: string | null
        }
        Insert: {
          action: string
          cached_input_tokens?: number | null
          client_id: string
          created_at?: string
          dry_run?: boolean
          guardrail_blocked?: boolean
          guardrail_reason?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms: number
          messages_sent?: number
          model?: string | null
          output_tokens?: number | null
          phone: string
          rag_matches?: number
          rag_searched?: boolean
          rag_top_similarity?: number | null
          silenced?: string | null
        }
        Update: {
          action?: string
          cached_input_tokens?: number | null
          client_id?: string
          created_at?: string
          dry_run?: boolean
          guardrail_blocked?: boolean
          guardrail_reason?: string | null
          id?: never
          input_tokens?: number | null
          latency_ms?: number
          messages_sent?: number
          model?: string | null
          output_tokens?: number | null
          phone?: string
          rag_matches?: number
          rag_searched?: boolean
          rag_top_similarity?: number | null
          silenced?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_turns_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          asaas_event_id: string
          client_id: string | null
          created_at: string
          error: string | null
          event: string
          id: number
          payload: Json
          processed_at: string | null
        }
        Insert: {
          asaas_event_id: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          event: string
          id?: never
          payload: Json
          processed_at?: string | null
        }
        Update: {
          asaas_event_id?: string
          client_id?: string | null
          created_at?: string
          error?: string | null
          event?: string
          id?: never
          payload?: Json
          processed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          active: boolean | null
          bot_message: string | null
          client_id: string
          created_at: string | null
          id: number
          media_type: string | null
          media_url: string | null
          message_type: string | null
          nomewpp: string | null
          phone: string
          sender_user_id: string | null
          user_message: string | null
        }
        Insert: {
          active?: boolean | null
          bot_message?: string | null
          client_id: string
          created_at?: string | null
          id?: number
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          nomewpp?: string | null
          phone: string
          sender_user_id?: string | null
          user_message?: string | null
        }
        Update: {
          active?: boolean | null
          bot_message?: string | null
          client_id?: string
          created_at?: string | null
          id?: number
          media_type?: string | null
          media_url?: string | null
          message_type?: string | null
          nomewpp?: string | null
          phone?: string
          sender_user_id?: string | null
          user_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          account_type: string | null
          agent_config: Json | null
          agent_config_updated_at: string | null
          agent_enabled: boolean
          agent_published_at: string | null
          billing_customer_id: string | null
          billing_plan: string | null
          billing_provider: string | null
          billing_seats: number | null
          billing_subscription_id: string | null
          billing_updated_at: string | null
          created_at: string
          evolution_instance: string | null
          grace_until: string | null
          id: string
          imported_at: string | null
          name: string
          notify_group_jid: string | null
          onboarding_tested_at: string | null
          persona: string | null
          prompt_mode: string
          subscription_status: string
          trial_ends_at: string | null
        }
        Insert: {
          account_type?: string | null
          agent_config?: Json | null
          agent_config_updated_at?: string | null
          agent_enabled?: boolean
          agent_published_at?: string | null
          billing_customer_id?: string | null
          billing_plan?: string | null
          billing_provider?: string | null
          billing_seats?: number | null
          billing_subscription_id?: string | null
          billing_updated_at?: string | null
          created_at?: string
          evolution_instance?: string | null
          grace_until?: string | null
          id?: string
          imported_at?: string | null
          name: string
          notify_group_jid?: string | null
          onboarding_tested_at?: string | null
          persona?: string | null
          prompt_mode?: string
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Update: {
          account_type?: string | null
          agent_config?: Json | null
          agent_config_updated_at?: string | null
          agent_enabled?: boolean
          agent_published_at?: string | null
          billing_customer_id?: string | null
          billing_plan?: string | null
          billing_provider?: string | null
          billing_seats?: number | null
          billing_subscription_id?: string | null
          billing_updated_at?: string | null
          created_at?: string
          evolution_instance?: string | null
          grace_until?: string | null
          id?: string
          imported_at?: string | null
          name?: string
          notify_group_jid?: string | null
          onboarding_tested_at?: string | null
          persona?: string | null
          prompt_mode?: string
          subscription_status?: string
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      conversation_notes: {
        Row: {
          author_user_id: string | null
          body: string
          client_id: string
          conversation_id: number
          created_at: string
          id: number
        }
        Insert: {
          author_user_id?: string | null
          body: string
          client_id: string
          conversation_id: number
          created_at?: string
          id?: never
        }
        Update: {
          author_user_id?: string | null
          body?: string
          client_id?: string
          conversation_id?: number
          created_at?: string
          id?: never
        }
        Relationships: [
          {
            foreignKeyName: "conversation_notes_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_notes_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_qualifications: {
        Row: {
          action: string
          client_id: string
          created_at: string
          id: number
          phone: string
          preferencia_horario: string | null
          summary: string | null
        }
        Insert: {
          action?: string
          client_id: string
          created_at?: string
          id?: never
          phone: string
          preferencia_horario?: string | null
          summary?: string | null
        }
        Update: {
          action?: string
          client_id?: string
          created_at?: string
          id?: never
          phone?: string
          preferencia_horario?: string | null
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversation_qualifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_tags: {
        Row: {
          client_id: string
          conversation_id: number
          created_at: string
          tag_id: number
        }
        Insert: {
          client_id: string
          conversation_id: number
          created_at?: string
          tag_id: number
        }
        Update: {
          client_id?: string
          conversation_id?: number
          created_at?: string
          tag_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_user_id: string | null
          client_id: string
          created_at: string
          handoff_at: string | null
          id: number
          last_message_at: string | null
          last_message_from: string | null
          last_message_preview: string | null
          pending_instruction: string | null
          pending_instruction_at: string | null
          pending_instruction_by: string | null
          phone: string
          stage: string | null
          stage_changed_at: string | null
          stage_source: string | null
          status: string
          unread_count: number
        }
        Insert: {
          assigned_user_id?: string | null
          client_id: string
          created_at?: string
          handoff_at?: string | null
          id?: never
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_preview?: string | null
          pending_instruction?: string | null
          pending_instruction_at?: string | null
          pending_instruction_by?: string | null
          phone: string
          stage?: string | null
          stage_changed_at?: string | null
          stage_source?: string | null
          status?: string
          unread_count?: number
        }
        Update: {
          assigned_user_id?: string | null
          client_id?: string
          created_at?: string
          handoff_at?: string | null
          id?: never
          last_message_at?: string | null
          last_message_from?: string | null
          last_message_preview?: string | null
          pending_instruction?: string | null
          pending_instruction_at?: string | null
          pending_instruction_by?: string | null
          phone?: string
          stage?: string | null
          stage_changed_at?: string | null
          stage_source?: string | null
          status?: string
          unread_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversations_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_stage_fkey"
            columns: ["client_id", "stage"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["client_id", "key"]
          },
        ]
      }
      dados_cliente: {
        Row: {
          atendimento_ia: string | null
          birth_date: string | null
          client_id: string
          created_at: string | null
          custom_fields: Json
          display_name: string | null
          email: string | null
          foto_em: string | null
          foto_origem: string | null
          foto_path: string | null
          id: number
          nomewpp: string | null
          telefone: string
        }
        Insert: {
          atendimento_ia?: string | null
          birth_date?: string | null
          client_id: string
          created_at?: string | null
          custom_fields?: Json
          display_name?: string | null
          email?: string | null
          foto_em?: string | null
          foto_origem?: string | null
          foto_path?: string | null
          id?: number
          nomewpp?: string | null
          telefone: string
        }
        Update: {
          atendimento_ia?: string | null
          birth_date?: string | null
          client_id?: string
          created_at?: string | null
          custom_fields?: Json
          display_name?: string | null
          email?: string | null
          foto_em?: string | null
          foto_origem?: string | null
          foto_path?: string | null
          id?: number
          nomewpp?: string | null
          telefone?: string
        }
        Relationships: [
          {
            foreignKeyName: "dados_cliente_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          client_id: string
          created_at: string
          id: number
          message: string
          path: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: never
          message: string
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: never
          message?: string
          path?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feedback_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      handoffs: {
        Row: {
          client_id: string
          closed_at: string | null
          closed_by: string | null
          closed_how: string | null
          id: number
          instruction: string | null
          opened_at: string
          phone: string
          summary: string | null
        }
        Insert: {
          client_id: string
          closed_at?: string | null
          closed_by?: string | null
          closed_how?: string | null
          id?: never
          instruction?: string | null
          opened_at?: string
          phone: string
          summary?: string | null
        }
        Update: {
          client_id?: string
          closed_at?: string | null
          closed_by?: string | null
          closed_how?: string | null
          id?: never
          instruction?: string | null
          opened_at?: string
          phone?: string
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "handoffs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_chunks: {
        Row: {
          chunk_index: number
          client_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string | null
          id: number
          token_count: number | null
        }
        Insert: {
          chunk_index: number
          client_id: string
          content: string
          created_at?: string
          document_id: string
          embedding?: string | null
          id?: never
          token_count?: number | null
        }
        Update: {
          chunk_index?: number
          client_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string | null
          id?: never
          token_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_chunks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "knowledge_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_documents: {
        Row: {
          byte_size: number | null
          chunk_count: number
          client_id: string
          created_at: string
          embedding_model: string
          error: string | null
          id: string
          mime_type: string | null
          status: string
          storage_path: string
          title: string
          uploaded_by: string | null
        }
        Insert: {
          byte_size?: number | null
          chunk_count?: number
          client_id: string
          created_at?: string
          embedding_model?: string
          error?: string | null
          id?: string
          mime_type?: string | null
          status?: string
          storage_path: string
          title: string
          uploaded_by?: string | null
        }
        Update: {
          byte_size?: number | null
          chunk_count?: number
          client_id?: string
          created_at?: string
          embedding_model?: string
          error?: string | null
          id?: string
          mime_type?: string | null
          status?: string
          storage_path?: string
          title?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          archived: boolean
          client_id: string
          color: string
          created_at: string
          id: number
          is_canonical: boolean
          is_default: boolean
          key: string
          name: string
          position: number
        }
        Insert: {
          archived?: boolean
          client_id: string
          color?: string
          created_at?: string
          id?: never
          is_canonical?: boolean
          is_default?: boolean
          key: string
          name: string
          position?: number
        }
        Update: {
          archived?: boolean
          client_id?: string
          color?: string
          created_at?: string
          id?: never
          is_canonical?: boolean
          is_default?: boolean
          key?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_replies: {
        Row: {
          body: string
          client_id: string
          created_at: string
          id: number
          title: string
        }
        Insert: {
          body: string
          client_id: string
          created_at?: string
          id?: never
          title: string
        }
        Update: {
          body?: string
          client_id?: string
          created_at?: string
          id?: never
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_replies_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      signup_attempts: {
        Row: {
          created_at: string
          email: string | null
          id: number
          ip: string
          ok: boolean
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: never
          ip: string
          ok?: boolean
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: never
          ip?: string
          ok?: boolean
        }
        Relationships: []
      }
      tags: {
        Row: {
          client_id: string
          color: string
          created_at: string
          id: number
          name: string
        }
        Insert: {
          client_id: string
          color?: string
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          client_id?: string
          color?: string
          created_at?: string
          id?: never
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      user_clients: {
        Row: {
          client_id: string
          role: string
          user_id: string
        }
        Insert: {
          client_id: string
          role?: string
          user_id: string
        }
        Update: {
          client_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      chat_resumo_conversa: {
        Args: { p_phone: string }
        Returns: {
          primeira: string
          total: number
        }[]
      }
      clientes_contagens: {
        Args: {
          p_client: string
          p_fora?: string[]
          p_frio_antes?: string
          p_hoje?: string
        }
        Returns: {
          conversa: number
          frio: number
          incompleto: number
          nunca: number
          todos: number
        }[]
      }
      clientes_pagina: {
        Args: {
          p_busca?: string
          p_client: string
          p_cursor_em?: string
          p_cursor_id?: number
          p_filtro?: string
          p_fora?: string[]
          p_frio_antes?: string
          p_hoje?: string
          p_limite?: number
        }
        Returns: {
          assigned_user_id: string
          atendimento_ia: string
          birth_date: string
          conversa_id: number
          created_at: string
          custom_fields: Json
          display_name: string
          email: string
          foto_path: string
          id: number
          k: string
          last_message_at: string
          nomewpp: string
          tags: Json
          telefone: string
        }[]
      }
      inbox_contagens: {
        Args: {
          p_client: string
          p_eu?: string
          p_fora?: string[]
          p_inicio?: string
        }
        Returns: {
          esperando: number
          existe_alguma: boolean
          grupo_ia: number
          grupo_time: number
          sem_resposta: number
          suas: number
          todas: number
        }[]
      }
      inbox_pagina: {
        Args: {
          p_busca?: string
          p_client: string
          p_cursor_em?: string
          p_cursor_grupo?: number
          p_cursor_id?: number
          p_eu?: string
          p_filtro?: string
          p_fora?: string[]
          p_inicio?: string
          p_limite?: number
          p_telefone?: string
        }
        Returns: {
          assigned_user_id: string
          atendimento_ia: string
          display_name: string
          foto_path: string
          grupo: number
          handoff_at: string
          id: number
          last_message_at: string
          last_message_from: string
          last_message_preview: string
          nomewpp: string
          phone: string
          resumo: string
          stage: string
          trecho: string
          unread_count: number
        }[]
      }
      match_knowledge_chunks: {
        Args: {
          p_client_id: string
          p_match_count?: number
          p_query_embedding: string
        }
        Returns: {
          content: string
          document_id: string
          id: number
          similarity: number
        }[]
      }
      painel_janelas: {
        Args: {
          p_agora: string
          p_ate: string[]
          p_client: string
          p_de: string[]
          p_fora: string[]
          p_rapida_ms?: number
        }
        Returns: {
          agendar: number
          conversas: number
          dif_hi: number
          dif_lo: number
          dif_n: number
          dif_rapidas: number
          dif_soma: number
          janela: number
          leads: number
          pausar: number
          pessoas_novas: number
          primeira_em: number
          recebidas: number
          respostas_ia: number
          sem_humano: number
        }[]
      }
      painel_linhas: {
        Args: { p_client: string; p_limite?: number }
        Returns: {
          created_at: string
          message_type: string
          phone: string
          tem_bot: boolean
          tem_user: boolean
        }[]
      }
      painel_series: {
        Args: {
          p_ate: string
          p_client: string
          p_fora: string[]
          p_horas_de: string
          p_mes_ate?: string
          p_mes_de?: string
        }
        Returns: Json
      }
      painel_verbatim: {
        Args: { p_client: string; p_fora?: string[]; p_min?: number }
        Returns: {
          bot_message: string
          conversa_com_humano: boolean
          created_at: string
          message_type: string
          nomewpp: string
          phone: string
          user_message: string
        }[]
      }
      pedidos_contagens: {
        Args: { p_client: string; p_desde?: string; p_fora?: string[] }
        Returns: {
          abertos: number
          resolvidos: number
        }[]
      }
      pedidos_pagina: {
        Args: {
          p_aba?: string
          p_busca?: string
          p_client: string
          p_cursor_em?: string
          p_cursor_id?: number
          p_desde?: string
          p_fora?: string[]
          p_id?: number
          p_limite?: number
          p_telefone?: string
        }
        Returns: {
          closed_at: string
          closed_by: string
          closed_how: string
          display_name: string
          id: number
          instruction: string
          nomewpp: string
          opened_at: string
          phone: string
          posicao: number
          summary: string
          total: number
        }[]
      }
      pipeline_coluna: {
        Args: {
          p_atendente?: string
          p_ativos: string[]
          p_busca?: string
          p_client: string
          p_coluna: string
          p_cursor_em?: string
          p_cursor_id?: number
          p_fora?: string[]
          p_limite?: number
          p_padrao: string
          p_so_esperando?: boolean
          p_telefone?: string
        }
        Returns: {
          assigned_user_id: string
          atendimento_ia: string
          coluna: string
          display_name: string
          foto_path: string
          handoff_at: string
          id: number
          last_message_at: string
          last_message_from: string
          last_message_preview: string
          nomewpp: string
          phone: string
          resumo: string
          stage_source: string
          unread_count: number
        }[]
      }
      pipeline_contagens: {
        Args: {
          p_atendente?: string
          p_ativos: string[]
          p_busca?: string
          p_client: string
          p_fora?: string[]
          p_padrao: string
          p_so_esperando?: boolean
        }
        Returns: {
          coluna: string
          esperando: number
          mais_antigo: string
          total: number
        }[]
      }
      provision_tenant: {
        Args: {
          p_company_name: string
          p_trial_ends_at: string
          p_user_id: string
        }
        Returns: string
      }
      sem_acento: { Args: { t: string }; Returns: string }
      tenant_members: {
        Args: never
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
      tenant_members_do_cliente: {
        Args: { p_client: string }
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
