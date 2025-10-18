import { useState } from 'react';
import { useAuth } from '@/context/FirebaseAuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function FirebaseLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      const success = await login(email, password);
      if (!success) {
        setError('Email o contraseña incorrectos');
      }
    } catch (error) {
      console.error('Firebase login error:', error);
      setError('Error al iniciar sesión. Revise la consola para más detalles.');
    } finally {
      setLoading(false);
    }
  };

  const fillCredentials = (userType: 'admin' | 'usuario' | 'readonly') => {
    const credentials = {
      admin: { email: 'admin@bienesraices.com', password: 'password123' },
      usuario: { email: 'usuario@bienesraices.com', password: 'password123' },
      readonly: { email: 'readonly@bienesraices.com', password: 'password123' }
    };
    
    setEmail(credentials[userType].email);
    setPassword(credentials[userType].password);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 relative"
      style={{
        backgroundImage: `url('/login-bg.jpeg')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        filter: 'brightness(1.08)'
      }}
    >
      <div className="absolute inset-0 bg-black/5 pointer-events-none"></div>
      <div className="w-full max-w-md relative">
        <Card className="shadow-xl bg-white/95">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-gray-800">
              Sistema de Bienes Raíces
            </CardTitle>
            <CardDescription>
              Ingrese sus credenciales para acceder al sistema con Firebase
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Ingrese su email"
                  required
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingrese su contraseña"
                  required
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
            
            <div className="mt-6 text-sm text-gray-600 text-center">
              <p><strong>Usuarios de prueba (Firebase):</strong></p>
              <div className="space-y-2 mt-2">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fillCredentials('admin')}
                  className="w-full text-xs"
                >
                  Admin: admin@bienesraices.com
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fillCredentials('usuario')}
                  className="w-full text-xs"
                >
                  Usuario: usuario@bienesraices.com
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => fillCredentials('readonly')}
                  className="w-full text-xs"
                >
                  Solo lectura: readonly@bienesraices.com
                </Button>
              </div>
              <p className="mt-2 text-xs">Contraseña para todos: password123</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}