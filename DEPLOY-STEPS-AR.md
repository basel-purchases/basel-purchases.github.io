# خطوات نشر V9.3

1. افتح **Supabase > SQL Editor**.
2. شغّل ملف `basel-purchases-v9.3-quick-role-manual-refresh.sql` مرة واحدة.
3. ارفع ملفات المشروع الجديدة واستبدل النسخة القديمة.
4. أنشئ المستخدم الجديد من **Supabase Authentication** بالطريقة المعتادة.
5. عيّن له الرول `quick_user` عبر الاستعلام الموجود في ملف SQL أو README.
6. سجّل الدخول بالمستخدم الجديد وتأكد أن الظاهر له هو **طلبات جديدة فقط**.
7. سجّل الدخول بمستخدم `admin` أو `user` وتأكد أن الطلبات الحالية ما زالت متاحة.
8. في قسم **طلبات جديدة** تأكد أن الصور لا تعاد كل 30 ثانية، واستخدم زر **↻ تحديث البيانات** لجلب آخر البيانات يدويًا.

## استعلام تعيين الرول الجديدة

```sql
update public.profiles p
set role = 'quick_user', active = true, updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('new-user@example.com');
```
