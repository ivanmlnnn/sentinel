import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import { PrivyProvider, usePrivy, useLoginWithEmail, useGuestAccounts } from 'https://esm.sh/@privy-io/react-auth@3.51.3?external=react,react-dom';

const APP_ID = 'cmw78k7rd00ix0ilgf5ubvn5y';
window.addEventListener('error', (event) => { if (event.target?.tagName === 'SCRIPT') showAuthError('A required sign-in module could not load. Please refresh or try another network.'); }, true);
window.addEventListener('unhandledrejection', (event) => { console.error('Authentication module error:', event.reason); showAuthError('Secure sign-in could not start. Please refresh and retry.'); });
function showAuthError(message) {
  const root = document.getElementById('auth-root');
  if (!root || document.body.classList.contains('sentinel-authenticated')) return;
  root.innerHTML = '<main class="sentinel-auth-screen"><section class="sentinel-auth-card"><div class="sentinel-auth-mark"><img src="/IMG_20260629_220728_136.jpg?v=1" alt="NEAR Sentinel"></div><p class="sentinel-auth-kicker">NEAR PROTOCOL / ACCOUNT INTELLIGENCE</p><h1>NEAR SENTINEL</h1><p class="sentinel-auth-copy">'+message+'</p><button class="sentinel-auth-button" onclick="location.reload()">Retry ↻</button></section></main>';
}
let dashboardStarted = false;

