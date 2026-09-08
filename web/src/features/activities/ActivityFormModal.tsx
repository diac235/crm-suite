import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiList, apiPatch, apiPost, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useCatalogs, useContactOptions, useUserOptions } from '../../hooks/useCatalogs';
import { useAuth } from '../../hooks/useAuth';
import { toDateTimeInput } from '../../lib/format';
import type { Activity, Client, Opportunity } from '../../types';

const schema = z.object({
  typeId: z.string().min(1, 'Debe seleccionar un tipo'),
  subject: z.string().trim().min(1, 'El asunto es obligatorio').max(200),
  description: z.string().trim().max(2000).optional(),
  clientId: z.string().optional(),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  ownerId: z.string().optional(),
  status: z.enum(['PENDIENTE', 'EN_PROGRESO', 'COMPLETADA', 'CANCELADA']),
  scheduledAt: z.string().min(1, 'La fecha y hora son obligatorias'),
  durationMin: z.coerce.number().int().min(0).max(1440),
  location: z.string().trim().max(200).optional(),
  outcome: z.string().trim().max(2000).optional(),
});

type FormValues = z.input<typeof schema>;

export function ActivityFormModal({
  open,
  onClose,
  activity,
  defaults,
}: {
  open: boolean;
  onClose: () => void;
  activity?: Activity | null;
  defaults?: { clientId?: string; opportunityId?: string; scheduledAt?: string };
}) {
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const { can } = useAuth();
  const [clientId, setClientId] = useState('');
  const { data: contacts } = useContactOptions(clientId);
  const isEdit = Boolean(activity);

  const clientsQuery = useQuery({
    queryKey: ['clients', 'selector'],
    queryFn: () => apiList<Client>('/clients', { pageSize: 200, sortBy: 'legalName', sortDir: 'asc' }),
    enabled: open,
  });

  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', 'selector', clientId],
    queryFn: () => apiList<Opportunity>('/opportunities', { clientId, pageSize: 100 }),
    enabled: open && Boolean(clientId),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    const initialClient = activity?.clientId ?? defaults?.clientId ?? '';
    setClientId(initialClient);
    reset({
      typeId: activity?.typeId ?? catalogs?.activityTypes[0]?.id ?? '',
      subject: activity?.subject ?? '',
      description: activity?.description ?? '',
      clientId: initialClient,
      contactId: activity?.contactId ?? '',
      opportunityId: activity?.opportunityId ?? defaults?.opportunityId ?? '',
      ownerId: activity?.ownerId ?? '',
      status: (activity?.status as FormValues['status']) ?? 'PENDIENTE',
      scheduledAt: toDateTimeInput(activity?.scheduledAt ?? defaults?.scheduledAt ?? new Date()),
      durationMin: activity?.durationMin ?? 30,
      location: activity?.location ?? '',
      outcome: activity?.outcome ?? '',
    });
  }, [open, activity, defaults, catalogs, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        clientId: values.clientId || null,
        contactId: values.contactId || null,
        opportunityId: values.opportunityId || null,
        ownerId: values.ownerId || undefined,
      };
      return isEdit ? apiPatch(`/activities/${activity!.id}`, payload) : apiPost('/activities', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Actividad actualizada' : 'Actividad registrada');
      void queryClient.invalidateQueries({ queryKey: ['activities'] });
      void queryClient.invalidateQueries({ queryKey: ['calendar'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar actividad' : 'Nueva actividad'}
      description="La actividad debe asociarse a un cliente u oportunidad."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="activity-form" type="submit" loading={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form
        id="activity-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Tipo" required error={errors.typeId?.message}>
          <Select {...register('typeId')} invalid={Boolean(errors.typeId)}>
            {catalogs?.activityTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Estado" required error={errors.status?.message}>
          <Select {...register('status')}>
            <option value="PENDIENTE">Pendiente</option>
            <option value="EN_PROGRESO">En progreso</option>
            <option value="COMPLETADA">Completada</option>
            <option value="CANCELADA">Cancelada</option>
          </Select>
        </Field>

        <Field label="Asunto" required error={errors.subject?.message} className="sm:col-span-2">
          <Input {...register('subject')} invalid={Boolean(errors.subject)} />
        </Field>

        <Field label="Cliente" error={errors.clientId?.message}>
          <Select {...register('clientId', { onChange: (event) => setClientId(event.target.value) })}>
            <option value="">Sin cliente</option>
            {clientsQuery.data?.data.map((client) => (
              <option key={client.id} value={client.id}>
                {client.legalName}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Contacto" error={errors.contactId?.message}>
          <Select {...register('contactId')} disabled={!clientId}>
            <option value="">Sin contacto</option>
            {contacts?.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Oportunidad" error={errors.opportunityId?.message}>
          <Select {...register('opportunityId')} disabled={!clientId}>
            <option value="">Sin oportunidad</option>
            {opportunitiesQuery.data?.data.map((opportunity) => (
              <option key={opportunity.id} value={opportunity.id}>
                {opportunity.code} · {opportunity.name}
              </option>
            ))}
          </Select>
        </Field>

        {can('activities.delete') && (
          <Field label="Responsable" error={errors.ownerId?.message}>
            <Select {...register('ownerId')}>
              <option value="">Yo</option>
              {users?.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Fecha y hora" required error={errors.scheduledAt?.message}>
          <Input type="datetime-local" {...register('scheduledAt')} invalid={Boolean(errors.scheduledAt)} />
        </Field>

        <Field label="Duración (minutos)" required error={errors.durationMin?.message}>
          <Input type="number" min="0" max="1440" step="5" {...register('durationMin')} />
        </Field>

        <Field label="Lugar" error={errors.location?.message} className="sm:col-span-2">
          <Input {...register('location')} />
        </Field>

        <Field label="Descripción" error={errors.description?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register('description')} />
        </Field>

        <Field label="Resultado" error={errors.outcome?.message} className="sm:col-span-2">
          <Textarea rows={2} {...register('outcome')} />
        </Field>
      </form>
    </Modal>
  );
}
