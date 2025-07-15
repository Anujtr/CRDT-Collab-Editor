import Joi from 'joi';
import logger from '../utils/logger';

interface AppConfig {
  PORT: number;
  NODE_ENV: string;
  JWT_SECRET: string;
  JWT_EXPIRATION: string;
  CLIENT_URL: string;
  REDIS_HOST?: string;
  REDIS_PORT?: number;
  REDIS_PASSWORD?: string;
  REDIS_DB?: number;
}

const configSchema = Joi.object<AppConfig>({
  PORT: Joi.number().port().default(8080),
  NODE_ENV: Joi.string().valid('development', 'production', 'test').default('development'),
  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET must be at least 32 characters long for security',
    'any.required': 'JWT_SECRET is required'
  }),
  JWT_EXPIRATION: Joi.string().default('24h'),
  CLIENT_URL: Joi.string().uri().default('http://localhost:3000'),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  REDIS_PASSWORD: Joi.string().allow('').optional(),
  REDIS_DB: Joi.number().min(0).max(15).default(0)
});

export function validateConfig(): AppConfig {
  const config = {
    PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : undefined,
    NODE_ENV: process.env.NODE_ENV,
    JWT_SECRET: process.env.JWT_SECRET,
    JWT_EXPIRATION: process.env.JWT_EXPIRATION,
    CLIENT_URL: process.env.CLIENT_URL,
    REDIS_HOST: process.env.REDIS_HOST,
    REDIS_PORT: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT, 10) : undefined,
    REDIS_PASSWORD: process.env.REDIS_PASSWORD,
    REDIS_DB: process.env.REDIS_DB ? parseInt(process.env.REDIS_DB, 10) : undefined
  };

  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: true,
    stripUnknown: true
  });

  if (error) {
    const errorMessages = error.details.map(detail => detail.message);
    logger.error('Configuration validation failed', {
      errors: errorMessages,
      providedConfig: Object.keys(config).reduce((acc, key) => {
        // Hide sensitive values in logs
        const sensitiveKeys = ['JWT_SECRET', 'REDIS_PASSWORD'];
        acc[key] = sensitiveKeys.includes(key) ? '***HIDDEN***' : config[key as keyof typeof config];
        return acc;
      }, {} as any)
    });
    
    throw new Error(`Configuration validation failed:\n${errorMessages.join('\n')}`);
  }

  logger.info('Configuration validated successfully', {
    NODE_ENV: value.NODE_ENV,
    PORT: value.PORT,
    CLIENT_URL: value.CLIENT_URL,
    REDIS_HOST: value.REDIS_HOST,
    REDIS_PORT: value.REDIS_PORT,
    REDIS_DB: value.REDIS_DB,
    JWT_EXPIRATION: value.JWT_EXPIRATION
  });

  return value;
}

export function getRequiredEnvVars(): string[] {
  return [
    'JWT_SECRET'
  ];
}

export function getOptionalEnvVars(): string[] {
  return [
    'PORT',
    'NODE_ENV',
    'JWT_EXPIRATION',
    'CLIENT_URL',
    'REDIS_HOST',
    'REDIS_PORT',
    'REDIS_PASSWORD',
    'REDIS_DB'
  ];
}

export function checkEnvironmentSetup(): void {
  const requiredVars = getRequiredEnvVars();
  const missing = requiredVars.filter(varName => !process.env[varName]);
  
  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    console.error('\n❌ Missing required environment variables:');
    missing.forEach(varName => {
      console.error(`   - ${varName}`);
    });
    console.error('\n💡 Please check your .env file or environment configuration.');
    console.error('   You can use .env.example as a template.\n');
    process.exit(1);
  }
  
  logger.info('Environment variables check passed');
}