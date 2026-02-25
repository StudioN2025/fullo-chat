// Supabase configuration
const SUPABASE_URL = 'https://wfqiiqaplrrqtrgzmlor.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndmcWlpcWFwbHJycXRyZ3ptbG9yIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5MTE3MzksImV4cCI6MjA4NzQ4NzczOX0.bpPmpgd1a0-vbXucrCnlBEcm1jrLmUiPr6rfXAvUHVo';

// Initialize Supabase client - создаем глобальную переменную
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase initialized with URL:', SUPABASE_URL);
