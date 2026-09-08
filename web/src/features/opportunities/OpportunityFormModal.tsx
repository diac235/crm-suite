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
import { toDateInput } from '../../lib/format';
import type { Client, Opportunity } from '../../types';

const schema = z.object({
  name: z.string().trim().min(1, 'El nombre es obligatorio').max(200),
  clientId: z.string().min(1, 'Debe seleccionar un cliente'),
  contactId: z.string().optional(),
  ownerId: z.string().optional(),
  stageId: z.string().min(1, 'Debe seleccionar una etapa'),
  sourceId: z.string().optional(),
  amount: z.coerce.number().min(0, 'El valor no puede ser negativo'),
  probability: z.union([z.literal(''), z.coerce.number().int().min(0).max(100)]).optional(),
  expectedCloseAt: z.string().optional(),
  competitor: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(),
});

type FormValues = z.input<typeof schema>;

export function OpportunityFormModal({
  open,
  onClose,
  opportunity,
  defaultClientId,
}: {
  open: boolean;
  onClose: () => void;
  opportunity?: Opportunity | null;
  defaultClientId?: string;
}) {
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const { data: users } = useUserOptions();
  const { can } = useAuth();
  const [clientId, setClientId] = useState(defaultClientId ?? '');
  const { data: contacts } = useContactOptions(clientId);
  const isEdit = Boolean(opportunity);

  const clientsQuery = useQuery({
    queryKey: ['clients', 'selector'],
    queryFn: () => apiList<Client>('/clients', { pageSize: 200, sortBy: 'legalName', sortDir: 'asc' }),
    enabled: open,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    const initialClient = opportunity?.clientId ?? defaultClientId ?? '';
    setClientId(initialClient);
    reset({
      name: opportunity?.name ?? '',
      clientId: initialClient,
      contactId: opportunity?.contactId ?? '',
      ownerId: opportunity?.ownerId ?? '',
      stageId: opportunity?.stageId ?? catalogs?.pipelineStages[0]?.id ?? '',
      sourceId: opportunity?.sourceId ?? '',
      amount: opportunity ? Number(opportunity.amount) : 0,
      probability: opportunity?.probability ?? '',
      expectedCloseAt: toDateInput(opportunity?.expectedCloseAt),
      competitor: opportunity?.competitor ?? '',
      description: opportunity?.description ?? '',
    });
  }, [open, opportunity, defaultClientId, catalogs, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        probability: values.probability === '' ? undefined : values.probability,
        expectedCloseAt: values.expectedCloseAt || null,
      };
      if (isEdit) {
        // La etapa se mueve por su propio endpoint para preservar el historial.
        const { stageId: _stageId, ...rest } = payload;
        return apiPatch(`/opportunities/${opportunity!.id}`, rest);
      }
      return apiPost('/opportunities', payload);
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Oportunidad actualizada' : 'Oportunidad creada');
      void queryClient.invalidateQueries({ queryKey: ['opportunities'] });
      void queryClient.invalidateQueries({ queryKey: ['opportunity'] });
      onClose();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Editar oportunidad' : 'Nueva oportunidad'}
      description={isEdit ? 'La etapa se cambia desde el pipeline para conservar el historial.' : undefined}
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="opportunity-form" type="submit" loading={mutation.isPending}>
            {isEdit ? 'Guardar cambios' : 'Crear oportunidad'}
          </Button>
        </>
      }
    >
      <form
        id="opportunity-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Nombre de la oportunidad" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register('name')} invalid={Boolean(errors.name)} placeholder="Implementación de plataforma" />
        </Field>

        <Field label="Cliente" required error={errors.clientId?.message}>
          <Select
            {...register('clientId', { onChange: (event) => setClientId(event.target.value) })}
            invalid={Boolean(errors.clientId)}
          >
            <option value="">Seleccione un cliente</option>
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

        {!isEdit && (
          <Field label="Etapa" required error={errors.stageId?.message}>
            <Select {...register('stageId')} invalid={Boolean(errors.stageId)}>
              {catalogs?.pipelineStages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Valor estimado" required error={errors.amount?.message}>
          <Input type="number" step="0.01" min="0" {...register('amount')} invalid={Boolean(errors.amount)} />
        </Field>

        <Field label="Probabilidad (%)" error={errors.probability?.message} hint="Si se deja vacío se usa la de la etapa">
          <Input type="number" min="0" max="100" {...register('probability')} />
        </Field>

        <Field label="Fecha estimada de cierre" error={errors.expectedCloseAt?.message}>
          <Input type="date" {...register('expectedCloseAt')} />
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

        {can('opportunities.delete') && (
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

        <Field label="Competencia" error={errors.competitor?.message}>
          <Input {...register('competitor')} />
        </Field>

        <Field label="Descripción" error={errors.description?.message} className="sm:col-span-2">
          <Textarea rows={3} {...register('description')} />
        </Field>
      </form>
    </Modal>
  );
}
