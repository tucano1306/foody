const configuration = () => ({
  port: Number.parseInt(process.env.PORT ?? '3001', 10),
  database: {
    url: process.env.DATABASE_URL ?? 'postgresql://foody:foody_secret@localhost:5432/foody',
  },
  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'fallback-dev-secret-change-in-production',
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
  webUrl: process.env.WEB_URL ?? 'http://localhost:3000',
});

export default configuration;
