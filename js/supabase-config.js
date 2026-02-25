// Supabase configuration
const supabaseUrl = 'https://wfqiiqaplrrqtrgzmlor.supabase.co'; // Замените на ваш URL
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcWlpcWFwbHJycXRyZ3ptbG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTE3MzksImV4cCI6MjA4NzQ4NzczOX0.bpPmpgd1a0-vbXucrCnlBEcm1jrLmUiPr6rfXAvUHVo'; // Замените на ваш anon key

// Initialize Supabase client
const supabase = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

// Make globally available
window.supabase = supabase;

console.log('Supabase initialized with project:', supabaseUrl);
