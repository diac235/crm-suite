import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiGet, apiPatch, apiPost, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Field';

const profileSchema = z.object({
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(80),
  phone: z.string().trim().max(40).optional(),
  position: z.string().trim().max(120).optional(),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ingrese su contraseña actual'),
    newPassword: z
      .string()
      .min(10, 'Mínimo 10 caracteres')
      .regex(/[a-z]/, 'Debe incluir una minúscula')
      .regex(/[A-Z]/, 'Debe incluir una mayúscula')
      .regex(/[0-9]/, 'Debe incluir un número')
      .regex(/[^A-Za-z0-9]/, 'Debe incluir un carácter especial'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'La confirmación no coincide',
    path: ['confirmPassword'],
  });

type ProfileValues = z.infer<typeof profileSchema>;
type PasswordValues = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const { user, logout, refreshUser, mustChangePassword } = useAuth();

  const meQuery = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<{ phone: string | null; position: string | null; lastLoginAt: string | null }>('/auth/me'),
  });

  const profileForm = useForm<ProfileValues>({ resolver: zodResolver(profileSchema) });
  const passwordForm = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    if (!user) return;
    profileForm.reset({
      firstName: user.firstName,
      lastName: user.lastName,
      phone: meQuery.data?.phone ?? '',
      position: meQuery.data?.position ?? '',
    });
  }, [user, meQuery.data, profileForm]);

  const updateProfile = useMutation({
    mutationFn: (values: ProfileValues) => apiPatch('/auth/me', values),
    onSuccess: async () => {
      toast.success('Perfil actualizado');
      await refreshUser();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const changePassword = useMutation({
    mutationFn: (values: PasswordValues) => apiPost('/auth/change-password', values),
    onSuccess: async () => {
      toast.success('Contraseña actualizada. Vuelva a iniciar sesión.');
      passwordForm.reset();
      await logout();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <PageHeader title="Mi perfil" description="Datos personales y seguridad de la cuenta." />

      {mustChangePassword && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Por seguridad debe cambiar su contraseña antes de continuar usando el sistema.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Datos personales" description={user?.email} />
          <CardBody>
            <form
              onSubmit={profileForm.handleSubmit((values) => updateProfile.mutate(values))}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
              noValidate
            >
              <Field label="Nombre" required error={profileForm.formState.errors.firstName?.message}>
                <Input {...profileForm.register('firstName')} />
              </Field>
              <Field label="Apellido" required error={profileForm.formState.errors.lastName?.message}>
                <Input {...profileForm.register('lastName')} />
              </Field>
              <Field label="Teléfono" error={profileForm.formState.errors.phone?.message}>
                <Input {...profileForm.register('phone')} />
              </Field>
              <Field label="Cargo" error={profileForm.formState.errors.position?.message}>
                <Input {...profileForm.register('position')} />
              </Field>
              <div className="sm:col-span-2">
                <Button type="submit" loading={updateProfile.isPending}>
                  Guardar cambios
                </Button>
              </div>
            </form>
            <dl className="mt-5 space-y-1 border-t border-slate-100 pt-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Rol</dt>
                <dd className="font-medium text-slate-800">{user?.roleSlug}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Último acceso</dt>
                <dd className="text-slate-800">{formatDateTime(meQuery.data?.lastLoginAt)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Permisos activos</dt>
                <dd className="text-slate-800">{user?.permissions.length ?? 0}</dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Cambiar contraseña"
            description="Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo."
          />
          <CardBody>
            <form
              onSubmit={passwordForm.handleSubmit((values) => changePassword.mutate(values))}
              className="space-y-4"
              noValidate
            >
              <Field label="Contraseña actual" required error={passwordForm.formState.errors.currentPassword?.message}>
                <Input type="password" autoComplete="current-password" {...passwordForm.register('currentPassword')} />
              </Field>
              <Field label="Nueva contraseña" required error={passwordForm.formState.errors.newPassword?.message}>
                <Input type="password" autoComplete="new-password" {...passwordForm.register('newPassword')} />
              </Field>
              <Field label="Confirmar nueva contraseña" required error={passwordForm.formState.errors.confirmPassword?.message}>
                <Input type="password" autoComplete="new-password" {...passwordForm.register('confirmPassword')} />
              </Field>
              <Button type="submit" loading={changePassword.isPending}>
                Actualizar contraseña
              </Button>
              <p className="text-xs text-slate-500">
                Al cambiar la contraseña se cerrarán todas las sesiones abiertas.
              </p>
            </form>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
