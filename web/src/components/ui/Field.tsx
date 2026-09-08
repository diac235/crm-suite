import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

interface FieldWrapperProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
  htmlFor?: string;
}

/**
 * Envoltorio de campo de formulario.
 * El control se renderiza dentro del <label> para que la asociación sea
 * implícita (accesible con lectores de pantalla y navegación por teclado)
 * sin necesidad de generar identificadores manualmente.
 */
export function Field({ label, error, hint, required, className, children, htmlFor }: FieldWrapperProps) {
  return (
    <div className={cn('w-full', className)}>
      <label className="block" htmlFor={htmlFor}>
        {label && (
          <span className="label">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
          </span>
        )}
        {children}
      </label>
      {error ? (
        <p role="alert" className="mt-1 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1 text-xs text-slate-500">{hint}</p>
      ) : null}
    </div>
  );
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref,
) {
  return <input ref={ref} className={cn('input-base', invalid && 'input-error', className)} {...props} />;
});

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { className, invalid, children, ...props },
  ref,
) {
  return (
    <select ref={ref} className={cn('input-base pr-8', invalid && 'input-error', className)} {...props}>
      {children}
    </select>
  );
});

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={3}
      className={cn('input-base resize-y', invalid && 'input-error', className)}
      {...props}
    />
  );
});

export function Checkbox({
  label,
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700', className)}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
        {...props}
      />
      {label}
    </label>
  );
}
