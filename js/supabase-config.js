// Supabase configuration
const SUPABASE_URL = 'https://jsoimvehzrkroxxblibc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impzb2ltdmVoenJrcm94eGJsaWJjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxMTg2NDYsImV4cCI6MjA4NzY5NDY0Nn0.Sq8AUeft5ZVrYSqNoVJEsye16phzEU9xNfOnO6i3eXY';

// Initialize Supabase client - создаем глобальную переменную
window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

console.log('Supabase initialized with URL:', SUPABASE_URL);
