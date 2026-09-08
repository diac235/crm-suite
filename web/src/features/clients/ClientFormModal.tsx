import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPatch, apiPost, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useCatalogs, useUserOptions } from '../../hooks/useCatalogs';
import { useAuth } from '../../hooks/useAuth';
import type { Client } from '../../types';

const schema = z.object({
  kind: z.enum(['EMPRESA', 'PERSONA_NATURAL', 'GOBIERNO', 'ONG']),
  taxId: z.string().trim().max(30).optional(),
  legalName: z.string().trim().min(1, 'La razón social es obligatoria').max(200),
  tradeName: z.string().trim().max(200).optional(),
  address: z.string().trim().max(400).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().min(1, 'El país es obligatorio').max(120),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  email: z.union([z.literal(''), z.string().email('Correo electrónico inválido')]).optional(),
  website: z.string().trim().max(190).optional(),
  sectorId: z.string().optional(),
  economicActivity: z.string().trim().max(200).optional(),
  status: z.enum(['ACTIVO', 'INACTIVO', 'ARCHIVADO', 'POTENCIAL']),
  ownerId: z.string().optional(),
  creditLimit: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type FormValues = z.input<typeof schema>;

const EMPTY: FormValues = {
  kind: 'EMPRESA',
  legalName: '',
  country: 'Ecuador',
  status: 'ACTIVO',
  taxId: '',
  tradeName: '',
  address: '',
  city: '',
  state: '',
  phone: '',
  mobile: '',
  email: '',
  website: '',
  sectorId: '',
  economicActivity: '',
  ownerId: '',
  creditLimit: '',
  notes: '',
};

export function ClientFormModal({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client?: Client | null;
}) {
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const { can } = useAuth();
  const isEdit = Boolean(client);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!open) return;
    reset(
      client
        ? {
            kind: client.kind as FormValues['kind'],
            taxId: client.taxId ?? '',
            legalName: client.legalName,
            tradeName: client.tradeName ?? '',
            address: client.address ?? '',
            city: client.city ?? '',
            state: client.state ?? '',
            country: client.country,
            phone: client.phone ?? '',
            mobile: client.mobile ?? '',
            email: client.email ?? '',
            website: client.website ?? '',
            sectorId: client.sectorId ?? '',
            economicActivity: client.economicActivity ?? '',
            status: client.status as FormValues['status'],
            ownerId: client.ownerId ?? '',
            creditLimit: client.creditLimit ? Number(client.creditLimit) : '',
            notes: client.notes ?? '',
          }
        : EMPTY,
    );
  }, [open, client, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = { ...values, creditLimit: values.creditLimit === '' ? null : values.creditLimit };
      return isEdit ? apiPatch(`/clients/${client!.id}`, payload) : apiPost('/clients', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente');
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar cliente' : 'Nuevo cliente'}
      description="Los campos marcados con * son obligatorios."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting || mutation.isPending}>
            Cancelar
          </Button>
          <Button form="client-form" type="submit" loading={mutation.isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear cliente'}
          </Button>
        </>
      }
    >
      <form
        id="client-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Tipo de cliente" required error={errors.kind?.message}>
          <Select {...register('kind')} invalid={Boolean(errors.kind)}>
            <option value="EMPRESA">Empresa</option>
            <option value="PERSONA_NATURAL">Persona natural</option>
            <option value="GOBIERNO">Gobierno</option>
            <option value="ONG">ONG</option>
          </Select>
        </Field>

        <Field label="RUC / Identificación" error={errors.taxId?.message} hint="Se usa para evitar clientes duplicados">
          <Input {...register('taxId')} invalid={Boolean(errors.taxId)} placeholder="0999999999001" />
        </Field>

        <Field label="Razón social" required error={errors.legalName?.message} className="sm:col-span-2">
          <Input {...register('legalName')} invalid={Boolean(errors.legalName)} placeholder="Empresa S.A." />
        </Field>

        <Field label="Nombre comercial" error={errors.tradeName?.message}>
          <Input {...register('tradeName')} />
        </Field>

        <Field label="Sector" error={errors.sectorId?.message}>
          <Select {...register('sectorId')}>
            <option value="">Sin sector</option>
            {catalogs?.sectors.map((sector) => (
              <option key={sector.id} value={sector.id}>
                {sector.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Actividad económica" error={errors.economicActivity?.message} className="sm:col-span-2">
          <Input {...register('economicActivity')} />
        </Field>

        <Field label="Dirección" error={errors.address?.message} className="sm:col-span-2">
          <Input {...register('address')} />
        </Field>

        <Field label="Ciudad" error={errors.city?.message}>
          <Input {...register('city')} />
        </Field>

        <Field label="Provincia" error={errors.state?.message}>
          <Input {...register('state')} />
        </Field>

        <Field label="País" required error={errors.country?.message}>
          <Input {...register('country')} invalid={Boolean(errors.country)} />
        </Field>

        <Field label="Teléfono" error={errors.phone?.message}>
          <Input {...register('phone')} />
        </Field>

        <Field label="Celular" error={errors.mobile?.message}>
          <Input {...register('mobile')} />
        </Field>

        <Field label="Correo electrónico" error={errors.email?.message}>
          <Input type="email" {...register('email')} invalid={Boolean(errors.email)} />
        </Field>

        <Field label="Sitio web" error={errors.website?.message}>
          <Input {...register('website')} placeholder="https://" />
        </Field>

        <Field label="Estado" required error={errors.status?.message}>
          <Select {...register('status')}>
            <option value="ACTIVO">Activo</option>
            <option value="INACTIVO">Inactivo</option>
            <option value="POTENCIAL">Potencial</option>
            <option value="ARCHIVADO">Archivado</option>
          </Select>
        </Field>

        {can('clients.delete') && (
          <Field label="Ejecutivo responsable" error={errors.ownerId?.message}>
            <Select {...register('ownerId')}>
              <option value="">Sin asignar</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Límite de crédito" error={errors.creditLimit?.message}>
          <Input type="number" step="0.01" min="0" {...register('creditLimit')} />
        </Field>

        <Field label="Observaciones" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
