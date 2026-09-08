import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

export interface TabItem {
  key: string;
  label: string;
  badge?: number;
  icon?: ReactNode;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('overflow-x-auto border-b border-slate-200', className)}>
      <nav className="-mb-px flex min-w-max gap-1" role="tablist">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={active === item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              'inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition',
              active === item.key
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700',
            )}
          >
            {item.icon}
            {item.label}
            {item.badge !== undefined && item.badge > 0 && (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                {item.badge}
              </span>
            )}
          </button>
        ))}
      </nav>
    </div>
  );
}
