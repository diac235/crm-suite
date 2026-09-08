import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPatch, apiPost, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '../../components/ui/Field';
import { toDateInput } from '../../lib/format';
import type { Contact } from '../../types';

const schema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(80),
  position: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  email: z.union([z.literal(''), z.string().email('Correo electrónico inválido')]).optional(),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  whatsapp: z.string().trim().max(40).optional(),
  birthDate: z.string().optional(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
  notes: z.string().trim().max(2000).optional(),
});

type FormValues = z.infer<typeof schema>;

export function ContactFormModal({
  open,
  onClose,
  clientId,
  contact,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  contact?: Contact | null;
}) {
  const queryClient = useQueryClient();
  const isEdit = Boolean(contact);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', lastName: '', isPrimary: false, isActive: true },
  });

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: contact?.firstName ?? '',
      lastName: contact?.lastName ?? '',
      position: contact?.position ?? '',
      department: contact?.department ?? '',
      email: contact?.email ?? '',
      phone: contact?.phone ?? '',
      mobile: contact?.mobile ?? '',
      whatsapp: contact?.whatsapp ?? '',
      birthDate: toDateInput(contact?.birthDate),
      isPrimary: contact?.isPrimary ?? false,
      isActive: contact?.isActive ?? true,
      notes: contact?.notes ?? '',
    });
  }, [open, contact, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, clientId, birthDate: values.birthDate || null };
      return isEdit ? apiPatch(`/contacts/${contact!.id}`, payload) : apiPost('/contacts', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Contacto actualizado' : 'Contacto creado');
      void queryClient.invalidateQueries({ queryKey: ['client'] });
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar contacto' : 'Nuevo contacto'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="contact-form" type="submit" loading={mutation.isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear contacto'}
          </Button>
        </>
      }
    >
      <form
        id="contact-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Nombre" required error={errors.firstName?.message}>
          <Input {...register('firstName')} invalid={Boolean(errors.firstName)} />
        </Field>
        <Field label="Apellido" required error={errors.lastName?.message}>
          <Input {...register('lastName')} invalid={Boolean(errors.lastName)} />
        </Field>
        <Field label="Cargo" error={errors.position?.message}>
          <Input {...register('position')} />
        </Field>
        <Field label="Departamento" error={errors.department?.message}>
          <Input {...register('department')} />
        </Field>
        <Field label="Correo electrónico" error={errors.email?.message}>
          <Input type="email" {...register('email')} invalid={Boolean(errors.email)} />
        </Field>
        <Field label="Teléfono" error={errors.phone?.message}>
          <Input {...register('phone')} />
        </Field>
        <Field label="Celular" error={errors.mobile?.message}>
          <Input {...register('mobile')} />
        </Field>
        <Field label="WhatsApp" error={errors.whatsapp?.message}>
          <Input {...register('whatsapp')} />
        </Field>
        <Field label="Fecha de nacimiento" error={errors.birthDate?.message}>
          <Input type="date" {...register('birthDate')} />
        </Field>
        <div className="flex items-end gap-4 pb-2">
          <Checkbox label="Contacto principal" {...register('isPrimary')} />
          <Checkbox label="Activo" {...register('isActive')} />
        </div>
        <Field label="Notas" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
