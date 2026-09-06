'use client';

// Containment for render-time crashes.
//
// When a component throws during render, React cannot know what state the tree
// is in, so it unmounts up to the nearest boundary. This app had none, so "the
// nearest boundary" was the root: on 2026-08-27 one null thumbnail in the
// Production DO Samples section blanked the entire page.
//
// Placement is the whole design. A boundary around each accordion section means
// a section that throws costs you that section, not the screen.
//
// Class component on purpose: React 19 still offers no hook equivalent of
// componentDidCatch.

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { reportClientError, isChunkLoadError } from '../lib/report-client-error';

interface Props {
  children: ReactNode;
  // Names the thing that broke, both in the message and in the report.
  label?: string;
  // Section-sized panel vs a full page-sized one.
  compact?: boolean;
  // Changing this clears the error — used to retry when the user navigates to a
  // different record rather than making them reload the page.
  resetKey?: unknown;
}
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const text = `${error?.message || String(error)}`;
    reportClientError({
      // A chunk that failed to load is a stale tab after a deploy, not a bug in
      // this component — recorded separately so it cannot be mistaken for one.
      kind: isChunkLoadError(text) || isChunkLoadError(error?.stack || '') ? 'chunk' : 'render',
      message: this.props.label ? `${this.props.label}: ${text}` : text,
      stack: error?.stack || null,
      componentStack: info?.componentStack || null,
    });
  }

  componentDidUpdate(prev: Props) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const stale = isChunkLoadError(error.message || '') || isChunkLoadError(error.stack || '');
    const what = this.props.label ? `“${this.props.label}” ` : '';

    return (
      <div
        role="alert"
        // Machine-detectable on purpose. Now that boundaries exist, a render
        // crash no longer escapes to window.onerror and no longer unmounts the
        // drawer — so this panel is the ONLY remaining signal that something
        // threw. scripts/browser-check.mjs fails on it. Do not remove.
        data-kano-error-boundary={this.props.label || 'unnamed'}
        style={{
          border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 10,
          padding: this.props.compact ? '12px 14px' : '28px 24px',
          textAlign: this.props.compact ? 'left' : 'center',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, color: '#b91c1c', marginBottom: 4 }}>
          {stale ? 'This page is out of date' : `${what}could not be displayed`}
        </div>
        <div style={{ fontSize: 12, color: '#7f1d1d', lineHeight: 1.5 }}>
          {stale
            ? 'A new version was released while this tab was open. Reload to get it.'
            : 'The rest of this screen still works. This has been reported automatically.'}
        </div>
        <button
          onClick={() => (stale ? window.location.reload() : this.setState({ error: null }))}
          style={{
            marginTop: 10, border: '1px solid #fca5a5', background: '#fff', color: '#b91c1c',
            borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {stale ? 'Reload' : 'Try again'}
        </button>
      </div>
    );
  }
}
