// Supabase configuration
const supabaseUrl = 'https://wfqiiqaplrrqtrgzmlor.supabase.co'; // Замените на ваш URL
const supabaseAnonKey = 'sb_publishable_2s1h8jJ8a6ASlWeJUg3K0Q_8pk5Aw8s'; // Замените на ваш anon key

// Initialize Supabase client
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Make globally available
window.supabase = supabase;

console.log('Supabase initialized with project:', supabaseUrl);
