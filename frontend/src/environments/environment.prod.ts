/**
 * Production environment configuration.
 * These should be set during the CI/CD build process.
 */
export const environment = {
  production: true,
  version: '3.0.0',
  supabaseUrl: 'https://your-project-id.supabase.co',
  supabaseAnonKey: 'your-anon-key-here',
  allowedEmailDomain: 'anu.edu.au',
  apiBaseUrl: '/api',
};
