import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy, useGuestAccounts } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';

const WAYANG_PALETTES = [
  ['#8bd4ef','#e8df78','#164c50'], ['#e8df78','#f2a66f','#53352e'],
  ['#9be2c4','#8bd4ef','#174b45'], ['#d7a8f4','#e8df78','#40345b'],
  ['#f2a66f','#8bd4ef','#543b2e'], ['#8bd4ef','#b8e6a5','#233f5a'],
  ['#f0a6a6','#e8df78','#563447'], ['#b8c8f5','#f0bd78','#343d65']
];
const WAYANG_CROWNS = [
  'M18 25 L12 12 L21 17 L25 5 L31 17 L39 8 L40 22 L47 14 L45 29 Z',
  'M17 25 Q11 15 18 8 Q23 15 27 4 Q32 15 39 7 Q43 17 47 13 L44 29 Z',
  'M17 26 L15 10 L25 18 L31 3 L36 18 L46 9 L44 29 Z',
  'M17 26 Q18 15 25 12 L27 3 L33 13 Q43 11 47 23 L44 30 Z',
  'M17 26 L11 17 L23 19 L20 7 L31 16 L39 5 L40 19 L48 15 L44 30 Z',
  'M17 26 Q13 18 20 13 L22 5 L31 15 L39 5 L40 17 Q47 17 46 27 Z'
];
function wayangHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function buildWayangAvatar(seed) {
  const hash = wayangHash(String(seed || 'sentinel-guest'));
  const palette = WAYANG_PALETTES[hash % WAYANG_PALETTES.length];
  const crown = WAYANG_CROWNS[(hash >>> 4) % WAYANG_CROWNS.length];
  const ornament = hash % 2 ? 'M31 9 Q39 0 45 7 Q41 14 34 15 Z' : 'M30 9 Q34 0 40 3 Q43 10 36 15 Z';
  const eyeY = 32 + ((hash >>> 8) % 4);
  return React.createElement('svg', { viewBox:'0 0 64 64', role:'img', 'aria-label':'Generated wayang profile portrait', focusable:'false' },
    React.createElement('defs', null,
      React.createElement('linearGradient',{id:'wayang-bg-'+hash,x1:'0',y1:'0',x2:'1',y2:'1'},
        React.createElement('stop',{offset:'0%',stopColor:palette[2]}),
        React.createElement('stop',{offset:'100%',stopColor:'#071b1d'})),
      React.createElement('linearGradient',{id:'wayang-gold-'+hash,x1:'0',y1:'0',x2:'1',y2:'1'},
        React.createElement('stop',{offset:'0%',stopColor:palette[1]}),
        React.createElement('stop',{offset:'100%',stopColor:palette[0]}))
    ),
    React.createElement('circle',{cx:32,cy:32,r:31,fill:'url(#wayang-bg-'+hash+')'}),
    React.createElement('circle',{cx:32,cy:32,r:28.5,fill:'none',stroke:palette[0],strokeOpacity:'.65',strokeWidth:'1'}),
    React.createElement('path',{d:'M10 55 Q15 43 27 43 L42 43 Q53 46 56 57 Z',fill:palette[0],opacity:'.88'}),
    React.createElement('path',{d:'M19 28 Q19 19 29 17 Q39 15 44 24 L45 33 L51 38 L43 41 Q41 49 32 49 Q22 47 20 39 L16 35 L21 34 Z',fill:'url(#wayang-gold-'+hash+')',stroke:palette[1],strokeWidth:'1.2'}),
    React.createElement('path',{d:'M18 27 L13 23 L19 22 L16 17 L24 20 L25 14 L31 19 L37 12 L39 21 L48 18 L44 28 Z',fill:palette[1],stroke:palette[0],strokeWidth:'1.1'}),
    React.createElement('path',{d:crown,fill:palette[0],stroke:palette[1],strokeWidth:'1.5',strokeLinejoin:'round'}),
    React.createElement('path',{d:ornament,fill:palette[1],stroke:palette[0],strokeWidth:'1'}),
    React.createElement('path',{d:'M22 '+eyeY+' Q25 '+(eyeY-3)+' 28 '+eyeY,fill:'none',stroke:'#102b2d',strokeWidth:'1.8',strokeLinecap:'round'}),
    React.createElement('circle',{cx:25,cy:eyeY-1,r:'1',fill:'#102b2d'}),
    React.createElement('path',{d:'M20 39 Q28 43 38 39',fill:'none',stroke:palette[2],strokeWidth:'1.2',strokeLinecap:'round'}),
    React.createElement('path',{d:'M14 49 Q28 43 48 50',fill:'none',stroke:palette[1],strokeWidth:'1',opacity:'.85'}),
    React.createElement('circle',{cx:32,cy:32,r:30,fill:'none',stroke:palette[1],strokeOpacity:'.45',strokeWidth:'.8'})
  );
}

let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
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

  let profileSeed = user?.id || user?.email?.address || user?.google?.subject || '';
  if (!profileSeed && window.SENTINEL_GUEST) {
    try {
      profileSeed = sessionStorage.getItem('sentinel_guest_profile_id') || '';
      if (!profileSeed) {
        profileSeed = 'guest-' + (window.crypto?.randomUUID?.() || Math.random().toString(36).slice(2));
        sessionStorage.setItem('sentinel_guest_profile_id', profileSeed);
      }
    } catch { profileSeed = 'guest-session'; }
  }
  if (!profileSeed) profileSeed = 'sentinel-user';
  const profileHash = wayangHash(String(profileSeed));
  const profileLabel = window.SENTINEL_GUEST ? 'GUEST' : 'PRIVY USER';
  const sessionControl = React.createElement('div', { className: 'sentinel-session-control' },
    React.createElement('div', { className: 'sentinel-profile-chip', title: window.SENTINEL_GUEST ? 'Read-only guest profile' : 'Authenticated Privy profile' },
      React.createElement('span', { className: 'sentinel-session-avatar', role: 'img', 'aria-label': profileLabel + ' wayang profile' },
        buildWayangAvatar(profileSeed)
      ),
      React.createElement('span', { className: 'sentinel-profile-meta' },
        React.createElement('strong', null, profileLabel),
        React.createElement('small', null, 'WAYANG ID · ' + profileHash.toString(16).slice(-5).toUpperCase())
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
