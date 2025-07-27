import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, FileText, LogIn } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { LoginFormData } from '../../types';
import { LoadingSpinner } from '../common/LoadingSpinner';
import { cn } from '../../utils';
import { toast } from 'react-hot-toast';

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const { login, isAuthenticated, isLoading, error, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormData>();

  // Get the intended destination from location state
  const from = (location.state as any)?.from || '/';

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      navigate(from, { replace: true });
    }
  }, [isAuthenticated, isLoading, navigate, from]);

  // Clear any auth errors when component mounts
  useEffect(() => {
    clearError();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Show error toast when auth error occurs
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const onSubmit = async (data: LoginFormData) => {
    try {
      await login(data.username, data.password, data.rememberMe);
      toast.success('Welcome back!');
      navigate(from, { replace: true });
    } catch (error) {
      console.error('Login error:', error);
      
      // Set form-specific errors
      if (error instanceof Error) {
        if (error.message.includes('username')) {
          setError('username', { message: 'Invalid username' });
        } else if (error.message.includes('password')) {
          setError('password', { message: 'Invalid password' });
        } else {
          setError('root', { message: error.message });
        }
      }
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" text="Checking authentication..." />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-200">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-600 rounded-xl flex items-center justify-center shadow-lg">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              CRDT Editor
            </span>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Welcome back
          </h2>
          <p className="mt-3 text-gray-600 dark:text-gray-400">
            Sign in to your account to continue
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card p-8 shadow-xl backdrop-blur-sm animate-slide-up">
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {/* Username */}
            <div className="space-y-2">
              <label htmlFor="username" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                Username
              </label>
              <input
                {...register('username', {
                  required: 'Username is required',
                  minLength: {
                    value: 3,
                    message: 'Username must be at least 3 characters'
                  }
                })}
                id="username"
                type="text"
                autoComplete="username"
                className={cn(
                  'input-field',
                  errors.username && 'border-red-500 focus:border-red-500 focus:ring-red-500'
                )}
                placeholder="Enter your username"
              />
              {errors.username && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                  {errors.username.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div className="space-y-2">
              <label htmlFor="password" className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                Password
              </label>
              <div className="relative">
                <input
                  {...register('password', {
                    required: 'Password is required',
                    minLength: {
                      value: 8,
                      message: 'Password must be at least 8 characters'
                    }
                  })}
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  className={cn(
                    'input-field pr-10',
                    errors.password && 'border-red-500 focus:border-red-500 focus:ring-red-500'
                  )}
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                  onClick={togglePasswordVisibility}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Remember me */}
            <div className="flex items-center justify-between pt-2">
              <div className="flex items-center">
                <input
                  {...register('rememberMe')}
                  id="rememberMe"
                  type="checkbox"
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 dark:border-gray-600 rounded transition-colors"
                />
                <label htmlFor="rememberMe" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
                  Remember me
                </label>
              </div>

              <div className="text-sm">
                <Link
                  to="/forgot-password"
                  className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
            </div>

            {/* Submit button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn-primary w-full py-3"
              >
                {isSubmitting ? (
                  <LoadingSpinner size="sm" color="white" />
                ) : (
                  <>
                    <LogIn className="h-4 w-4 mr-2" />
                    Sign in
                  </>
                )}
              </button>
            </div>

            {/* Root error */}
            {errors.root && (
              <div className="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-4">
                <p className="text-sm text-red-600 dark:text-red-400 flex items-center gap-1">
                  <span className="w-1 h-1 bg-red-500 rounded-full"></span>
                  {errors.root.message}
                </p>
              </div>
            )}
          </form>

          {/* Sign up link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Don't have an account?{' '}
              <Link
                to="/register"
                className="font-medium text-primary-600 hover:text-primary-500 dark:text-primary-400 dark:hover:text-primary-300 transition-colors"
              >
                Create one now
              </Link>
            </p>
          </div>

          {/* Demo credentials */}
          {process.env.NODE_ENV === 'development' && (
            <div className="mt-6 pt-6 border-t border-gray-200/50 dark:border-gray-700/50">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">Demo Credentials</p>
                <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                  <p><span className="font-medium">Username:</span> demo</p>
                  <p><span className="font-medium">Password:</span> DemoPassword123!</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}