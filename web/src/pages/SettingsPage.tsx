import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut, errorMessage } from '../lib/api';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Checkbox, Field, Input, Textarea } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState, Spinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import type { ActivityType, CatalogItem, PipelineStage, TaxRate } from '../types';

type CompanyProfile = {
  name: string;
  legalName: string;
  taxId: string;
  address: string;
  city: string;
  state: string;
  country: string;
  phone: string;
  email: string;
  website: string;
  logoUrl: string;
};

type Currency = { code: string; symbol: string; locale: string; decimals: number };
type QuoteDefaults = { validityDays: number; terms: string; footerNote: string };
type CrmDefaults = { defaultCountry: string; staleOpportunityDays: number; followUpReminderHours: number };

export default function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState('empresa');

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: () => apiGet<Array<{ key: string; value: unknown }>>('/settings'),
  });

  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (query.isLoading) {
    return (
      <div className="flex justify-center py-16">
        <Spinner className="h-7 w-7" />
      </div>
    );
  }

  const settingOf = <T,>(key: string): T => query.data!.find((item) => item.key === key)?.value as T;
  const readOnly = !can('settings.manage');

  return (
    <>
      <PageHeader
        title="Configuración"
        description={readOnly ? 'Consulta de la configuración del sistema.' : 'Parámetros generales, catálogos y valores por defecto.'}
      />

      <Card className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          items={[
            { key: 'empresa', label: 'Empresa' },
            { key: 'finanzas', label: 'Moneda e impuestos' },
            { key: 'cotizaciones', label: 'Cotizaciones' },
            { key: 'pipeline', label: 'Pipeline' },
            { key: 'catalogos', label: 'Catálogos' },
          ]}
        />
      </Card>

      {tab === 'empresa' && <CompanyForm value={settingOf<CompanyProfile>('company.profile')} readOnly={readOnly} />}
      {tab === 'finanzas' && (
        <div className="space-y-4">
          <CurrencyForm value={settingOf<Currency>('finance.currency')} readOnly={readOnly} />
          <TaxRatesPanel readOnly={readOnly} />
        </div>
      )}
      {tab === 'cotizaciones' && <QuoteDefaultsForm value={settingOf<QuoteDefaults>('quotes.defaults')} readOnly={readOnly} />}
      {tab === 'pipeline' && <StagesPanel readOnly={readOnly} />}
      {tab === 'catalogos' && (
        <div className="space-y-4">
          <SimpleCatalogPanel catalog="sectors" title="Sectores" readOnly={readOnly} />
          <SimpleCatalogPanel catalog="prospect-sources" title="Fuentes de prospectos" readOnly={readOnly} />
          <ActivityTypesPanel readOnly={readOnly} />
          <CrmDefaultsForm value={settingOf<CrmDefaults>('crm.defaults')} readOnly={readOnly} />
        </div>
      )}
    </>
  );
}

