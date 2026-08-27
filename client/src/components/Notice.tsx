import type { ReactNode } from 'react';

interface NoticeProps {
  tone: 'error' | 'info' | 'success';
  children: ReactNode;
}

export function Notice({ tone, children }: NoticeProps) {
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}
