export type SignupPayload = {
  email: string;
  cats: string;
  priority: string;
};

export function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function submitSignup(payload: SignupPayload) {
  // TODO: Connect to Google Forms, Supabase, Formspree, Firebase, or a custom API.
  console.log('[signup]', payload);
  await new Promise((resolve) => setTimeout(resolve, 350));
}
