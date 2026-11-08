import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';
let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const loginStarted = useRef(false);

  useEffect(() => {
    document.body.classList.toggle('sentinel-authenticated', Boolean(ready && authenticated));
    if (ready && authenticated && !dashboardStarted) {
      dashboardStarted = true;
      import('./app.js?v=20261108-03').catch((error) => {
        console.error('Dashboard failed to initialize:', error);
        dashboardStarted = false;
      });
    }
    if (!authenticated) {
      document.body.classList.remove('sentinel-authenticated');
      dashboardStarted = false;
    }
  }, [ready, authenticated]);

  if (!ready) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark' }, 'N'),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL · SECURITY GATE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Securely preparing your sign-in…'),
        React.createElement('div', { className: 'sentinel-auth-loader' })
      )
    );
  }

  if (!authenticated) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark' }, 'N'),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL · SECURITY GATE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Sign in to access the security dashboard. Your account is authenticated securely by Privy.'),
        React.createElement('button', {
          className: 'sentinel-auth-button',
          type: 'button',
          onClick: async () => {
            if (loginStarted.current) return;
            loginStarted.current = true;
            try { await login(); }
            catch (error) { console.error('Privy login failed:', error); }
            finally { loginStarted.current = false; }
          }
        }, 'Continue with email  ↗'),
        React.createElement('p', { className: 'sentinel-auth-footnote' }, 'Email verification · Privy authentication'),
        React.createElement('p', { className: 'sentinel-auth-security' }, 'Never share your password, OTP, seed phrase, or private key.')
      )
    );
  }

  const email = user?.email?.address || user?.phone?.number || 'Authenticated user';
  const sessionControl = React.createElement('div', { className: 'sentinel-session-control' },
    React.createElement('span', { className: 'sentinel-session-email', title: email }, email),
    React.createElement('button', {
      type: 'button',
      className: 'sentinel-signout-button',
      onClick: async () => {
        try { await logout(); }
        catch (error) { console.error('Privy logout failed:', error); }
      }
    }, 'Sign out')
  );

  const target = document.querySelector('.top-actions');
  return target ? createPortal(sessionControl, target) : null;
}

function Root() {
  return React.createElement(PrivyProvider, {
    appId: APP_ID,
    config: {
      loginMethods: ['email'],
      appearance: {
        theme: 'dark',
        accentColor: '#00e0a4',
        showWalletLoginFirst: false,
        landingHeader: 'Sign in to NEAR Sentinel',
        loginMessage: 'Access the NEAR Sentinel security dashboard'
      },
      embeddedWallets: { createOnLogin: 'off' }
    }
  }, React.createElement(AuthGate));
}

createRoot(document.getElementById('auth-root')).render(React.createElement(Root));
