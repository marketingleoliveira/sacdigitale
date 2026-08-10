import { useState, useEffect, useContext, ReactNode, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { AuthContext, type AppRole } from './auth-context';

export type { AppRole };

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [role, setRole] = useState<AppRole | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const roleRequestId = useRef(0);

  const fetchUserRole = async (userId: string): Promise<{ role: AppRole | null; displayName: string | null }> => {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role, display_name')
        .eq('user_id', userId)
        .in('role', ['admin', 'desenvolvedor', 'qualidade', 'gerencia', 'vendas'])
        .maybeSingle();

      if (error) {
        console.error('Error checking role:', error);
        return { role: null, displayName: null };
      }

      return {
        role: (data?.role as AppRole) ?? null,
        displayName: (data as { display_name?: string | null } | null)?.display_name ?? null,
      };
    } catch (error) {
      console.error('Error checking role:', error);
      return { role: null, displayName: null };
    }
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        const requestId = ++roleRequestId.current;
        setSession(session);
        setUser(session?.user ?? null);
        // Never retain permissions from a previous session while the new role loads.
        setRole(null);
        setDisplayName(null);
        
        if (session?.user) {
          setTimeout(async () => {
            const r = await fetchUserRole(session.user.id);
            if (requestId !== roleRequestId.current) return;
            setRole(r.role);
            setDisplayName(r.displayName);
            setIsLoading(false);
          }, 0);
        } else {
          setRole(null);
          setDisplayName(null);
          setIsLoading(false);
        }
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      const requestId = ++roleRequestId.current;
      setSession(session);
      setUser(session?.user ?? null);
      setRole(null);
      setDisplayName(null);
      
      if (session?.user) {
        fetchUserRole(session.user.id).then((r) => {
          if (requestId !== roleRequestId.current) return;
          setRole(r.role);
          setDisplayName(r.displayName);
          setIsLoading(false);
        });
      } else {
        setIsLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/admin`,
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setDisplayName(null);
  };

  const isAdmin = role !== null;
  const isSuperAdmin = role === 'admin' || role === 'desenvolvedor';
  const canManageUsers = isSuperAdmin || role === 'gerencia';
  const canDelete = isSuperAdmin;
  const isVendas = role === 'vendas';
  const canAccessExternal = isAdmin && !isVendas;

  return (
    <AuthContext.Provider value={{ user, session, isLoading, isAdmin, role, displayName, isSuperAdmin, canManageUsers, canDelete, canAccessExternal, isVendas, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
