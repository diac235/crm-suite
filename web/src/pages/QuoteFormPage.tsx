import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { apiGet, apiList, apiPatch, apiPost, errorMessage } from '../lib/api';
import { formatMoney, toDateInput } from '../lib/format';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Field, Input, Select, Textarea } from '../components/ui/Field';
import { PageHeader } from '../components/ui/PageHeader';
import { FullPageSpinner } from '../components/ui/Spinner';
import { useCatalogs, useContactOptions } from '../hooks/useCatalogs';
import type { Client, Opportunity, Product, Quote } from '../types';

const itemSchema = z.object({
  productId: z.string().optional(),
  description: z.string().trim().min(1, 'La descripción es obligatoria').max(300),
  quantity: z.coerce.number().positive('Debe ser mayor a cero'),
  unitPrice: z.coerce.number().min(0),
  discountPct: z.coerce.number().min(0).max(100),
  taxRateId: z.string().optional(),
});

const schema = z.object({
  clientId: z.string().min(1, 'Debe seleccionar un cliente'),
  contactId: z.string().optional(),
  opportunityId: z.string().optional(),
  issueDate: z.string().min(1, 'La fecha de emisión es obligatoria'),
  validUntil: z.string().min(1, 'La vigencia es obligatoria'),
  notes: z.string().trim().max(2000).optional(),
  terms: z.string().trim().max(3000).optional(),
  items: z.array(itemSchema).min(1, 'Debe agregar al menos un ítem'),
});

type FormValues = z.input<typeof schema>;

/** Calcula los totales en el navegador con la misma regla que el backend. */
function computeTotals(
  items: FormValues['items'],
  taxRates: Array<{ id: string; rate: string }>,
) {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;

  for (const item of items) {
    const quantity = Number(item.quantity) || 0;
    const price = Number(item.unitPrice) || 0;
    const discountPct = Number(item.discountPct) || 0;
    const taxPct = Number(taxRates.find((rate) => rate.id === item.taxRateId)?.rate ?? 0);

    const grossCents = Math.round(quantity * price * 100);
    const discountCents = Math.round((grossCents * discountPct) / 100);
    const netCents = grossCents - discountCents;
    const taxCents = Math.round((netCents * taxPct) / 100);

    subtotal += grossCents;
    discount += discountCents;
    tax += taxCents;
  }

  return {
    subtotal: subtotal / 100,
    discount: discount / 100,
    tax: tax / 100,
    total: (subtotal - discount + tax) / 100,
  };
}

