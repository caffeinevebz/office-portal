import { Inbox } from "lucide-react";

export function EmptyState({
  title = "Nothing here yet",
  message,
  icon: Icon = Inbox,
  action,
}: {
  title?: string;
  message?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700">{title}</p>
        {message && (
          <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
            {message}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div
      className={`h-5 w-5 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600 ${className}`}
    />
  );
}

export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-slate-500">
      <Spinner />
      {label}
    </div>
  );
}
