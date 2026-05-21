/**
 * Production environment configuration.
 * These should be set during the CI/CD build process.
 */
export const environment = {
  production: true,
  version: '3.1.3',
  supabaseUrl: 'https://your-project-id.supabase.co',
  supabaseAnonKey: 'your-anon-key-here',
  allowedEmailDomain: 'anu.edu.au',
  apiBaseUrl: '/api',
};
