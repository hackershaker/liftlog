import type { ReactNode } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface SortableExerciseProps {
  id: string;
  name: string;
  disabled: boolean;
  className: string;
  children: ReactNode;
}

export default function SortableExercise({ id, name, disabled, className, children }: SortableExerciseProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} {...attributes} {...listeners} role="group" aria-label={`Reorder ${name}`}
      data-exercise-id={id}
      onKeyDown={event => { if (event.target === event.currentTarget) listeners?.onKeyDown?.(event); }}
      onMouseDownCapture={event => { if ((event.target as HTMLElement).closest('[data-no-drag]')) event.stopPropagation(); }}
      onTouchStartCapture={event => { if ((event.target as HTMLElement).closest('[data-no-drag]')) event.stopPropagation(); }}
      onContextMenu={event => { if (!disabled) event.preventDefault(); }}
      className={`${className} ${!disabled ? 'cursor-grab focus-visible:ring-2 focus-visible:ring-blue-500' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1,
        touchAction: 'manipulation', WebkitTouchCallout: disabled ? undefined : 'none', userSelect: disabled ? undefined : 'none' }}>
      {children}
    </div>
  );
}
