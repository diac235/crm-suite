export interface SettingDefinition {
  key: string;
  value: unknown;
  description: string;
  isPublic: boolean;
}

/** Configuración inicial del sistema. Se almacena en la tabla `settings`. */
export const DEFAULT_SETTINGS: SettingDefinition[] = [
  {
    key: 'company.profile',
    description: 'Datos de la empresa que emite las cotizaciones',
    isPublic: true,
    value: {
      name: 'Mi Empresa S.A.',
      legalName: 'Mi Empresa Sociedad Anónima',
      taxId: '0000000000001',
      address: 'Av. Principal 123',
      city: 'Guayaquil',
      state: 'Guayas',
      country: 'Ecuador',
      phone: '+593 4 000 0000',
      email: 'ventas@miempresa.com',
      website: 'https://www.miempresa.com',
      logoUrl: '',
    },
  },
  {
    key: 'finance.currency',
    description: 'Moneda y formato monetario',
    isPublic: true,
    value: { code: 'USD', symbol: '$', locale: 'es-EC', decimals: 2 },
  },
  {
    key: 'quotes.defaults',
    description: 'Valores por defecto de las cotizaciones',
    isPublic: true,
    value: {
      validityDays: 15,
      terms:
        'Precios expresados en dólares de los Estados Unidos de América. Los valores no incluyen impuestos salvo indicación expresa. Forma de pago: 50% anticipo y 50% contra entrega.',
      footerNote: 'Gracias por su preferencia.',
    },
  },
  {
    key: 'crm.defaults',
    description: 'Parámetros operativos del CRM',
    isPublic: true,
    value: {
      defaultCountry: 'Ecuador',
      staleOpportunityDays: 15,
      followUpReminderHours: 24,
    },
  },
];
