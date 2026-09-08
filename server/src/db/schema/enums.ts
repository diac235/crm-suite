import { pgEnum } from 'drizzle-orm/pg-core';

/** Tipo jurídico del cliente. */
export const clientKindEnum = pgEnum('client_kind', [
  'EMPRESA',
  'PERSONA_NATURAL',
  'GOBIERNO',
  'ONG',
]);

export const clientStatusEnum = pgEnum('client_status', [
  'ACTIVO',
  'INACTIVO',
  'ARCHIVADO',
  'POTENCIAL',
]);

export const prospectStatusEnum = pgEnum('prospect_status', [
  'NUEVO',
  'CONTACTADO',
  'CALIFICADO',
  'EN_NEGOCIACION',
  'CONVERTIDO',
  'PERDIDO',
]);

export const temperatureEnum = pgEnum('temperature', ['FRIO', 'TIBIO', 'CALIENTE']);

export const opportunityStatusEnum = pgEnum('opportunity_status', [
  'ABIERTA',
  'GANADA',
  'PERDIDA',
  'CANCELADA',
]);

export const quoteStatusEnum = pgEnum('quote_status', [
  'BORRADOR',
  'ENVIADA',
  'EN_NEGOCIACION',
  'ACEPTADA',
  'RECHAZADA',
  'VENCIDA',
]);

export const saleStatusEnum = pgEnum('sale_status', [
  'PENDIENTE',
  'FACTURADA',
  'COBRADA',
  'ANULADA',
]);

export const activityStatusEnum = pgEnum('activity_status', [
  'PENDIENTE',
  'EN_PROGRESO',
  'COMPLETADA',
  'CANCELADA',
]);

export const taskStatusEnum = pgEnum('task_status', [
  'PENDIENTE',
  'EN_PROGRESO',
  'COMPLETADA',
  'CANCELADA',
]);

export const taskPriorityEnum = pgEnum('task_priority', ['BAJA', 'MEDIA', 'ALTA', 'URGENTE']);

export const auditActionEnum = pgEnum('audit_action', [
  'CREATE',
  'UPDATE',
  'DELETE',
  'RESTORE',
  'LOGIN',
  'LOGOUT',
  'LOGIN_FAILED',
  'EXPORT',
  'DOWNLOAD',
  'STATUS_CHANGE',
  'CONVERT',
]);

export const entityTypeEnum = pgEnum('entity_type', [
  'CLIENT',
  'CONTACT',
  'PROSPECT',
  'OPPORTUNITY',
  'QUOTE',
  'SALE',
  'ACTIVITY',
  'TASK',
  'DOCUMENT',
  'NOTE',
  'USER',
  'ROLE',
  'PRODUCT',
  'SETTING',
  'TEAM',
  'CATALOG',
]);

export const notificationKindEnum = pgEnum('notification_kind', [
  'TAREA_VENCIDA',
  'TAREA_PROXIMA',
  'SEGUIMIENTO_PENDIENTE',
  'REUNION_PROXIMA',
  'COTIZACION_POR_VENCER',
  'OPORTUNIDAD_SIN_SEGUIMIENTO',
  'ASIGNACION',
  'SISTEMA',
]);

export const documentCategoryEnum = pgEnum('document_category', [
  'CONTRATO',
  'FACTURA',
  'COTIZACION',
  'ORDEN_COMPRA',
  'IDENTIFICACION',
  'IMAGEN',
  'OTRO',
]);
