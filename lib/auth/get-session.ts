import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export interface Session {
  userId: string;
  email: string;
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Can't set cookies in Server Components — the middleware handles refresh.
          }
        },
      },
    }
  );
  // proxy.ts (middleware) already called getUser() to validate the JWT with
  // Supabase. Here we only need to read the already-validated session from the
  // cookie — getSession() does that without a second network round-trip.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return { userId: session.user.id, email: session.user.email ?? '' };
}
