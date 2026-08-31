'use client';

import { useState } from 'react';

/**
 * Copy a programme's share link. The absolute URL is built in the browser from
 * the current origin, so the same component works on the preview domain, the
 * production domain and localhost without any configuration.
 */
export default function CopyLink({ path, label = 'Copy link', block = false, compact = false }) {
  const [state, setState] = useState('idle');
  const href = typeof window === 'undefined' ? path : window.location.origin + path;

  async function copy(e) {
    e.preventDefault();
    e.stopPropagation();
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(href);
      else {
        // older browsers / insecure origins
        const ta = document.createElement('textarea');
        ta.value = href; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove();
      }
      setState('done');
    } catch {
      setState('failed');
    }
    setTimeout(() => setState('idle'), 2000);
  }

  if (compact) {
    return (
      <button type="button" className={'pi-btn pi-btn-ghost' + (state === 'done' ? ' is-active' : '')}
        onClick={copy} title={`Copy share link${path ? ' — ' + path : ''}`}>
        <i className={state === 'done' ? 'bi bi-check2' : 'bi bi-link-45deg'} />{' '}
        <span>{state === 'done' ? 'Link copied' : state === 'failed' ? 'Press Ctrl+C' : 'Copy link'}</span>
      </button>
    );
  }

  return (
    <div className={'pi-share' + (block ? ' is-block' : '')}>
      <i className="bi bi-link-45deg" />
      <span className="pi-share-label">{label}</span>
      <code className="pi-share-url">{path}</code>
      <button type="button" className={'pi-btn pi-btn-ghost' + (state === 'done' ? ' is-active' : '')} onClick={copy}>
        <i className={state === 'done' ? 'bi bi-check2' : 'bi bi-clipboard'} />{' '}
        {state === 'done' ? 'Copied' : state === 'failed' ? 'Press Ctrl+C' : 'Copy'}
      </button>
    </div>
  );
}
