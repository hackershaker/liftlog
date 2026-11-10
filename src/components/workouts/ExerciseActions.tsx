import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRightLeft, MoreVertical, Trash2, X } from 'lucide-react';

interface ExerciseActionsProps {
  name: string;
  targets: { id: string; name: string; disabled?: boolean }[];
  onMove?: (targetId: string) => void;
  onDelete: () => void;
}

export default function ExerciseActions({ name, targets, onMove, onDelete }: ExerciseActionsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dialog, setDialog] = useState<'move' | 'delete' | null>(null);
  const [menuPosition, setMenuPosition] = useState({ left: 8, top: 8 });
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const close = () => { setMenuOpen(false); setDialog(null); trigger.current?.focus(); };
  const positionMenu = () => {
    const rect = trigger.current?.getBoundingClientRect();
    if (!rect) return;
    const height = onMove ? 112 : 60;
    setMenuPosition({
      left: Math.max(8, Math.min(rect.right - 160, window.innerWidth - 168)),
      top: rect.bottom + height + 8 <= window.innerHeight ? rect.bottom + 4 : Math.max(8, rect.top - height - 4),
    });
  };
  useEffect(() => {
    if (!menuOpen) return;
    positionMenu();
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [menuOpen, onMove]);
  useEffect(() => {
    if (!menuOpen && !dialog) return;
    if (dialog) cancel.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (dialog && event.key === 'Tab') {
        const panel = cancel.current?.closest('[role="dialog"], [role="alertdialog"]');
        const buttons = panel?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [menuOpen, dialog]);

  const floating = dialog && (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" data-no-drag>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={close} />
      <div role={dialog === 'delete' ? 'alertdialog' : 'dialog'} aria-modal="true"
        aria-label={dialog === 'delete' ? '운동 삭제 확인' : '이동할 루틴 선택'}
        className="relative w-full max-w-sm rounded-2xl bg-bg-primary border border-white/10 p-5 shadow-xl max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-display font-semibold">{dialog === 'delete' ? '정말 삭제하시겠습니까?' : '이동할 루틴 선택'}</h3>
          <button onClick={close} aria-label="창 닫기" className="p-2 rounded-lg hover:bg-bg-tertiary"><X size={18} /></button>
        </div>
        <p className="text-sm text-text-muted break-words mb-4">{dialog === 'delete' ? `‘${name}’ 운동을 이 루틴에서 삭제합니다. 이전 운동 기록은 유지됩니다.` : `‘${name}’ 운동을 옮길 루틴을 선택하세요.`}</p>
        {dialog === 'move' && <div className="space-y-2 mb-4">
          {targets.length === 0 && <p className="text-sm text-text-muted">이동할 다른 루틴이 없습니다.</p>}
          {targets.map(target => <button key={target.id} disabled={target.disabled} className="w-full text-left rounded-xl bg-bg-secondary p-3 hover:bg-bg-tertiary disabled:opacity-40 break-words"
            onClick={() => { onMove?.(target.id); setDialog(null); }}>{target.name}{target.disabled ? ' (가득 참)' : ''}</button>)}
        </div>}
        <div className="flex justify-end gap-2">
          <button ref={cancel} onClick={close} className="px-4 py-2 rounded-lg bg-bg-tertiary">취소</button>
          {dialog === 'delete' && <button onClick={() => { setDialog(null); onDelete(); }} className="px-4 py-2 rounded-lg bg-accent-danger text-white">삭제 확인</button>}
        </div>
      </div>
    </div>
  );
  const menu = menuOpen && (
    <div data-testid="exercise-menu-layer" className="fixed inset-0 z-[65]" data-no-drag>
      <div className="absolute inset-0" onClick={close} />
      <div role="menu" aria-label={`${name} 작업`} style={menuPosition} className="fixed w-40 max-w-[calc(100vw-16px)] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-xl border border-white/10 bg-bg-secondary p-1 shadow-xl">
        {onMove && <button role="menuitem" className="flex items-center gap-2 w-full px-3 py-3 rounded-lg hover:bg-bg-tertiary text-sm" onClick={() => { setMenuOpen(false); setDialog('move'); }}><ArrowRightLeft size={16} />루틴 이동</button>}
        <button role="menuitem" className="flex items-center gap-2 w-full px-3 py-3 rounded-lg text-accent-danger hover:bg-bg-tertiary text-sm" onClick={() => { setMenuOpen(false); setDialog('delete'); }}><Trash2 size={16} />삭제</button>
      </div>
    </div>
  );
  return (
    <div className="relative shrink-0" data-no-drag>
      <button ref={trigger} type="button" aria-label={`${name} 메뉴`} aria-expanded={menuOpen} aria-haspopup="menu"
        className="p-3 rounded-lg text-text-muted hover:bg-bg-tertiary" onClick={() => { positionMenu(); setMenuOpen(open => !open); }}><MoreVertical size={20} /></button>
      {menu && (typeof document !== 'undefined' && document.body ? createPortal(menu, document.body) : menu)}
      {floating && (typeof document !== 'undefined' && document.body ? createPortal(floating, document.body) : floating)}
    </div>
  );
}
