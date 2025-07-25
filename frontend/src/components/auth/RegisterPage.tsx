import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, FileText, UserPlus, Check, X } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { RegisterFormData } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { cn, isValidEmail, isValidUsername, getPasswordStrength } from '../../utils';
import { toast } from 'react-hot-toast';

export function RegisterPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register: registerUser, isAuthenticated, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    watch,
    setError,
  } = useForm<RegisterFormData>();

  const watchedPassword = watch('password', '');
  const passwordStrength = getPasswordStrength(watchedPassword);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate]);

  // Clear any auth errors when component mounts
  useEffect(() => {
    clearError();
  }, [clearError]);

  // Show error toast when auth error occurs
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const onSubmit = async (data: RegisterFormData) => {
    try {
      await registerUser(data.username, data.email, data.password);
      toast.success('Account created successfully! Welcome!');
      navigate('/', { replace: true });
    } catch (error) {
      console.error('Registration error:', error);
      
      // Set form-specific errors
      if (error instanceof Error) {
        if (error.message.includes('username')) {
          setError('username', { message: 'Username is already taken' });
        } else if (error.message.includes('email')) {
          setError('email', { message: 'Email is already registered' });
        } else {
          setError('root', { message: error.message });
        }
      }
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleConfirmPasswordVisibility = () => {
    setShowConfirmPassword(!showConfirmPassword);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Checking authentication..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex items-center gap-2">
            <FileText className="h-8 w-8 text-blue-600" />
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              CRDT Editor
            </span>
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900 dark:text-white">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
          Or{' '}
          <Link
            to="/login"
            className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300"
          >
            sign in to your existing account
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white dark:bg-gray-800 py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Username */}
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Username
              </label>
              <div className="mt-1">
                <input
                  {...register('username', {
                    required: 'Username is required',
                    minLength: {
                      value: 3,
                      message: 'Username must be at least 3 characters'
                    },
                    maxLength: {
                      value: 30,
                      message: 'Username must be less than 30 characters'
                    },
                    validate: (value) => {
                      if (!isValidUsername(value)) {
                        return 'Username can only contain letters, numbers, and underscores';
                      }
                      return true;
                    }
                  })}
                  id="username"
                  type="text"
                  autoComplete="username"
                  className={cn(
                    'appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
                    errors.username && 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  )}
                  placeholder="Choose a username"
                />
                {errors.username && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {errors.username.message}
                  </p>
                )}
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  3-30 characters, letters, numbers, and underscores only
                </p>
              </div>
            </div>

            {/* Email */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Email address
              </label>
              <div className="mt-1">
                <input
                  {...register('email', {
                    required: 'Email is required',
                    validate: (value) => {
                      if (!isValidEmail(value)) {
                        return 'Please enter a valid email address';
                      }
                      return true;
                    }
                  })}
                  id="email"
                  type="email"
                  autoComplete="email"
                  className={cn(
                    'appearance-none block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
                    errors.email && 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  )}
                  placeholder="Enter your email"
                />
                {errors.email && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {errors.email.message}
                  </p>
                )}
              </div>
            </div>

            {/* Password */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <div className="mt-1 relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 8,
                      message: 'Password must be at least 8 characters'
                    },
                    validate: (value) => {
                      if (!/(?=.*[a-z])/.test(value)) {
                        return 'Password must contain at least one lowercase letter';
                      }
                      if (!/(?=.*[A-Z])/.test(value)) {
                        return 'Password must contain at least one uppercase letter';
                      }
                      if (!/(?=.*\d)/.test(value)) {
                        return 'Password must contain at least one number';
                      }
                      if (!/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?])/.test(value)) {
                        return 'Password must contain at least one special character';
                      }
                      return true;
                    }
                  })}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={cn(
                    'appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
                    errors.password && 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  )}
                  placeholder="Create a password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400 hover:text-gray-500" />
                  )}
                </button>
              </div>

              {/* Password strength indicator */}
              {watchedPassword && (
                <div className="mt-2">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                      <div
                        className={cn(
                          'h-1 rounded-full transition-all duration-300',
                          passwordStrength.score <= 2 ? 'bg-red-500' :
                          passwordStrength.score <= 4 ? 'bg-yellow-500' :
                          'bg-green-500'
                        )}
                        style={{ width: `${(passwordStrength.score / 6) * 100}%` }}
                      />
                    </div>
                    <span className={cn('text-xs font-medium', passwordStrength.color)}>
                      {passwordStrength.label}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <div className="flex items-center gap-1">
                      {/(?=.*[a-z])/.test(watchedPassword) ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-gray-400" />
                      )}
                      <span className="text-gray-600 dark:text-gray-400">Lowercase</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/(?=.*[A-Z])/.test(watchedPassword) ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-gray-400" />
                      )}
                      <span className="text-gray-600 dark:text-gray-400">Uppercase</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/(?=.*\d)/.test(watchedPassword) ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-gray-400" />
                      )}
                      <span className="text-gray-600 dark:text-gray-400">Number</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {/(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?])/.test(watchedPassword) ? (
                        <Check className="h-3 w-3 text-green-500" />
                      ) : (
                        <X className="h-3 w-3 text-gray-400" />
                      )}
                      <span className="text-gray-600 dark:text-gray-400">Special</span>
                    </div>
                  </div>
                </div>
              )}

              {errors.password && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Confirm password
              </label>
              <div className="mt-1 relative">
                <input
                  {...register('confirmPassword', {
                    required: 'Please confirm your password',
                    validate: (value) => {
                      if (value !== watchedPassword) {
                        return 'Passwords do not match';
                      }
                      return true;
                    }
                  })}
                  id="confirmPassword"
                  type={showConfirmPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  className={cn(
                    'appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm placeholder-gray-400 dark:placeholder-gray-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm',
                    errors.confirmPassword && 'border-red-300 focus:border-red-500 focus:ring-red-500'
                  )}
                  placeholder="Confirm your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={toggleConfirmPasswordVisibility}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400 hover:text-gray-500" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400 hover:text-gray-500" />
                  )}
                </button>
                {errors.confirmPassword && (
                  <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                    {errors.confirmPassword.message}
                  </p>
                )}
              </div>
            </div>

            {/* Submit button */}
            <div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? (
                  <LoadingSpinner size="sm" color="white" />
                ) : (
                  <>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Create account
                  </>
                )}
              </button>
            </div>

            {/* Root error */}
            {errors.root && (
              <div className="rounded-md bg-red-50 dark:bg-red-900 p-4">
                <p className="text-sm text-red-600 dark:text-red-400">
                  {errors.root.message}
                </p>
              </div>
            )}
          </form>

          {/* Terms and Privacy */}
          <div className="mt-6 text-center">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              By creating an account, you agree to our{' '}
              <Link to="/terms" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link to="/privacy" className="text-blue-600 hover:text-blue-500 dark:text-blue-400">
                Privacy Policy
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}