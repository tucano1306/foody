function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`Missing required environment variable: ${key}`);
  return value;
}

const configuration = () => ({
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://foody:foody_secret@localhost:5432/foody',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.NODE_ENV === 'production' ? requireEnv('JWT_SECRET') : (process.env.JWT_SECRET ?? 'dev-only-secret-not-for-production'),
    expiresIn: '7d',
  },
  aws: {
    region: process.env.AWS_REGION ?? 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
    s3Bucket: process.env.AWS_S3_BUCKET ?? 'foody-product-photos',
  },
  onesignal: {
    appId: process.env.ONESIGNAL_APP_ID ?? '',
    apiKey: process.env.ONESIGNAL_API_KEY ?? '',
  },
  webAppUrl: process.env.WEB_APP_URL ?? 'https://foody-web-eight.vercel.app',
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
});

export default configuration;
