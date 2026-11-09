import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy, useGuestAccounts } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';
let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const [guestLoading, setGuestLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [logoActive, setLogoActive] = useState(false);
  const activateLogo = () => {
    setLogoActive(true);
    window.setTimeout(() => setLogoActive(false), 1250);
  }

  if (!window.__SENTINEL_GUEST_SESSION_CHECKED) {
    window.__SENTINEL_GUEST_SESSION_CHECKED = true;
    try {
      window.SENTINEL_GUEST = sessionStorage.getItem('sentinel_privy_guest') === '1';
    } catch {
      window.SENTINEL_GUEST = false;
    }
  }

  useEffect(() => {
    window.getSentinelAccessToken = getAccessToken;

    if (!ready) return;

    if (authenticated) {
      document.body.classList.add('sentinel-authenticated');
      document.body.classList.toggle('sentinel-guest', Boolean(window.SENTINEL_GUEST));

      if (!dashboardStarted) {
        dashboardStarted = true;
        import('./app.js?v=20261110-wallet-header-fix2').catch((error) => {
          console.error('Sentinel dashboard failed to initialize:', error);
          dashboardStarted = false;
          setAuthError('Dashboard failed to load. Please reload and try again.');
        });
      }
      return;
    }

    document.body.classList.remove('sentinel-authenticated', 'sentinel-guest');
    dashboardStarted = false;

    if (window.SENTINEL_GUEST) {
      window.SENTINEL_GUEST = false;
      try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}
    }
  }, [ready, authenticated, getAccessToken]);

  const startGuestSession = async () => {
    setGuestLoading(true);
    setAuthError('');
    window.SENTINEL_GUEST = true;
    try { sessionStorage.setItem('sentinel_privy_guest', '1'); } catch {}

    try {
      await createGuestAccount();
    } catch (error) {
      console.error('Privy Guest Account creation failed:', error);
      window.SENTINEL_GUEST = false;
      try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}
      setAuthError('Guest access could not be started. Check that Guest Accounts are enabled in Privy and try again.');
      setGuestLoading(false);
    }
  };

  if (!ready) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('button', { className: `sentinel-auth-mark${logoActive ? ' is-activated' : ''}`, type: 'button', onClick: activateLogo, 'aria-label': 'Activate Sentinel wayang emblem' },
          React.createElement('img', { src: '/IMG_20260629_220728_136.jpg?v=1', alt: 'NEAR Sentinel wayang emblem' })
        ),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / WALLET RISK INTELLIGENCE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Preparing your NEAR security workspace.'),
        React.createElement('div', { className: 'sentinel-auth-loading-status' }, React.createElement('span', { className: 'sentinel-auth-status-dot' }), 'INITIALIZING PRIVY SESSION'),
        React.createElement('div', { className: 'sentinel-auth-loader', role: 'status', 'aria-label': 'Preparing secure session' })
      )
    );
  }

  if (!authenticated) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('button', { className: `sentinel-auth-mark${logoActive ? ' is-activated' : ''}`, type: 'button', onClick: activateLogo, 'aria-label': 'Activate Sentinel wayang emblem' },
          React.createElement('img', { src: '/IMG_20260629_220728_136.jpg?v=1', alt: 'NEAR Sentinel wayang emblem' })
        ),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / ACCOUNT INTELLIGENCE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Review wallet activity, assess risk signals, and make safer decisions on NEAR.'),
        React.createElement('button', {
          className: 'sentinel-auth-button',
          type: 'button',
          onClick: () => {
            setAuthError('');
            // A user choosing Privy email login must never inherit a previous Guest preview flag.
            window.SENTINEL_GUEST = false;
            try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}
            document.body.classList.remove('sentinel-guest');
            login();
          }
        }, 'Continue with email ↗'),
        React.createElement('p', { className: 'sentinel-auth-footnote' }, 'EMAIL VERIFICATION · POWERED BY PRIVY'),
        React.createElement('button', {
          className: 'sentinel-auth-guest-button',
          type: 'button',
          disabled: guestLoading,
          onClick: startGuestSession
        }, guestLoading ? 'Creating Guest session…' : 'Explore read-only demo ↗'),
        authError ? React.createElement('p', { className: 'sentinel-auth-error', role: 'alert' }, authError) : null,
        React.createElement('p', { className: 'sentinel-auth-security' }, 'Demo access is read-only. No wallet connection or transaction signing is required.')
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
        try {
          await logout();
        } catch (error) {
          console.error('Privy logout failed:', error);
        }
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
