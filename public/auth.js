import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';
window.addEventListener('error', (event) => { if (event.target?.tagName === 'SCRIPT') showAuthError('A required sign-in module could not load. Please refresh or try another network.'); }, true);
window.addEventListener('unhandledrejection', (event) => { console.error('Authentication module error:', event.reason); showAuthError('Secure sign-in could not start. Please refresh and retry.'); });
function showAuthError(message) {
  const root = document.getElementById('auth-root');
  if (!root || document.body.classList.contains('sentinel-authenticated')) return;
  root.innerHTML = '<main class="sentinel-auth-screen"><section class="sentinel-auth-card"><div class="sentinel-auth-mark"><img src="/IMG_20260629_220728_136.jpg?v=1" alt="NEAR Sentinel"></div><p class="sentinel-auth-kicker">NEAR PROTOCOL / ACCOUNT INTELLIGENCE</p><h1>NEAR SENTINEL</h1><p class="sentinel-auth-copy">'+message+'</p><button class="sentinel-auth-button" onclick="location.reload()">Retry ↻</button><button class="sentinel-auth-guest-button" onclick="window.startSentinelGuest && window.startSentinelGuest()">Continue as Guest ↗</button><p class="sentinel-auth-security">Guest preview is read-only and does not create a Privy session.</p></section></main>';
}
let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const loginStarted = useRef(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  useEffect(() => {
    window.getSentinelAccessToken = getAccessToken;
    if (window.SENTINEL_GUEST) return;
    document.body.classList.toggle('sentinel-authenticated', Boolean(ready && authenticated));
    if (ready && authenticated && !dashboardStarted) {
      dashboardStarted = true;
      import('./app.js?v=20261110-signal-cards1').catch((error) => {
        console.error('Dashboard failed to initialize:', error);
        dashboardStarted = false;
      });
    }
    if (!authenticated && !window.SENTINEL_GUEST) {
      document.body.classList.remove('sentinel-authenticated');
      dashboardStarted = false;
    }
  }, [ready, authenticated]);

  if (window.SENTINEL_GUEST) return null;

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
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Sign in through Privy with your email and verify using the one-time code Privy sends to your inbox.'),
        React.createElement('button', {
          className: 'sentinel-auth-button',
          type: 'button',
          disabled: loginLoading,
          'aria-busy': loginLoading,
          onClick: async () => {
            if (loginStarted.current) return;
            loginStarted.current = true;
            setLoginError('');
            setLoginLoading(true);
            try { await login(); }
            catch (error) {
              console.error('Privy login failed:', error);
              setLoginError('Privy sign-in could not open. Please retry or check your connection.');
            }
            finally { loginStarted.current = false; setLoginLoading(false); }
          }
        }, loginLoading ? 'Opening Privy…' : 'Login with Privy'),
        loginError ? React.createElement('p', { className: 'sentinel-auth-error', role: 'alert' }, loginError) : null,
        React.createElement('div', { className: 'sentinel-auth-or', 'aria-hidden': 'true' }, React.createElement('span'), React.createElement('b', null, 'OR'), React.createElement('span')),
        React.createElement('button', { className: 'sentinel-auth-guest-button', type: 'button', onClick: () => window.startSentinelGuest?.() }, 'Continue as Guest · Read-only'),
        React.createElement('p', { className: 'sentinel-auth-footnote' }, 'EMAIL OTP · PRIVY AUTHENTICATION'),
        React.createElement('p', { className: 'sentinel-auth-security' }, 'Your wallet keys are never requested. Sentinel checks public testnet data only.')
      )
    );
  }

  const sessionControl = React.createElement('div', { className: 'sentinel-session-control' },
    React.createElement('span', { className: 'sentinel-session-avatar', role: 'img', 'aria-label': 'Signed-in profile' },
      React.createElement('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        React.createElement('path', { d: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.42 0-8 2.24-8 5v1h16v-1c0-2.76-3.58-5-8-5Z' })
      )
    ),
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
