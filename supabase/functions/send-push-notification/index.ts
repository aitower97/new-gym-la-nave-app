import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

interface PushPayload {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

serve(async (req) => {
  try {
    const { userIds, title, body, data } = (await req.json()) as PushPayload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const response = await fetch(
      `${supabaseUrl}/rest/v1/push_tokens?select=token&user_id=in.(%24{userIds.join(',')})`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    const tokens: { token: string }[] = await response.json();

    if (!tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title,
      body,
      data: data || {},
    }));

    const pushResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(messages),
    });

    const result = await pushResponse.json();

    return new Response(JSON.stringify(result), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
