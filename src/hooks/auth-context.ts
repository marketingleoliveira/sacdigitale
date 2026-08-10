import { createContext } from 'react';
import type { User, Session } from '@supabase/supabase-js';

export type AppRole = 'admin' | 'desenvolvedor' | 'qualidade' | 'gerencia' | 'vendas' | 'user';

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  isAdmin: boolean;
  role: AppRole | null;
  displayName: string | null;
  isSuperAdmin: boolean;
  canManageUsers: boolean;
  canDelete: boolean;
  canAccessExternal: boolean;
  isVendas: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

// Kept in a component-free module so Fast Refresh never recreates the context
// identity while a mounted <AuthProvider> still holds the previous one.
export const AuthContext = createContext<AuthContextType | undefined>(undefined);
