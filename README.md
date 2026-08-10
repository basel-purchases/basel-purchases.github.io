# Basel Purchases — V9.3 (Supabase)

نسخة V9.3 مبنية فوق V9.2 وتضيف تحكمًا أوضح بالتحديث والصلاحيات.

## الجديد في V9.3

- قسم **طلبات جديدة** لم يعد يدخل في التحديث التلقائي كل 30 ثانية، لذلك لا يعاد إنشاء روابط الصور وإعادة تحميلها دوريًا.
- أضيف زر **↻ تحديث البيانات** داخل قسم **طلبات جديدة**؛ التحديث في هذا القسم أصبح يدويًا، باستثناء التحديث الطبيعي مباشرة بعد إضافة/تعديل/حذف طلب أو صورة من نفس الجهاز.
- التحديث التلقائي بقي لقسم **الطلبات الحالية** فقط للرولين الحاليين `admin` و`user`.
- أضيف رول جديد باسم `quick_user`.
- `admin` و`user` يستطيعان فتح:
  - الطلبات الحالية (طلبات شراء المواد + أوامر التشغيل).
  - الطلبات الجديدة.
- `quick_user` يستطيع فتح **الطلبات الجديدة فقط**، ويختفي عنه تاب الطلبات الحالية وزر إضافة طلب شراء/أمر تشغيل.
- الحماية ليست واجهة فقط: Patch قاعدة البيانات يطبق RLS على الطلبات الحالية وبنودها وملاحظاتها ومرفقاتها وسجل الحذف وملفات Storage التابعة لها.

## قاعدة البيانات المطلوبة

نفّذ مرة واحدة من **Supabase > SQL Editor**:

`basel-purchases-v9.3-quick-role-manual-refresh.sql`

أو الملف المكافئ:

`supabase-patch-v9.sql`

بعد إنشاء المستخدم من Supabase Authentication، يمكن تعيين الرول الجديدة له بهذا الشكل بعد استبدال البريد:

```sql
update public.profiles p
set role = 'quick_user', active = true, updated_at = now()
from auth.users u
where p.id = u.id
  and lower(u.email) = lower('new-user@example.com');
```

## نسخة ملفات الواجهة

- `css/style.css?v=9.3.0-20260810`
- `js/app.js?v=9.3.0-20260810`


## V9.4
- Quick requests now use the label **مكان الطلب**.
- The location is emphasized on each card and can be changed from a one-field dialog.
- A quick request can be marked **تم إنشاء طلب الشراء**; completed cards appear green.
- Quick requests can be filtered by purchase-request creation status; **not created** is the default.
- Run `basel-purchases-v9.4-quick-purchase-status.sql` once in Supabase before deploying this version.
