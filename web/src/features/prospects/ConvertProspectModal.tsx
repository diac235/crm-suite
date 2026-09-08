import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiPost, errorMessage } from '../../lib/api';
import { Modal } from '../../components/ui/Modal';
import { Button } from '../../components/ui/Button';
import { Checkbox, Field, Input, Select } from '../../components/ui/Field';
import type { Client, Prospect } from '../../types';

const schema = z.object({
  kind: z.enum(['EMPRESA', 'PERSONA_NATURAL', 'GOBIERNO', 'ONG']),
  legalName: z.string().trim().min(1, 'La razón social es obligatoria').max(200),
  tradeName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(30).optional(),
  address: z.string().trim().max(400).optional(),
  city: z.string().trim().max(120).optional(),
  state: z.string().trim().max(120).optional(),
  country: z.string().trim().min(1).max(120),
  createPrimaryContact: z.boolean(),
});

type FormValues = z.infer<typeof schema>;

/** Convierte un prospecto en cliente conservando todo su historial. */
export function ConvertProspectModal({
  open,
  onClose,
  prospect,
}: {
  open: boolean;
  onClose: () => void;
  prospect: Prospect;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      kind: 'EMPRESA',
      legalName: prospect.companyName ?? `${prospect.firstName} ${prospect.lastName ?? ''}`.trim(),
      tradeName: prospect.companyName ?? '',
      taxId: prospect.taxId ?? '',
      address: '',
      city: '',
      state: '',
      country: 'Ecuador',
      createPrimaryContact: true,
    });
  }, [open, prospect, reset]);

  const mutation = useMutation({
    mutationFn: (values: FormValues) =>
      apiPost<{ client: Client }>(`/prospects/${prospect.id}/convert`, values),
    onSuccess: (result) => {
      toast.success('Prospecto convertido en cliente');
      void queryClient.invalidateQueries({ queryKey: ['prospects'] });
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
      onClose();
      navigate(`/clientes/${result.client.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Convertir prospecto en cliente"
      description="Las actividades, tareas, notas, documentos y oportunidades del prospecto se transferirán al nuevo cliente."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button form="convert-form" type="submit" loading={mutation.isPending}>
            Convertir
          </Button>
        </>
      }
    >
      <form
        id="convert-form"
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        noValidate
      >
        <Field label="Tipo de cliente" required error={errors.kind?.message}>
          <Select {...register('kind')}>
            <option value="EMPRESA">Empresa</option>
            <option value="PERSONA_NATURAL">Persona natural</option>
            <option value="GOBIERNO">Gobierno</option>
            <option value="ONG">ONG</option>
          </Select>
        </Field>
        <Field label="RUC / Identificación" error={errors.taxId?.message}>
          <Input {...register('taxId')} />
        </Field>
        <Field label="Razón social" required error={errors.legalName?.message} className="sm:col-span-2">
          <Input {...register('legalName')} invalid={Boolean(errors.legalName)} />
        </Field>
        <Field label="Nombre comercial" error={errors.tradeName?.message}>
          <Input {...register('tradeName')} />
        </Field>
        <Field label="País" required error={errors.country?.message}>
          <Input {...register('country')} />
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
        <div className="sm:col-span-2">
          <Checkbox label="Crear contacto principal con los datos del prospecto" {...register('createPrimaryContact')} />
        </div>
      </form>
    </Modal>
  );
}
