import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider as LocalAuthProvider, useAuth as useLocalAuth } from './context/AuthContext';
import { AuthProvider as FirebaseAuthProvider, useAuth as useFirebaseAuth } from './context/FirebaseAuthContext';
import Login from './pages/Login';
import FirebaseLogin from './pages/FirebaseLogin';
import Dashboard from './pages/Dashboard';
import FirebaseDashboard from './pages/FirebaseDashboard';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import ErrorBoundary from '@/components/ErrorBoundary';

const queryClient = new QueryClient();

// For public access: default to LocalAuthProvider and show Dashboard without login
function LocalAppContent() {
  return <Dashboard />;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <ErrorBoundary>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<LocalAuthProvider><LocalAppContent /></LocalAuthProvider>} />
            <Route path="*" element={<LocalAuthProvider><LocalAppContent /></LocalAuthProvider>} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;