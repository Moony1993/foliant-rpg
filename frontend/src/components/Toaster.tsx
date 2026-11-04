import { useToasts } from '../store/toast';

export function Toaster() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 w-72">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className="rpg-panel !bg-white dark:!bg-zinc-900 p-3 cursor-pointer border-l-2 !border-l-gold shadow-lg shadow-black/20 animate-[fadeIn_.2s_ease-out]"
        >
          <div className="font-medium text-sm">{t.title}</div>
          <div className="text-sm text-zinc-400">{t.message}</div>
        </div>
      ))}
    </div>
  );
}
