// هذا المفتاح Publishable ومصمم للاستخدام في واجهة المتصفح العامة.
// لا تضع هنا sb_secret أو service_role أو كلمة مرور قاعدة البيانات.
const SUPABASE_URL = "https://oevajjcixdtrcnmohroq.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_pGIru871bsN40h5_q-q7uw_gndKjMoZ";

window.purchaseSupabase = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  }
);