export default function QuoteFormPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: catalogs } = useCatalogs();
  const isEdit = Boolean(id);
  const [clientId, setClientId] = useState(searchParams.get('clientId') ?? '');
  const { data: contacts } = useContactOptions(clientId);

  const clientsQuery = useQuery({
    queryKey: ['clients', 'selector'],
    queryFn: () => apiList<Client>('/clients', { pageSize: 200, sortBy: 'legalName', sortDir: 'asc' }),
  });

  const productsQuery = useQuery({
    queryKey: ['products', 'selector'],
    queryFn: () => apiList<Product>('/products', { pageSize: 300, isActive: true, sortBy: 'name', sortDir: 'asc' }),
  });

  const opportunitiesQuery = useQuery({
    queryKey: ['opportunities', 'selector', clientId],
    queryFn: () => apiList<Opportunity>('/opportunities', { clientId, pageSize: 100 }),
    enabled: Boolean(clientId),
  });

  const quoteQuery = useQuery({
    queryKey: ['quote', id],
    queryFn: () => apiGet<Quote>(`/quotes/${id}`),
    enabled: isEdit,
  });

  const defaultValidity = (catalogs && (catalogs as unknown as { validityDays?: number }).validityDays) ?? 15;

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      clientId: searchParams.get('clientId') ?? '',
      opportunityId: searchParams.get('opportunityId') ?? '',
      issueDate: toDateInput(new Date()),
      validUntil: toDateInput(new Date(Date.now() + defaultValidity * 86400000)),
      items: [{ description: '', quantity: 1, unitPrice: 0, discountPct: 0, taxRateId: '' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });

  useEffect(() => {
    if (!isEdit || !quoteQuery.data) return;
    const quote = quoteQuery.data;
    setClientId(quote.clientId);
    reset({
      clientId: quote.clientId,
      contactId: quote.contactId ?? '',
      opportunityId: quote.opportunityId ?? '',
      issueDate: toDateInput(quote.issueDate),
      validUntil: toDateInput(quote.validUntil),
      notes: quote.notes ?? '',
      terms: quote.terms ?? '',
      items: (quote.items ?? []).map((item) => ({
        productId: item.productId ?? '',
        description: item.description,
        quantity: Number(item.quantity),
        unitPrice: Number(item.unitPrice),
        discountPct: Number(item.discountPct),
        taxRateId: item.taxRateId ?? '',
      })),
    });
  }, [isEdit, quoteQuery.data, reset]);

  // Valores por defecto de la configuración al crear una cotización nueva.
  useEffect(() => {
    if (isEdit || !catalogs) return;
    const defaultTax = catalogs.taxRates.find((rate) => rate.isDefault);
    if (defaultTax) setValue('items.0.taxRateId', defaultTax.id);
  }, [catalogs, isEdit, setValue]);

  const totals = useMemo(
    () => computeTotals(items ?? [], catalogs?.taxRates ?? []),
    [items, catalogs],
  );

  const mutation = useMutation({
    mutationFn: (values: FormValues) => {
      const payload = {
        ...values,
        contactId: values.contactId || null,
        opportunityId: values.opportunityId || null,
        items: values.items.map((item) => ({
          ...item,
          productId: item.productId || null,
          taxRateId: item.taxRateId || null,
        })),
      };
      return isEdit ? apiPatch<Quote>(`/quotes/${id}`, payload) : apiPost<Quote>('/quotes', payload);
    },
    onSuccess: (quote) => {
      toast.success(isEdit ? 'Cotización actualizada' : 'Cotización creada');
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      navigate(`/cotizaciones/${quote.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (isEdit && quoteQuery.isLoading) return <FullPageSpinner message="Cargando cotización…" />;

  const applyProduct = (index: number, productId: string) => {
    const product = productsQuery.data?.data.find((item) => item.id === productId);
    if (!product) return;
    setValue(`items.${index}.description`, product.name);
    setValue(`items.${index}.unitPrice`, Number(product.price));
    if (product.taxRateId) setValue(`items.${index}.taxRateId`, product.taxRateId);
  };

  return (
    <>
      <PageHeader
        breadcrumb={
          <Link to="/cotizaciones" className="inline-flex items-center gap-1 hover:text-brand-600">
            <ArrowLeft className="h-3.5 w-3.5" />
            Volver a cotizaciones
          </Link>
        }
        title={isEdit ? `Editar cotización ${quoteQuery.data?.number ?? ''}` : 'Nueva cotización'}
        description="Complete los datos del encabezado y agregue los productos o servicios."
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4" noValidate>
        <Card>
          <CardHeader title="Datos generales" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Cliente" required error={errors.clientId?.message} className="lg:col-span-2">
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

            <Field label="Fecha de emisión" required error={errors.issueDate?.message}>
              <Input type="date" {...register('issueDate')} invalid={Boolean(errors.issueDate)} />
            </Field>

            <Field label="Válida hasta" required error={errors.validUntil?.message}>
              <Input type="date" {...register('validUntil')} invalid={Boolean(errors.validUntil)} />
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Detalle"
            description={errors.items?.message ?? 'Productos y servicios incluidos en la propuesta.'}
            actions={
              <Button
                type="button"
                size="sm"
                variant="outline"
                icon={<Plus className="h-4 w-4" />}
                onClick={() =>
                  append({
                    description: '',
                    quantity: 1,
                    unitPrice: 0,
                    discountPct: 0,
                    taxRateId: catalogs?.taxRates.find((rate) => rate.isDefault)?.id ?? '',
                  })
                }
              >
                Agregar ítem
              </Button>
            }
          />
          <CardBody className="space-y-3 overflow-x-auto">
            <div className="hidden min-w-[900px] grid-cols-[2fr_2.5fr_90px_120px_90px_140px_120px_40px] gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500 lg:grid">
              <span>Producto</span>
              <span>Descripción</span>
              <span className="text-right">Cantidad</span>
              <span className="text-right">P. unitario</span>
              <span className="text-right">Desc. %</span>
              <span>Impuesto</span>
              <span className="text-right">Total</span>
              <span />
            </div>

            {fields.map((field, index) => {
              const line = items?.[index];
              const taxPct = Number(catalogs?.taxRates.find((rate) => rate.id === line?.taxRateId)?.rate ?? 0);
              const gross = (Number(line?.quantity) || 0) * (Number(line?.unitPrice) || 0);
              const net = gross - (gross * (Number(line?.discountPct) || 0)) / 100;
              const lineTotal = net + (net * taxPct) / 100;

              return (
                <div
                  key={field.id}
                  className="grid min-w-[900px] grid-cols-[2fr_2.5fr_90px_120px_90px_140px_120px_40px] items-start gap-2 rounded-lg border border-slate-200 p-2 lg:border-0 lg:p-0"
                >
                  <Select
                    {...register(`items.${index}.productId`, {
                      onChange: (event) => applyProduct(index, event.target.value),
                    })}
                    aria-label="Producto"
                  >
                    <option value="">Manual</option>
                    {productsQuery.data?.data.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.sku} · {product.name}
                      </option>
                    ))}
                  </Select>

                  <div>
                    <Input
                      {...register(`items.${index}.description`)}
                      placeholder="Descripción del ítem"
                      aria-label="Descripción"
                      invalid={Boolean(errors.items?.[index]?.description)}
                    />
                    {errors.items?.[index]?.description && (
                      <p className="mt-1 text-xs text-red-600">{errors.items[index]?.description?.message}</p>
                    )}
                  </div>

                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="text-right"
                    aria-label="Cantidad"
                    {...register(`items.${index}.quantity`)}
                    invalid={Boolean(errors.items?.[index]?.quantity)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-right"
                    aria-label="Precio unitario"
                    {...register(`items.${index}.unitPrice`)}
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    className="text-right"
                    aria-label="Descuento"
                    {...register(`items.${index}.discountPct`)}
                  />
                  <Select {...register(`items.${index}.taxRateId`)} aria-label="Impuesto">
                    <option value="">Sin impuesto</option>
                    {catalogs?.taxRates.map((rate) => (
                      <option key={rate.id} value={rate.id}>
                        {rate.name}
                      </option>
                    ))}
                  </Select>

                  <span className="self-center text-right text-sm font-medium text-slate-900">
                    {formatMoney(lineTotal)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Eliminar ítem"
                    className="text-red-500 hover:bg-red-50"
                    disabled={fields.length === 1}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              );
            })}
          </CardBody>
        </Card>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          <Card>
            <CardHeader title="Observaciones y condiciones" />
            <CardBody className="space-y-4">
              <Field label="Observaciones" error={errors.notes?.message}>
                <Textarea rows={3} {...register('notes')} />
              </Field>
              <Field label="Condiciones comerciales" error={errors.terms?.message}>
                <Textarea rows={4} {...register('terms')} />
              </Field>
            </CardBody>
          </Card>

          <Card className="h-fit">
            <CardHeader title="Totales" />
            <CardBody className="space-y-2 text-sm">
              <TotalRow label="Subtotal" value={totals.subtotal} />
              <TotalRow label="Descuentos" value={-totals.discount} />
              <TotalRow label="Impuestos" value={totals.tax} />
              <div className="mt-2 flex items-baseline justify-between border-t border-slate-200 pt-2">
                <span className="font-semibold text-slate-900">Total</span>
                <span className="text-xl font-semibold text-slate-900">{formatMoney(totals.total)}</span>
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <Button type="submit" loading={mutation.isPending}>
                  {isEdit ? 'Guardar cambios' : 'Crear cotización'}
                </Button>
                <Button type="button" variant="outline" onClick={() => navigate(-1)}>
                  Cancelar
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      </form>
    </>
  );
}

function TotalRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{formatMoney(value)}</span>
    </div>
  );
}
