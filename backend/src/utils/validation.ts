import Joi from 'joi';
import { UserRole } from '../../../shared/src/types/auth';
import { PASSWORD_CONFIG } from '../../../shared/src/constants/auth';

export const validationSchemas = {
  register: Joi.object({
    username: Joi.string()
      .trim()
      .alphanum()
      .min(3)
      .max(30)
      .required()
      .messages({
        'string.alphanum': 'Username must contain only alphanumeric characters',
        'string.min': 'Username must be at least 3 characters long',
        'string.max': 'Username must be at most 30 characters long',
        'any.required': 'Username is required'
      }),
    
    email: Joi.string()
      .trim()
      .email()
      .required()
      .messages({
        'string.email': 'Please provide a valid email address',
        'any.required': 'Email is required'
      }),
    
    password: Joi.string()
      .min(PASSWORD_CONFIG.MIN_LENGTH)
      .pattern(new RegExp('^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@$!%*?&])[A-Za-z\\d@$!%*?&]'))
      .required()
      .messages({
        'string.min': `Password must be at least ${PASSWORD_CONFIG.MIN_LENGTH} characters long`,
        'string.pattern.base': 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
        'any.required': 'Password is required'
      }),
    
    role: Joi.string()
      .valid(...Object.values(UserRole))
      .optional()
      .messages({
        'any.only': 'Role must be one of: admin, editor, viewer, user'
      })
  }),

  login: Joi.object({
    username: Joi.string()
      .required()
      .messages({
        'any.required': 'Username is required'
      }),
    
    password: Joi.string()
      .required()
      .messages({
        'any.required': 'Password is required'
      })
  })
};

export const validateRequest = (schema: Joi.ObjectSchema) => {
  return (req: any, res: any, next: any) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      return res.status(400).json({
        success: false,
        error: {
          message: 'Validation error',
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          details: error.details.map(detail => ({
            field: detail.path.join('.'),
            message: detail.message
          }))
        },
        timestamp: new Date()
      });
    }
    
    next();
  };
};

export const sanitizeInput = (input: string): string => {
  return input.trim().toLowerCase();
};

export const validateInput = (schema: Joi.ObjectSchema, data: any) => {
  const { error, value } = schema.validate(data);
  if (error) {
    throw new Error('Validation error');
  }
  return value;
};

export const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const isStrongPassword = (password: string): boolean => {
  const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;
  return strongPasswordRegex.test(password);
};