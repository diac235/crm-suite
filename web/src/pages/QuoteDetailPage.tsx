import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Printer, Receipt, Send } from 'lucide-react';
import { toast } from 'sonner';
import { apiDownload, apiGet, apiPost, errorMessage } from '../lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../lib/format';
import { downloadBlob } from '../lib/utils';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Field, Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DocumentsPanel } from '../features/documents/DocumentsPanel';
import { ErrorState, FullPageSpinner } from '../components/ui/Spinner';
import { useAuth } from '../hooks/useAuth';
import type { Quote } from '../types';

/** Transiciones permitidas, replicadas del backend para guiar la interfaz. */
const TRANSITIONS: Record<string, string[]> = {
  BORRADOR: ['ENVIADA', 'RECHAZADA'],
  ENVIADA: ['EN_NEGOCIACION', 'ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  EN_NEGOCIACION: ['ACEPTADA', 'RECHAZADA', 'VENCIDA'],
  VENCIDA: ['ENVIADA', 'EN_NEGOCIACION'],
  ACEPTADA: [],
  RECHAZADA: ['EN_NEGOCIACION'],
};

const STATUS_LABELS: Record<string, string> = {
  ENVIADA: 'Marcar como enviada',
  EN_NEGOCIACION: 'Pasar a negociación',
  ACEPTADA: 'Marcar como aceptada',
  RECHAZADA: 'Marcar como rechazada',
  VENCIDA: 'Marcar como vencida',
};

export default function QuoteDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [statusModal, setStatusModal] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [convertOpen, setConvertOpen] = useState(false);

  const query = useQuery({
    queryKey: ['quote', id],
    queryFn: () => apiGet<Quote>(`/quotes/${id}`),
    enabled: Boolean(id),
  });

  const changeStatus = useMutation({
    mutationFn: (status: string) =>
      apiPost(`/quotes/${id}/status`, {
        status,
        rejectionReason: status === 'RECHAZADA' ? rejectionReason : undefined,
      }),
    onSuccess: () => {
      toast.success('Estado actualizado');
      void queryClient.invalidateQueries({ queryKey: ['quote', id] });
      void queryClient.invalidateQueries({ queryKey: ['quotes'] });
      setStatusModal(null);
      setRejectionReason('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const convert = useMutation({
    mutationFn: () => apiPost<{ id: string }>(`/quotes/${id}/convert-to-sale`),
    onSuccess: () => {
      toast.success('Venta generada correctamente');
      setConvertOpen(false);
      navigate('/ventas');
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setConvertOpen(false);
    },
  });

  if (query.isLoading) return <FullPageSpinner message="Cargando cotización…" />;
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;

  const quote = query.data!;
  const available = TRANSITIONS[quote.status] ?? [];

  const downloadPdf = async () => {
    try {
      const result = await apiDownload(`/quotes/${quote.id}/pdf`, undefined, `${quote.number}.pdf`);
      downloadBlob(result.blob, result.fileName);
    } catch (error) {
      toast.error(errorMessage(error));
    }
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
        title={`Cotización ${quote.number}`}
        description={quote.clientName}
        actions={
          <>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => void downloadPdf()}>
              Descargar PDF
            </Button>
            {can('quotes.update') && quote.status !== 'ACEPTADA' && (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/cotizaciones/${quote.id}/editar`)}>
                Editar
              </Button>
            )}
            {can('quotes.update') && available.length > 0 && (
              <Select
                aria-label="Cambiar estado"
                value=""
                onChange={(event) => event.target.value && setStatusModal(event.target.value)}
                className="h-10 w-auto"
              >
                <option value="">Cambiar estado…</option>
                {available.map((status) => (
                  <option key={status} value={status}>
                    {STATUS_LABELS[status] ?? status}
                  </option>
                ))}
              </Select>
            )}
            {can('sales.create') && quote.status === 'ACEPTADA' && (
              <Button icon={<Receipt className="h-4 w-4" />} onClick={() => setConvertOpen(true)}>
                Generar venta
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardHeader title="Detalle de la cotización" />
            <CardBody className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-4 py-2.5 text-left">Descripción</th>
                      <th className="px-4 py-2.5 text-right">Cantidad</th>
                      <th className="px-4 py-2.5 text-right">P. unitario</th>
                      <th className="px-4 py-2.5 text-right">Desc.</th>
                      <th className="px-4 py-2.5 text-right">Imp.</th>
                      <th className="px-4 py-2.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {quote.items?.map((item) => (
                      <tr key={item.id}>
                        <td className="px-4 py-3">
                          <p className="text-slate-800">{item.description}</p>
                          {item.productSku && <p className="text-xs text-slate-400">{item.productSku}</p>}
                        </td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.quantity, 2)}</td>
                        <td className="px-4 py-3 text-right">{formatMoney(item.unitPrice)}</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.discountPct, 2)}%</td>
                        <td className="px-4 py-3 text-right">{formatNumber(item.taxPct, 2)}%</td>
                        <td className="px-4 py-3 text-right font-medium text-slate-900">{formatMoney(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-end border-t border-slate-200 bg-slate-50 px-4 py-3">
                <dl className="w-full max-w-xs space-y-1 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Subtotal</dt>
                    <dd className="font-medium text-slate-900">{formatMoney(quote.subtotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Descuentos</dt>
                    <dd className="font-medium text-slate-900">- {formatMoney(quote.discountTotal)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Impuestos</dt>
                    <dd className="font-medium text-slate-900">{formatMoney(quote.taxTotal)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-slate-300 pt-1">
                    <dt className="font-semibold text-slate-900">Total</dt>
                    <dd className="text-lg font-semibold text-slate-900">{formatMoney(quote.total)}</dd>
                  </div>
                </dl>
              </div>
            </CardBody>
          </Card>

          {(quote.notes || quote.terms) && (
            <Card>
              <CardHeader title="Observaciones y condiciones" />
              <CardBody className="space-y-3 text-sm text-slate-600">
                {quote.notes && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Observaciones</p>
                    <p className="whitespace-pre-wrap">{quote.notes}</p>
                  </div>
                )}
                {quote.terms && (
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Condiciones comerciales</p>
                    <p className="whitespace-pre-wrap">{quote.terms}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader title="Documentos adjuntos" />
            <CardBody>
              <DocumentsPanel scope={{ quoteId: quote.id }} />
            </CardBody>
          </Card>
        </div>

        <Card className="h-fit">
          <CardBody className="space-y-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Estado</span>
              <StatusBadge value={quote.status} />
            </div>
            <dl className="space-y-2 border-t border-slate-100 pt-3">
              <Row label="Cliente" value={quote.clientName} link={`/clientes/${quote.clientId}`} />
              <Row label="Identificación" value={quote.clientTaxId} />
              <Row label="Contacto" value={quote.contactName} />
              <Row
                label="Oportunidad"
                value={quote.opportunityName}
                link={quote.opportunityId ? `/oportunidades/${quote.opportunityId}` : undefined}
              />
              <Row label="Ejecutivo" value={quote.ownerName} />
              <Row label="Emisión" value={formatDate(quote.issueDate)} />
              <Row label="Válida hasta" value={formatDate(quote.validUntil)} />
              <Row label="Enviada" value={quote.sentAt ? formatDateTime(quote.sentAt) : '—'} />
              <Row label="Decisión" value={quote.decisionAt ? formatDateTime(quote.decisionAt) : '—'} />
            </dl>
            {quote.rejectionReason && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <p className="text-xs font-medium text-red-700">Motivo del rechazo</p>
                <p className="mt-0.5 text-sm text-red-600">{quote.rejectionReason}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal
        open={Boolean(statusModal)}
        onClose={() => setStatusModal(null)}
        title="Cambiar estado de la cotización"
        description={statusModal ? STATUS_LABELS[statusModal] : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setStatusModal(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() => statusModal && changeStatus.mutate(statusModal)}
              loading={changeStatus.isPending}
              disabled={statusModal === 'RECHAZADA' && !rejectionReason.trim()}
              icon={<Send className="h-4 w-4" />}
            >
              Confirmar
            </Button>
          </>
        }
      >
        {statusModal === 'RECHAZADA' ? (
          <Field label="Motivo del rechazo" required>
            <Input
              value={rejectionReason}
              onChange={(event) => setRejectionReason(event.target.value)}
              maxLength={500}
              placeholder="Precio fuera de presupuesto"
            />
          </Field>
        ) : (
          <p className="text-sm text-slate-600">
            La cotización pasará al estado <strong>{statusModal}</strong>. El cambio queda registrado en la auditoría.
          </p>
        )}
      </Modal>

      <ConfirmDialog
        open={convertOpen}
        tone="primary"
        title="Generar venta"
        message={`Se creará una venta a partir de la cotización ${quote.number} por ${formatMoney(quote.total)}. ¿Desea continuar?`}
        confirmLabel="Generar venta"
        loading={convert.isPending}
        onConfirm={() => convert.mutate()}
        onCancel={() => setConvertOpen(false)}
      />
    </>
  );
}

function Row({ label, value, link }: { label: string; value?: string | null; link?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-xs text-slate-400">{label}</dt>
      <dd className="truncate text-right text-slate-700">
        {link && value ? (
          <Link to={link} className="text-brand-600 hover:underline">
            {value}
          </Link>
        ) : (
          (value ?? '—')
        )}
      </dd>
    </div>
  );
}
