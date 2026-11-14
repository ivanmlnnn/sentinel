import React, { useEffect, useRef, useState } from 'react';
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
    React.createElement('path',{d:'M8 52 Q13 47 19 47 M45 47 Q52 47 56 53',fill:'none',stroke:palette[1],strokeWidth:'1.2',opacity:'.85'}),
    React.createElement('path',{d:'M'+(12+(hash%5))+' 31 Q'+(7+(hash%4))+' 35 '+(14+(hash%5))+' 41',fill:'none',stroke:palette[1],strokeWidth:'1.5',strokeLinecap:'round'}),
    React.createElement('path',{d:'M'+(48-(hash%5))+' 30 Q'+(56-(hash%4))+' 35 '+(49-(hash%5))+' 41',fill:'none',stroke:palette[0],strokeWidth:'1.5',strokeLinecap:'round'}),
    React.createElement('path',{d:'M'+(25+(hash%5))+' 25 l3 -'+(2+(hash%4))+' l3 '+(2+(hash%4)),fill:'none',stroke:palette[1],strokeWidth:'1.1',strokeLinecap:'round'}),
    React.createElement('circle',{cx:32+(hash%9)-4,cy:23+((hash>>>12)%5),r:1.7+(hash%3)*.45,fill:palette[1],stroke:palette[0],strokeWidth:'.7'}),
    React.createElement('path',{d:'M'+(23+(hash%4))+' 45 Q32 '+(48+((hash>>>16)%5))+' '+(41-(hash%4))+' 44',fill:'none',stroke:palette[1],strokeWidth:'.9',opacity:'.9'}),
    React.createElement('path',{d:'M16 54 Q32 '+(48+((hash>>>20)%5))+' 48 54',fill:'none',stroke:palette[2],strokeWidth:'1.2'}),
    React.createElement('circle',{cx:32,cy:32,r:30,fill:'none',stroke:palette[1],strokeOpacity:'.45',strokeWidth:'.8'})
  );
}

let dashboardStarted = false;

// Perform one clean full-page refresh after sign-out. The in-memory Privy/React
// state and cached dashboard modules are discarded before the login screen returns.
function refreshLoginAfterSignOut() {
  if (window.__SENTINEL_SIGNOUT_REFRESHING) return;
  window.__SENTINEL_SIGNOUT_REFRESHING = true;
  try { sessionStorage.removeItem('sentinel_signout_refresh'); } catch {}
  const next = new URL(window.location.href);
  next.searchParams.set('session_refresh', Date.now().toString());
  window.location.replace(next.toString());
}

