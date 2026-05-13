/**
 * Production environment configuration.
 * These should be set during the CI/CD build process.
 */
export const environment = {
  production: true,
  supabaseUrl: 'https://your-project-id.supabase.co',
  supabaseAnonKey: 'your-anon-key-here',
  allowedEmailDomain: 'anu.edu.au',
  apiBaseUrl: '/api',
};
