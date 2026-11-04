/**
 * The one place the JWT signing secret is read.
 *
 * It used to be read in five places, each with its own hardcoded fallback ('dev-secret-change-in-production',
 * 'jwt-secret'). With JWT_SECRET missing from a deployment the API would still start and sign and accept
 * tokens with a secret that is public in the source, so anyone could mint an owner or super-admin token.
 * Now a missing or weak secret stops the server at startup, where it is noticed, instead of failing open.
 */
const KNOWN_PLACEHOLDERS = ['change-me', 'dev-secret', 'jwt-secret', 'secret', 'changeme'];

export function jwtSecret(env: NodeJS.ProcessEnv = process.env): string {
  const value = env.JWT_SECRET?.trim();
  if (!value) {
    throw new Error('JWT_SECRET is not set. Set it in the environment (a random string of at least 32 characters) and restart.');
  }
  if (env.NODE_ENV === 'production') {
    if (KNOWN_PLACEHOLDERS.some((p) => value.toLowerCase().includes(p))) {
      throw new Error('JWT_SECRET is still a placeholder value. Generate a random one for production.');
    }
    if (value.length < 32) throw new Error('JWT_SECRET is too short for production: use at least 32 random characters.');
  }
  return value;
}

/** Same rule, reading through Nest's ConfigService so a value from .env counts. */
export function jwtSecretFrom(config: { get<T = string>(key: string): T | undefined }): string {
  return jwtSecret({ ...process.env, JWT_SECRET: config.get<string>('JWT_SECRET') });
}