function AuthGate() {
  const { ready, authenticated, login, logout, getAccessToken, user } = usePrivy();
  const { createGuestAccount } = useGuestAccounts();
  const [guestLoading, setGuestLoading] = useState(false);
  const [authError, setAuthError] = useState('');


  if (!window.__SENTINEL_GUEST_SESSION_CHECKED) {
    window.__SENTINEL_GUEST_SESSION_CHECKED = true;
    try {
      window.SENTINEL_GUEST = sessionStorage.getItem('sentinel_privy_guest') === '1';
    } catch {
      window.SENTINEL_GUEST = false;
    }
  }

  useEffect(() => {
    if (ready) document.getElementById('auth-root')?.setAttribute('data-auth-ready', '1');
    window.getSentinelAccessToken = getAccessToken;

    const host = document.querySelector('.sentinel-auth-mark[data-wayang-3d]');
    let disposeWayang = () => {};
    let cancelled = false;
    if (host) {
      import('./wayang-3d.js?v=20261110-three-cdn-fix').then(({ mountWayang3D }) => {
        if (!cancelled && host.isConnected) {
          try {
            disposeWayang = mountWayang3D(host);
          } catch (error) {
            console.error('Sentinel 3D wayang mount failed:', error);
            host.dataset.wayang3dError = error?.message || 'WebGL renderer unavailable';
          }
        }
      }).catch((error) => {
        console.error('Sentinel 3D wayang module failed to load:', error);
        if (!cancelled && host.isConnected) host.dataset.wayang3dError = error?.message || '3D module unavailable';
      });
    }

    if (!ready) return () => { cancelled = true; disposeWayang(); };

    // AuthGate stays mounted across logout, so clear any pending Guest-button
    // state whenever the Privy authentication state changes.
    setGuestLoading(false);

    if (authenticated) {
      document.body.classList.add('sentinel-authenticated');
      document.body.classList.toggle('sentinel-guest', Boolean(window.SENTINEL_GUEST));

      if (!dashboardStarted) {
        dashboardStarted = true;
        import('./app.js?v=20261114-dual-agent-swap3&wallet=meteor-walletfund1&policy-reason=1&wallet-card=3').catch((error) => {
          console.error('Sentinel dashboard failed to initialize:', error);
          dashboardStarted = false;
          setAuthError('Dashboard failed to load. Please reload and try again.');
        });
      }
      return () => disposeWayang();
    }

    document.body.classList.remove('sentinel-authenticated', 'sentinel-guest');
    dashboardStarted = false;

    // Covers logout transitions initiated outside the visible Sign out button too.
    try {
      if (sessionStorage.getItem('sentinel_signout_refresh') === '1') {
        refreshLoginAfterSignOut();
        return () => disposeWayang();
      }
    } catch {}

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

    let timeoutId;
    try {
      await Promise.race([
        createGuestAccount(),
        new Promise((_, reject) => {
          timeoutId = window.setTimeout(() => reject(new Error('GUEST_SESSION_TIMEOUT')), 15000);
        })
      ]);
    } catch (error) {
      console.error('Privy Guest Account creation failed:', error);
      window.SENTINEL_GUEST = false;
      try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}
      setAuthError(error?.message === 'GUEST_SESSION_TIMEOUT'
        ? 'Guest session timed out. Retry or use email sign-in.'
        : 'Guest access could not be started. Check that Guest Accounts are enabled in Privy and try again.');
      setGuestLoading(false);
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  if (!ready) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark', 'data-wayang-3d': '1', 'aria-label': 'Interactive three-dimensional NEAR Sentinel wayang character' }),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / WALLET RISK INTELLIGENCE'),
        React.createElement('h1', { className: 'sentinel-login-wordmark' }, React.createElement('span', { className: 'sentinel-login-near' }, 'NEAR'), React.createElement('span', { className: 'sentinel-login-name' }, 'SENTINEL')),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Preparing your NEAR security workspace.'),
        React.createElement('div', { className: 'sentinel-auth-loading-status' }, React.createElement('span', { className: 'sentinel-auth-status-dot' }), 'INITIALIZING PRIVY SESSION'),
        React.createElement('div', { className: 'sentinel-auth-loader', role: 'status', 'aria-label': 'Preparing secure session' })
      )
    );
  }

  if (!authenticated) {
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark', 'data-wayang-3d': '1', 'aria-label': 'Interactive three-dimensional NEAR Sentinel wayang character' }),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / ACCOUNT INTELLIGENCE'),
        React.createElement('h1', { className: 'sentinel-login-wordmark' }, React.createElement('span', { className: 'sentinel-login-near' }, 'NEAR'), React.createElement('span', { className: 'sentinel-login-name' }, 'SENTINEL')),
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
  const profileCode = profileHash.toString(36).toUpperCase().padStart(7, '0').slice(-7);
  const emailIdentity = user?.email?.address || user?.google?.email || '';
  const phoneIdentity = user?.phone?.number || '';
  const identityName = window.SENTINEL_GUEST
    ? 'GUEST ' + profileCode.slice(-4)
    : (emailIdentity ? emailIdentity.split('@')[0] : (phoneIdentity || ('USER ' + profileCode.slice(-4))));
  const profileLabel = window.SENTINEL_GUEST ? 'GUEST PROFILE' : 'PRIVY PROFILE';
  const sessionControl = React.createElement('div', { className: 'sentinel-session-control' },
    React.createElement('span', { className: 'sentinel-session-avatar', role: 'img', 'aria-label': 'Wayang profile', title: 'Profile' },
      buildWayangAvatar(profileSeed)
    ),
    React.createElement('button', {
      type: 'button',
      className: 'sentinel-signout-button',
      onClick: async event => {
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        button.textContent = 'Signing out…';
        setAuthError('');
        try {
          window.SENTINEL_GUEST = false;
          try {
            sessionStorage.removeItem('sentinel_privy_guest');
            sessionStorage.removeItem('sentinel_guest_profile_id');
            sessionStorage.removeItem('sentinel_signout_refresh');
          } catch {}
          document.body.classList.remove('sentinel-guest', 'sentinel-authenticated');
          await logout();
          dashboardStarted = false;
          refreshLoginAfterSignOut();
        } catch (error) {
          console.error('Privy logout failed:', error);
          button.disabled = false;
          button.textContent = 'Sign out';
          setAuthError('Sign out could not be completed. Please retry.');
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


// Keep a dedicated Sentinel avatar source mounted independently of the account menu.
const sentinelAvatarHost = document.createElement('span');
sentinelAvatarHost.className = 'sentinel-agent-avatar-source';
sentinelAvatarHost.hidden = true;
document.body.append(sentinelAvatarHost);
createRoot(sentinelAvatarHost).render(buildWayangAvatar('sentinel-agent'));

// Add the avatar to every newly rendered assistant reply (guest and signed-in chats).
function syncSentinelAgentWayang() {
  const source = document.querySelector('.sentinel-agent-avatar-source svg')
    || document.querySelector('.sentinel-session-avatar svg')
    || document.querySelector('.sentinel-auth-mark svg');
  if (!source) return;
  const mountAvatar = (host, className, label) => {
    if (!host || host.querySelector('svg')) return;
    host.classList.add(className);
    host.setAttribute('role', 'img');
    host.setAttribute('aria-label', label);
    host.append(source.cloneNode(true));
  };
  mountAvatar(document.querySelector('.agent-chat-avatar'), 'has-wayang-avatar', 'Sentinel AI profile');
  mountAvatar(document.querySelector('.agent-welcome-avatar'), 'has-wayang-avatar', 'Sentinel AI profile');
  document.querySelectorAll('.guest-chat-assistant').forEach(message => {
    if (message.querySelector(':scope > .sentinel-message-avatar')) return;
    const avatar = document.createElement('span');
    avatar.className = 'sentinel-message-avatar';
    avatar.setAttribute('role', 'img');
    avatar.setAttribute('aria-label', 'Sentinel AI profile');
    avatar.append(source.cloneNode(true));
    message.prepend(avatar);
  });
}
const sentinelWayangObserver = new MutationObserver(syncSentinelAgentWayang);
sentinelWayangObserver.observe(document.body, { childList: true, subtree: true });
syncSentinelAgentWayang();
