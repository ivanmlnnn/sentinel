import React, { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';
window.addEventListener('error', (event) => { if (event.target?.tagName === 'SCRIPT') showAuthError('A required sign-in module could not load. Please refresh or try another network.'); }, true);
window.addEventListener('unhandledrejection', (event) => { console.error('Authentication module error:', event.reason); showAuthError('Secure sign-in could not start. Please refresh and retry.'); });
function showAuthError(message) {
  const root = document.getElementById('auth-root');
  if (!root || document.body.classList.contains('sentinel-authenticated')) return;
  root.innerHTML = '<main class="sentinel-auth-screen"><section class="sentinel-auth-card"><div class="sentinel-auth-mark"><img src="/IMG_20260629_220728_136.jpg?v=1" alt="Wayang Tech and Kitchen Needs"></div><p class="sentinel-auth-kicker">NEAR PROTOCOL / ACCOUNT INTELLIGENCE</p><h1>NEAR SENTINEL</h1><p class="sentinel-auth-copy">'+message+'</p><button class="sentinel-auth-button" onclick="location.reload()">Retry ↻</button><p class="sentinel-auth-security">Check your connection if this keeps happening.</p></section></main>';
}
let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, user, login, logout } = usePrivy();
  const loginStarted = useRef(false);

  useEffect(() => {
    document.body.classList.toggle('sentinel-authenticated', Boolean(ready && authenticated));
    if (ready && authenticated && !dashboardStarted) {
      dashboardStarted = true;
      import('./app.js?v=20261108-05').catch((error) => {
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
        React.createElement('div', { className: 'sentinel-auth-mark' }, React.createElement('img', { src: '/IMG_20260629_220728_136.jpg?v=1', alt: 'Wayang Tech and Kitchen Needs' })),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / ACCOUNT INTELLIGENCE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Preparing your secure session…'),
        React.createElement('div', { className: 'sentinel-auth-loader' })
      )
    );
  }

  if (!authenticated) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark' }, React.createElement('img', { src: '/IMG_20260629_220728_136.jpg?v=1', alt: 'Wayang Tech and Kitchen Needs' })),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / ACCOUNT INTELLIGENCE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'A clearer view of account risk before you interact with the NEAR network.'),
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
        }, 'Continue with email'),
        React.createElement('p', { className: 'sentinel-auth-footnote' }, 'PRIVATE EMAIL SIGN-IN  ·  POWERED BY PRIVY'),
        React.createElement('p', { className: 'sentinel-auth-security' }, 'Your wallet keys are never requested. Sentinel checks public testnet data only.')
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
        accentColor: '#e8df78',
        showWalletLoginFirst: false,
        landingHeader: 'Sign in to NEAR Sentinel',
        loginMessage: 'Access the NEAR Sentinel security dashboard'
      },
      embeddedWallets: { createOnLogin: 'off' }
    }
  }, React.createElement(AuthGate));
}

createRoot(document.getElementById('auth-root')).render(React.createElement(Root));
document.getElementById('auth-root').dataset.authBooted = '1';