function AuthGate() {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy();
  const { sendCode, loginWithCode } = useLoginWithEmail();
  const { createGuestAccount } = useGuestAccounts();
  const loginStarted = useRef(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [loginPanelOpen, setLoginPanelOpen] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [emailStep, setEmailStep] = useState('choose');
  const [otpLoading, setOtpLoading] = useState(false);\n  const [guestLoading, setGuestLoading] = useState(false);\n  if (!window.__SENTINEL_GUEST_SESSION_CHECKED) {\n    window.__SENTINEL_GUEST_SESSION_CHECKED = true;\n    try { window.SENTINEL_GUEST = sessionStorage.getItem('sentinel_privy_guest') === '1'; } catch {}\n  }

  useEffect(() => {
    window.getSentinelAccessToken = getAccessToken;
    if (window.SENTINEL_GUEST) {
      if (ready && authenticated) {
        document.body.classList.add('sentinel-authenticated', 'sentinel-guest');
        if (!dashboardStarted) {
          dashboardStarted = true;
          import('./app.js?v=20261110-signal-cards1').catch((error) => {
            console.error('Privy Guest dashboard failed to initialize:', error);
            dashboardStarted = false;
          });
        }
      } else if (ready && !authenticated) {
        window.SENTINEL_GUEST = false;
        try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}
      }
      return;
    }
    document.body.classList.toggle('sentinel-authenticated', Boolean(ready && authenticated));
    if (ready && authenticated && !dashboardStarted) {
      dashboardStarted = true;
      import('./app.js?v=20261110-signal-cards1').catch((error) => {
        console.error('Dashboard failed to initialize:', error);
        dashboardStarted = false;
      });
    }
    if (!authenticated) {
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
    const openLogin = () => {
      setLoginError('');
      setLoginPanelOpen(true);
      setEmailStep('choose');
    };
    const closeLogin = () => {
      setLoginPanelOpen(false);
      setLoginError('');
      setEmailStep('choose');
      setOtpCode('');
    };
    const sendEmailCode = async () => {
      if (!emailAddress.trim()) { setLoginError('Masukkan alamat email terlebih dahulu.'); return; }
      setOtpLoading(true);
      setLoginError('');
      try {
        await sendCode({ email: emailAddress.trim() });
        setEmailStep('code');
      } catch (error) {
        console.error('Privy email OTP request failed:', error);
        setLoginError('Privy gagal mengirim kode. Periksa email dan coba lagi.');
      } finally { setOtpLoading(false); }
    };
    const verifyEmailCode = async () => {
      if (!otpCode.trim()) { setLoginError('Masukkan kode OTP dari email.'); return; }
      setOtpLoading(true);
      setLoginError('');
      try {
        await loginWithCode({ code: otpCode.trim() });
      } catch (error) {
        console.error('Privy email OTP verification failed:', error);
        setLoginError('Kode tidak valid atau kedaluwarsa. Periksa kembali dan coba lagi.');
      } finally { setOtpLoading(false); }
    };
    return React.createElement('main', { className: 'sentinel-auth-screen' },
      React.createElement('section', { className: 'sentinel-auth-card' },
        React.createElement('div', { className: 'sentinel-auth-mark' }, React.createElement('img', { src: '/IMG_20260629_220728_136.jpg?v=1', alt: 'NEAR Sentinel' })),
        React.createElement('p', { className: 'sentinel-auth-kicker' }, 'NEAR PROTOCOL / ACCOUNT INTELLIGENCE'),
        React.createElement('h1', null, 'NEAR SENTINEL'),
        React.createElement('p', { className: 'sentinel-auth-copy' }, 'Secure access to the NEAR Sentinel dashboard.'),
        React.createElement('button', {
          className: 'sentinel-auth-button',
          type: 'button',
          onClick: openLogin
        }, 'Login'),
        React.createElement('p', { className: 'sentinel-auth-footnote' }, 'SECURE AUTHENTICATION · PRIVY'),
        React.createElement('p', { className: 'sentinel-auth-security' }, 'Guest access is read-only. No wallet keys or transaction permissions are requested.')
      ),
      loginPanelOpen ? React.createElement('div', {
        className: 'sentinel-login-overlay',
        role: 'presentation',
        onMouseDown: (event) => { if (event.target === event.currentTarget) closeLogin(); }
      },
        React.createElement('section', { className: 'sentinel-login-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'sentinel-login-title' },
          React.createElement('div', { className: 'sentinel-login-modal-top' },
            React.createElement('span', { className: 'sentinel-privy-mark' }, 'P'),
            React.createElement('button', { className: 'sentinel-login-close', type: 'button', onClick: closeLogin, 'aria-label': 'Close login' }, '×')
          ),
          React.createElement('p', { className: 'sentinel-auth-kicker' }, 'POWERED BY PRIVY'),
          React.createElement('h2', { id: 'sentinel-login-title' }, emailStep === 'choose' ? 'Log in to Sentinel' : emailStep === 'email' ? 'Continue with email' : 'Verify your email'),
          emailStep === 'choose' ? React.createElement(React.Fragment, null,
            React.createElement('p', { className: 'sentinel-auth-copy' }, 'Choose how you want to access the dashboard.'),
            React.createElement('button', { className: 'sentinel-auth-button', type: 'button', onClick: () => { setEmailStep('email'); setLoginError(''); } }, 'Continue with email'),
            React.createElement('div', { className: 'sentinel-auth-or', 'aria-hidden': 'true' }, React.createElement('span'), React.createElement('b', null, 'OR'), React.createElement('span')),
            React.createElement('button', { className: 'sentinel-auth-guest-button', type: 'button', disabled: guestLoading, onClick: async () => {\n              setGuestLoading(true); setLoginError('');\n              try {\n                window.SENTINEL_GUEST = true;\n                try { sessionStorage.setItem('sentinel_privy_guest', '1'); } catch {}\n                await createGuestAccount();\n              } catch (error) {\n                window.SENTINEL_GUEST = false;\n                try { sessionStorage.removeItem('sentinel_privy_guest'); } catch {}\n                console.error('Privy Guest Account creation failed:', error);\n                setLoginError('Privy Guest Account is unavailable. Enable Guest Accounts in the Privy dashboard and try again.');\n                setGuestLoading(false);\n              }\n            } }, guestLoading ? 'Creating Privy Guest…' : 'Continue as Guest · Read-only')
          ) : emailStep === 'email' ? React.createElement(React.Fragment, null,
            React.createElement('p', { className: 'sentinel-auth-copy' }, 'Privy will send a one-time verification code to your email address.'),
            React.createElement('label', { className: 'sentinel-login-label', htmlFor: 'sentinel-email-input' }, 'Email address'),
            React.createElement('input', { id: 'sentinel-email-input', className: 'sentinel-login-input', type: 'email', autoComplete: 'email', placeholder: 'you@example.com', value: emailAddress, onChange: (event) => setEmailAddress(event.target.value) }),
            React.createElement('button', { className: 'sentinel-auth-button', type: 'button', disabled: otpLoading, onClick: sendEmailCode }, otpLoading ? 'Sending code…' : 'Send code'),
            React.createElement('button', { className: 'sentinel-login-back', type: 'button', onClick: () => { setEmailStep('choose'); setLoginError(''); } }, '← Back to sign-in options')
          ) : React.createElement(React.Fragment, null,
            React.createElement('p', { className: 'sentinel-auth-copy' }, 'Enter the one-time code Privy sent to ', React.createElement('strong', null, emailAddress), '.'),
            React.createElement('label', { className: 'sentinel-login-label', htmlFor: 'sentinel-otp-input' }, 'Verification code'),
            React.createElement('input', { id: 'sentinel-otp-input', className: 'sentinel-login-input sentinel-otp-input', type: 'text', inputMode: 'numeric', autoComplete: 'one-time-code', maxLength: 8, placeholder: 'Enter code', value: otpCode, onChange: (event) => setOtpCode(event.target.value.replace(/\\D/g, '')) }),
            React.createElement('button', { className: 'sentinel-auth-button', type: 'button', disabled: otpLoading, onClick: verifyEmailCode }, otpLoading ? 'Verifying…' : 'Verify and login'),
            React.createElement('button', { className: 'sentinel-login-back', type: 'button', onClick: () => { setEmailStep('email'); setOtpCode(''); setLoginError(''); } }, '← Change email')
          ),
          loginError ? React.createElement('p', { className: 'sentinel-auth-error', role: 'alert' }, loginError) : null,
          React.createElement('p', { className: 'sentinel-auth-footnote' }, 'EMAIL OTP SECURELY PROCESSED BY PRIVY')
        )
      ) : null
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