function useSettingMutation(key: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (value: unknown) => apiPut(`/settings/${key}`, { value }),
    onSuccess: () => {
      toast.success('Configuración guardada');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

function CompanyForm({ value, readOnly }: { value: CompanyProfile; readOnly: boolean }) {
  const mutation = useSettingMutation('company.profile');
  const { register, handleSubmit, reset } = useForm<CompanyProfile>({ defaultValues: value });
  useEffect(() => reset(value), [value, reset]);

  return (
    <Card>
      <CardHeader title="Datos de la empresa" description="Aparecen en el encabezado de las cotizaciones en PDF." />
      <CardBody>
        <form
          onSubmit={handleSubmit((values) => mutation.mutate(values))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
        >
          <Field label="Nombre comercial">
            <Input {...register('name')} disabled={readOnly} />
          </Field>
          <Field label="Razón social">
            <Input {...register('legalName')} disabled={readOnly} />
          </Field>
          <Field label="RUC / Identificación fiscal">
            <Input {...register('taxId')} disabled={readOnly} />
          </Field>
          <Field label="Teléfono">
            <Input {...register('phone')} disabled={readOnly} />
          </Field>
          <Field label="Dirección" className="sm:col-span-2">
            <Input {...register('address')} disabled={readOnly} />
          </Field>
          <Field label="Ciudad">
            <Input {...register('city')} disabled={readOnly} />
          </Field>
          <Field label="Provincia">
            <Input {...register('state')} disabled={readOnly} />
          </Field>
          <Field label="País">
            <Input {...register('country')} disabled={readOnly} />
          </Field>
          <Field label="Correo electrónico">
            <Input type="email" {...register('email')} disabled={readOnly} />
          </Field>
          <Field label="Sitio web">
            <Input {...register('website')} disabled={readOnly} />
          </Field>
          <Field label="Ruta del logo" hint="Clave del archivo dentro del almacenamiento (ej. 2026/08/logo.png)">
            <Input {...register('logoUrl')} disabled={readOnly} />
          </Field>
          {!readOnly && (
            <div className="sm:col-span-2">
              <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
                Guardar
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function CurrencyForm({ value, readOnly }: { value: Currency; readOnly: boolean }) {
  const mutation = useSettingMutation('finance.currency');
  const { register, handleSubmit, reset } = useForm<Currency>({ defaultValues: value });
  useEffect(() => reset(value), [value, reset]);

  return (
    <Card>
      <CardHeader title="Moneda" description="Formato aplicado a todos los importes del sistema." />
      <CardBody>
        <form onSubmit={handleSubmit((values) => mutation.mutate({ ...values, decimals: Number(values.decimals) }))} className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <Field label="Código">
            <Input {...register('code')} disabled={readOnly} />
          </Field>
          <Field label="Símbolo">
            <Input {...register('symbol')} disabled={readOnly} />
          </Field>
          <Field label="Configuración regional">
            <Input {...register('locale')} disabled={readOnly} />
          </Field>
          <Field label="Decimales">
            <Input type="number" min="0" max="4" {...register('decimals')} disabled={readOnly} />
          </Field>
          {!readOnly && (
            <div className="sm:col-span-4">
              <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
                Guardar
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function QuoteDefaultsForm({ value, readOnly }: { value: QuoteDefaults; readOnly: boolean }) {
  const mutation = useSettingMutation('quotes.defaults');
  const { register, handleSubmit, reset } = useForm<QuoteDefaults>({ defaultValues: value });
  useEffect(() => reset(value), [value, reset]);

  return (
    <Card>
      <CardHeader title="Valores por defecto de cotizaciones" />
      <CardBody>
        <form onSubmit={handleSubmit((values) => mutation.mutate({ ...values, validityDays: Number(values.validityDays) }))} className="space-y-4">
          <Field label="Días de vigencia" className="max-w-xs">
            <Input type="number" min="1" max="365" {...register('validityDays')} disabled={readOnly} />
          </Field>
          <Field label="Condiciones comerciales">
            <Textarea rows={4} {...register('terms')} disabled={readOnly} />
          </Field>
          <Field label="Nota de pie">
            <Input {...register('footerNote')} disabled={readOnly} />
          </Field>
          {!readOnly && (
            <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
              Guardar
            </Button>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function CrmDefaultsForm({ value, readOnly }: { value: CrmDefaults; readOnly: boolean }) {
  const mutation = useSettingMutation('crm.defaults');
  const { register, handleSubmit, reset } = useForm<CrmDefaults>({ defaultValues: value });
  useEffect(() => reset(value), [value, reset]);

  return (
    <Card>
      <CardHeader title="Parámetros operativos" />
      <CardBody>
        <form
          onSubmit={handleSubmit((values) =>
            mutation.mutate({
              ...values,
              staleOpportunityDays: Number(values.staleOpportunityDays),
              followUpReminderHours: Number(values.followUpReminderHours),
            }),
          )}
          className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <Field label="País por defecto">
            <Input {...register('defaultCountry')} disabled={readOnly} />
          </Field>
          <Field label="Días sin seguimiento para alertar">
            <Input type="number" min="1" max="365" {...register('staleOpportunityDays')} disabled={readOnly} />
          </Field>
          <Field label="Horas de anticipación de recordatorios">
            <Input type="number" min="1" max="720" {...register('followUpReminderHours')} disabled={readOnly} />
          </Field>
          {!readOnly && (
            <div className="sm:col-span-3">
              <Button type="submit" icon={<Save className="h-4 w-4" />} loading={mutation.isPending}>
                Guardar
              </Button>
            </div>
          )}
        </form>
      </CardBody>
    </Card>
  );
}

function SimpleCatalogPanel({
  catalog,
  title,
  readOnly,
}: {
  catalog: 'sectors' | 'prospect-sources';
  title: string;
  readOnly: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [toDelete, setToDelete] = useState<CatalogItem | null>(null);

  const query = useQuery({ queryKey: ['catalogs', catalog], queryFn: () => apiGet<CatalogItem[]>(`/catalogs/${catalog}`) });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalogs', catalog] });
    void queryClient.invalidateQueries({ queryKey: ['catalogs', 'bootstrap'] });
  };

  const create = useMutation({
    mutationFn: () => apiPost(`/catalogs/${catalog}`, { name, isActive: true, order: query.data?.length ?? 0 }),
    onSuccess: () => {
      toast.success('Registro agregado');
      setName('');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const toggle = useMutation({
    mutationFn: (item: CatalogItem) => apiPatch(`/catalogs/${catalog}/${item.id}`, { isActive: !item.isActive }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (item: CatalogItem) => apiDelete(`/catalogs/${catalog}/${item.id}`),
    onSuccess: () => {
      toast.success('Registro eliminado');
      setToDelete(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="space-y-3">
        {!readOnly && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
            className="flex gap-2"
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder={`Nuevo registro en ${title.toLowerCase()}`} maxLength={120} />
            <Button type="submit" icon={<Plus className="h-4 w-4" />} loading={create.isPending} disabled={!name.trim()}>
              Agregar
            </Button>
          </form>
        )}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {query.data?.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="truncate text-sm text-slate-800">{item.name}</span>
              <div className="flex items-center gap-2">
                <StatusBadge value={item.isActive ? 'ACTIVO' : 'INACTIVO'} />
                {!readOnly && (
                  <>
                    <Button variant="ghost" size="sm" onClick={() => toggle.mutate(item)}>
                      {item.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => setToDelete(item)}>
                      Eliminar
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar registro"
        message={`Si "${toDelete?.name ?? ''}" está en uso el sistema impedirá su eliminación. ¿Desea continuar?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}

function ActivityTypesPanel({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['catalogs', 'activity-types'], queryFn: () => apiGet<ActivityType[]>('/catalogs/activity-types') });

  const toggle = useMutation({
    mutationFn: (item: ActivityType) => apiPatch(`/catalogs/activity-types/${item.id}`, { isActive: !item.isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader title="Tipos de actividad" />
      <CardBody>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {query.data?.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="flex items-center gap-2 text-sm text-slate-800">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: item.color }} aria-hidden />
                {item.name}
                <span className="text-xs text-slate-400">({item.code})</span>
              </span>
              <div className="flex items-center gap-2">
                <StatusBadge value={item.isActive ? 'ACTIVO' : 'INACTIVO'} />
                {!readOnly && (
                  <Button variant="ghost" size="sm" onClick={() => toggle.mutate(item)}>
                    {item.isActive ? 'Desactivar' : 'Activar'}
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}

function StagesPanel({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', order: 0, probability: 0, color: '#6366f1', isWon: false, isLost: false });
  const [toDelete, setToDelete] = useState<PipelineStage | null>(null);

  const query = useQuery({ queryKey: ['catalogs', 'pipeline-stages'], queryFn: () => apiGet<PipelineStage[]>('/catalogs/pipeline-stages') });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['catalogs'] });
  };

  const create = useMutation({
    mutationFn: () => apiPost('/catalogs/pipeline-stages', { ...form, isActive: true }),
    onSuccess: () => {
      toast.success('Etapa creada');
      setOpen(false);
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<PipelineStage> }) => apiPatch(`/catalogs/pipeline-stages/${id}`, patch),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (stage: PipelineStage) => apiDelete(`/catalogs/pipeline-stages/${stage.id}`),
    onSuccess: () => {
      toast.success('Etapa eliminada');
      setToDelete(null);
      invalidate();
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  return (
    <Card>
      <CardHeader
        title="Etapas del pipeline"
        description="Definen las columnas del tablero de oportunidades."
        actions={
          !readOnly ? (
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
              Nueva etapa
            </Button>
          ) : undefined
        }
      />
      <CardBody>
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {query.data?.map((stage) => (
            <li key={stage.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-slate-800">
                <span className="h-3 w-3 rounded-full" style={{ background: stage.color }} aria-hidden />
                <span className="font-medium">{stage.name}</span>
                <span className="text-xs text-slate-400">orden {stage.order} · {stage.probability}%</span>
                {stage.isWon && <StatusBadge value="GANADA" />}
                {stage.isLost && <StatusBadge value="PERDIDA" />}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">{stage.opportunitiesCount ?? 0} oportunidades</span>
                {!readOnly && (
                  <>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => update.mutate({ id: stage.id, patch: { isActive: !stage.isActive } })}
                    >
                      {stage.isActive ? 'Desactivar' : 'Activar'}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-red-500 hover:bg-red-50" onClick={() => setToDelete(stage)}>
                      Eliminar
                    </Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva etapa"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.name.trim()}>
              Crear
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Nombre" required className="col-span-2">
            <Input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} maxLength={80} />
          </Field>
          <Field label="Orden">
            <Input type="number" min="0" max="99" value={form.order} onChange={(event) => setForm({ ...form, order: Number(event.target.value) })} />
          </Field>
          <Field label="Probabilidad (%)">
            <Input type="number" min="0" max="100" value={form.probability} onChange={(event) => setForm({ ...form, probability: Number(event.target.value) })} />
          </Field>
          <Field label="Color">
            <Input type="color" value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} className="h-10 p-1" />
          </Field>
          <div className="flex items-end gap-4">
            <Checkbox label="Ganada" checked={form.isWon} onChange={(event) => setForm({ ...form, isWon: event.target.checked, isLost: false })} />
            <Checkbox label="Perdida" checked={form.isLost} onChange={(event) => setForm({ ...form, isLost: event.target.checked, isWon: false })} />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar etapa"
        message={`No se puede eliminar una etapa con oportunidades activas. ¿Desea eliminar "${toDelete?.name ?? ''}"?`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </Card>
  );
}

function TaxRatesPanel({ readOnly }: { readOnly: boolean }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [rate, setRate] = useState('0');

  const query = useQuery({ queryKey: ['catalogs', 'tax-rates'], queryFn: () => apiGet<TaxRate[]>('/catalogs/tax-rates') });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['catalogs'] });

  const create = useMutation({
    mutationFn: () => apiPost('/catalogs/tax-rates', { name, rate: Number(rate), isDefault: false, isActive: true }),
    onSuccess: () => {
      toast.success('Impuesto agregado');
      setName('');
      setRate('0');
      invalidate();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const setDefault = useMutation({
    mutationFn: (item: TaxRate) => apiPatch(`/catalogs/tax-rates/${item.id}`, { isDefault: true }),
    onSuccess: invalidate,
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <Card>
      <CardHeader title="Impuestos" description="Tarifas aplicables a productos y líneas de cotización." />
      <CardBody className="space-y-3">
        {!readOnly && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (name.trim()) create.mutate();
            }}
            className="flex flex-wrap gap-2"
          >
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="IVA 15%" className="max-w-xs" />
            <Input type="number" step="0.001" min="0" max="100" value={rate} onChange={(event) => setRate(event.target.value)} className="max-w-[120px]" />
            <Button type="submit" icon={<Plus className="h-4 w-4" />} loading={create.isPending} disabled={!name.trim()}>
              Agregar
            </Button>
          </form>
        )}
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {query.data?.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-slate-800">
                {item.name} <span className="text-xs text-slate-400">({Number(item.rate).toFixed(2)}%)</span>
              </span>
              <div className="flex items-center gap-2">
                {item.isDefault && <StatusBadge value="ACTIVO" />}
                {!readOnly && !item.isDefault && (
                  <Button variant="ghost" size="sm" onClick={() => setDefault.mutate(item)}>
                    Marcar por defecto
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  );
}
