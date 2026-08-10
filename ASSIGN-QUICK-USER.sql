-- بعد إنشاء المستخدم في Supabase Authentication استبدل البريد ثم نفّذ هذا الاستعلام.
update public.profiles p
set role = 'quick_user',
    active = true,
    updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('new-user@example.com');
