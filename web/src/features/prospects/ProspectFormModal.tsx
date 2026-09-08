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
import { toDateTimeInput } from '../../lib/format';
import type { Prospect } from '../../types';

const schema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  lastName: z.string().trim().max(80).optional(),
  companyName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(30).optional(),
  position: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  email: z.union([z.literal(''), z.string().email('Correo electrónico inválido')]).optional(),
  sourceId: z.string().optional(),
  sectorId: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.enum(['NUEVO', 'CONTACTADO', 'CALIFICADO', 'EN_NEGOCIACION', 'CONVERTIDO', 'PERDIDO']),
  temperature: z.enum(['FRIO', 'TIBIO', 'CALIENTE']),
  estimatedValue: z.union([z.literal(''), z.coerce.number().min(0)]).optional(),
  lastContactAt: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
  lostReason: z.string().trim().max(500).optional(),
  notes: z.string().trim().max(2000).optional(),
});

type FormValues = z.input<typeof schema>;

export function ProspectFormModal({
  open,
  onClose,
  prospect,
}: {
  open: boolean;
  onClose: () => void;
  prospect?: Prospect | null;
}) {
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const { can } = useAuth();
  const isEdit = Boolean(prospect);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: '', status: 'NUEVO', temperature: 'TIBIO' },
  });

  const status = watch('status');

  useEffect(() => {
    if (!open) return;
    reset({
      firstName: prospect?.firstName ?? '',
      lastName: prospect?.lastName ?? '',
      companyName: prospect?.companyName ?? '',
      taxId: prospect?.taxId ?? '',
      position: prospect?.position ?? '',
      phone: prospect?.phone ?? '',
      mobile: prospect?.mobile ?? '',
      email: prospect?.email ?? '',
      sourceId: prospect?.sourceId ?? '',
      sectorId: prospect?.sectorId ?? '',
      ownerId: prospect?.ownerId ?? '',
      status: (prospect?.status as FormValues['status']) ?? 'NUEVO',
      temperature: (prospect?.temperature as FormValues['temperature']) ?? 'TIBIO',
      estimatedValue: prospect?.estimatedValue ? Number(prospect.estimatedValue) : '',
      lastContactAt: toDateTimeInput(prospect?.lastContactAt),
      nextFollowUpAt: toDateTimeInput(prospect?.nextFollowUpAt),
      lostReason: prospect?.lostReason ?? '',
      notes: prospect?.notes ?? '',
    });
  }, [open, prospect, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        estimatedValue: values.estimatedValue === '' ? null : values.estimatedValue,
        lastContactAt: values.lastContactAt || null,
        nextFollowUpAt: values.nextFollowUpAt || null,
      };
      return isEdit ? apiPatch(`/prospects/${prospect!.id}`, payload) : apiPost('/prospects', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Prospecto actualizado' : 'Prospecto creado');
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar prospecto' : 'Nuevo prospecto'}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="prospect-form" type="submit" loading={mutation.isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear prospecto'}
          </Button>
        </>
      }
    >
      <form
        id="prospect-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Nombre" required error={errors.firstName?.message}>
          <Input {...register('firstName')} invalid={Boolean(errors.firstName)} />
        </Field>
        <Field label="Apellido" error={errors.lastName?.message}>
          <Input {...register('lastName')} />
        </Field>
        <Field label="Empresa" error={errors.companyName?.message}>
          <Input {...register('companyName')} />
        </Field>
        <Field label="Identificación" error={errors.taxId?.message}>
          <Input {...register('taxId')} />
        </Field>
        <Field label="Cargo" error={errors.position?.message}>
          <Input {...register('position')} />
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
        <Field label="Fuente" error={errors.sourceId?.message}>
          <Select {...register('sourceId')}>
            <option value="">Sin fuente</option>
            {catalogs?.prospectSources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </Select>
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
        <Field label="Estado" required error={errors.status?.message}>
          <Select {...register('status')}>
            <option value="NUEVO">Nuevo</option>
            <option value="CONTACTADO">Contactado</option>
            <option value="CALIFICADO">Calificado</option>
            <option value="EN_NEGOCIACION">En negociación</option>
            <option value="PERDIDO">Perdido</option>
          </Select>
        </Field>
        <Field label="Temperatura" required error={errors.temperature?.message}>
          <Select {...register('temperature')}>
            <option value="FRIO">Frío</option>
            <option value="TIBIO">Tibio</option>
            <option value="CALIENTE">Caliente</option>
          </Select>
        </Field>
        <Field label="Valor estimado" error={errors.estimatedValue?.message}>
          <Input type="number" step="0.01" min="0" {...register('estimatedValue')} />
        </Field>
        {can('prospects.delete') && (
          <Field label="Responsable" error={errors.ownerId?.message}>
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
        <Field label="Último contacto" error={errors.lastContactAt?.message}>
          <Input type="datetime-local" {...register('lastContactAt')} />
        </Field>
        <Field label="Próximo seguimiento" error={errors.nextFollowUpAt?.message}>
          <Input type="datetime-local" {...register('nextFollowUpAt')} />
        </Field>
        {status === 'PERDIDO' && (
          <Field label="Motivo de pérdida" error={errors.lostReason?.message} className="sm:col-span-2">
            <Input {...register('lostReason')} />
          </Field>
        )}
        <Field label="Observaciones" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register('notes')} />
        </Field>
      </form>
    </Modal>
  );
}
