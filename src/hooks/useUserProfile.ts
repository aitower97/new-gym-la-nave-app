import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUserProfile() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email || '');
      const { data } = await supabase
        .from('profiles')
        .select('avatar_url, username, full_name')
        .eq('id', user.id)
        .single();
      if (data) {
        setAvatarUrl(data.avatar_url);
        setFullName(data.username || data.full_name || '');
      }
    }
    load();
  }, []);

  return { avatarUrl, userId, fullName, email };
}
