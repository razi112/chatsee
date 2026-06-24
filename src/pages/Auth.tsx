import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { MessageCircle, AtSign, Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  username: z.string().min(2, 'Username must be at least 2 characters'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = z.object({
  username: z
    .string()
    .min(2, 'Username must be at least 2 characters')
    .max(30, 'Username must be 30 characters or less')
    .regex(/^[a-zA-Z0-9_]+$/, 'Only letters, numbers, and underscores'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginErrors = { username?: string; password?: string };
type SignUpErrors = { username?: string; email?: string; password?: string };

function FieldGroup({
  id,
  label,
  type,
  placeholder,
  value,
  onChange,
  icon: Icon,
  error,
  autoComplete,
  showToggle,
  onToggle,
  showPassword,
}: {
  id: string;
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  icon: React.ElementType;
  error?: string;
  autoComplete?: string;
  showToggle?: boolean;
  onToggle?: () => void;
  showPassword?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-semibold uppercase tracking-widest text-muted-foreground"
      >
        {label}
      </label>
      <div className="relative group">
        <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground transition-colors group-focus-within:text-primary" />
        <Input
          id={id}
          type={showToggle ? (showPassword ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className={`
            pl-10 pr-${showToggle ? '10' : '4'} h-11
            bg-secondary/40 border
            ${error ? 'border-destructive focus-visible:ring-destructive/30' : 'border-border focus-visible:ring-primary/30'}
            focus-visible:border-primary transition-all duration-150
          `}
        />
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            tabIndex={-1}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export default function Auth() {
  const [tab, setTab] = useState<'login' | 'signup'>('login');

  const [loginUsername, setLoginUsername] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginErrors, setLoginErrors] = useState<LoginErrors>({});
  const [showLoginPw, setShowLoginPw] = useState(false);

  const [signUpUsername, setSignUpUsername] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpErrors, setSignUpErrors] = useState<SignUpErrors>({});
  const [showSignUpPw, setShowSignUpPw] = useState(false);

  const [loading, setLoading] = useState(false);

  const { signIn, signUp, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  const validateLogin = () => {
    try {
      loginSchema.parse({ username: loginUsername, password: loginPassword });
      setLoginErrors({});
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        const errs: LoginErrors = {};
        e.errors.forEach((err) => {
          if (err.path[0]) errs[err.path[0] as keyof LoginErrors] = err.message;
        });
        setLoginErrors(errs);
      }
      return false;
    }
  };

  const validateSignUp = () => {
    try {
      signUpSchema.parse({ username: signUpUsername, email: signUpEmail, password: signUpPassword });
      setSignUpErrors({});
      return true;
    } catch (e) {
      if (e instanceof z.ZodError) {
        const errs: SignUpErrors = {};
        e.errors.forEach((err) => {
          if (err.path[0]) errs[err.path[0] as keyof SignUpErrors] = err.message;
        });
        setSignUpErrors(errs);
      }
      return false;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (tab === 'login' ? !validateLogin() : !validateSignUp()) return;

    setLoading(true);
    try {
      if (tab === 'login') {
        const { error } = await signIn(loginUsername, loginPassword);
        if (error) {
          toast({
            title: 'Login failed',
            description:
              error.message.includes('Invalid login credentials') ||
              error.message.includes('invalid_credentials')
                ? 'Invalid username or password. Please try again.'
                : error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Welcome back!' });
        }
      } else {
        const { error } = await signUp(
          signUpEmail,
          signUpPassword,
          signUpUsername.toLowerCase().trim()
        );
        if (error) {
          toast({
            title: 'Sign up failed',
            description: error.message.includes('already registered')
              ? 'This email is already registered. Please sign in instead.'
              : error.message,
            variant: 'destructive',
          });
        } else {
          toast({ title: 'Account created!', description: 'Welcome to ChatSee.' });
        }
      }
    } catch {
      toast({
        title: 'Something went wrong',
        description: 'An unexpected error occurred. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const switchTab = (next: 'login' | 'signup') => {
    setTab(next);
    setLoginErrors({});
    setSignUpErrors({});
  };

  const isLogin = tab === 'login';

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      {/* Ambient glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-primary/8 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/15 border border-primary/20 mb-4 shadow-lg shadow-primary/10">
            <MessageCircle className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">ChatSee</h1>
          <p className="text-sm text-muted-foreground mt-1">Connect with friends</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl shadow-2xl shadow-black/30 overflow-hidden">

          {/* Tab switcher */}
          <div className="flex border-b border-border/60">
            <button
              type="button"
              onClick={() => switchTab('login')}
              className={`
                flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative
                ${isLogin
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              Sign In
              {isLogin && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
            <button
              type="button"
              onClick={() => switchTab('signup')}
              className={`
                flex-1 py-3.5 text-sm font-semibold transition-all duration-200 relative
                ${!isLogin
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'}
              `}
            >
              Sign Up
              {!isLogin && (
                <span className="absolute bottom-0 left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Form area */}
          <div className="p-6">
            {/* Heading */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-foreground">
                {isLogin ? 'Welcome back' : 'Create your account'}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isLogin
                  ? 'Enter your @username and password to continue.'
                  : "Pick a username — that's how friends will find you."}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {isLogin ? (
                <>
                  <FieldGroup
                    id="loginUsername"
                    label="Username"
                    type="text"
                    placeholder="yourhandle"
                    value={loginUsername}
                    onChange={setLoginUsername}
                    icon={AtSign}
                    error={loginErrors.username}
                    autoComplete="username"
                  />
                  <FieldGroup
                    id="loginPassword"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={loginPassword}
                    onChange={setLoginPassword}
                    icon={Lock}
                    error={loginErrors.password}
                    autoComplete="current-password"
                    showToggle
                    onToggle={() => setShowLoginPw((v) => !v)}
                    showPassword={showLoginPw}
                  />
                </>
              ) : (
                <>
                  <FieldGroup
                    id="signUpUsername"
                    label="Username"
                    type="text"
                    placeholder="yourhandle"
                    value={signUpUsername}
                    onChange={setSignUpUsername}
                    icon={AtSign}
                    error={signUpErrors.username}
                    autoComplete="username"
                  />
                  <FieldGroup
                    id="signUpEmail"
                    label="Email"
                    type="email"
                    placeholder="you@example.com"
                    value={signUpEmail}
                    onChange={setSignUpEmail}
                    icon={Mail}
                    error={signUpErrors.email}
                    autoComplete="email"
                  />
                  <FieldGroup
                    id="signUpPassword"
                    label="Password"
                    type="password"
                    placeholder="••••••••"
                    value={signUpPassword}
                    onChange={setSignUpPassword}
                    icon={Lock}
                    error={signUpErrors.password}
                    autoComplete="new-password"
                    showToggle
                    onToggle={() => setShowSignUpPw((v) => !v)}
                    showPassword={showSignUpPw}
                  />
                </>
              )}

              <Button
                type="submit"
                disabled={loading}
                className="w-full h-11 mt-2 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all duration-150"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isLogin ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </Button>
            </form>

            {/* Footer toggle */}
            <p className="mt-5 text-center text-xs text-muted-foreground">
              {isLogin ? (
                <>
                  No account yet?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('signup')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign up
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={() => switchTab('login')}
                    className="text-primary font-medium hover:underline"
                  >
                    Sign in
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
