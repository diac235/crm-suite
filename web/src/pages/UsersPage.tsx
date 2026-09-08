import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, Trash2, Unlock, Users as UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import { apiDelete, apiGet, apiList, apiPatch, apiPost, errorMessage } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { useTableState } from '../hooks/useTableState';
import { useAuth } from '../hooks/useAuth';
import { PageHeader } from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { DataTable, type Column } from '../components/ui/DataTable';
import { Pagination } from '../components/ui/Pagination';
import { StatusBadge } from '../components/ui/Badge';
import { Modal } from '../components/ui/Modal';
import { Card, CardBody } from '../components/ui/Card';
import { Checkbox, Field, Input, Select } from '../components/ui/Field';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { ErrorState } from '../components/ui/Spinner';
import { Tabs } from '../components/ui/Tabs';
import { FilterSelect, ResourceToolbar } from '../components/ResourceToolbar';
import type { Role, Team, UserRow } from '../types';

const passwordRule = z
  .string()
  .min(10, 'Mínimo 10 caracteres')
  .regex(/[a-z]/, 'Debe incluir una minúscula')
  .regex(/[A-Z]/, 'Debe incluir una mayúscula')
  .regex(/[0-9]/, 'Debe incluir un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir un carácter especial');

const createSchema = z.object({
  email: z.string().trim().email('Correo electrónico inválido'),
  password: passwordRule,
  firstName: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
  lastName: z.string().trim().min(1, 'El apellido es obligatorio').max(80),
  phone: z.string().trim().max(40).optional(),
  position: z.string().trim().max(120).optional(),
  roleId: z.string().min(1, 'Debe seleccionar un rol'),
  teamId: z.string().optional(),
  isActive: z.boolean(),
  mustChangePassword: z.boolean(),
});

type CreateValues = z.infer<typeof createSchema>;

export default function UsersPage() {
  const queryClient = useQueryClient();
  const { can, user: currentUser } = useAuth();
  const [tab, setTab] = useState('usuarios');
  const table = useTableState({ sortBy: 'firstName', sortDir: 'asc' });
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserRow | null>(null);
  const [resetting, setResetting] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [toDelete, setToDelete] = useState<UserRow | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', table.queryParams],
    queryFn: () => apiList<UserRow>('/users', table.queryParams),
    enabled: tab === 'usuarios',
    placeholderData: (previous) => previous,
  });

  const rolesQuery = useQuery({ queryKey: ['roles'], queryFn: () => apiGet<Role[]>('/roles') });
  const teamsQuery = useQuery({ queryKey: ['teams'], queryFn: () => apiGet<Team[]>('/teams'), enabled: tab === 'equipos' || formOpen });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateValues>({ resolver: zodResolver(createSchema) });

  useEffect(() => {
    if (!formOpen) return;
    reset({
      email: editing?.email ?? '',
      password: editing ? 'Temporal*2026Aa' : '',
      firstName: editing?.firstName ?? '',
      lastName: editing?.lastName ?? '',
      phone: editing?.phone ?? '',
      position: editing?.position ?? '',
      roleId: editing?.roleId ?? rolesQuery.data?.find((role) => role.slug === 'usuario')?.id ?? '',
      teamId: editing?.teamId ?? '',
      isActive: editing?.isActive ?? true,
      mustChangePassword: editing?.mustChangePassword ?? true,
    });
  }, [formOpen, editing, rolesQuery.data, reset]);

  const save = useMutation({
    mutationFn: (values: CreateValues) => {
      if (editing) {
        const { password: _password, mustChangePassword: _must, ...rest } = values;
        return apiPatch(`/users/${editing.id}`, { ...rest, teamId: rest.teamId || null });
      }
      return apiPost('/users', { ...values, teamId: values.teamId || null });
    },
    onSuccess: () => {
      toast.success(editing ? 'Usuario actualizado' : 'Usuario creado');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setFormOpen(false);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const resetPassword = useMutation({
    mutationFn: () => apiPost(`/users/${resetting!.id}/reset-password`, { newPassword, mustChangePassword: true }),
    onSuccess: () => {
      toast.success('Contraseña restablecida');
      setResetting(null);
      setNewPassword('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const unlock = useMutation({
    mutationFn: (row: UserRow) => apiPost(`/users/${row.id}/unlock`),
    onSuccess: () => {
      toast.success('Cuenta desbloqueada');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const remove = useMutation({
    mutationFn: (row: UserRow) => apiDelete(`/users/${row.id}`),
    onSuccess: () => {
      toast.success('Usuario eliminado');
      void queryClient.invalidateQueries({ queryKey: ['users'] });
      setToDelete(null);
    },
    onError: (error) => {
      toast.error(errorMessage(error));
      setToDelete(null);
    },
  });

  const columns = useMemo<Array<Column<UserRow>>>(
    () => [
      {
        key: 'name',
        header: 'Usuario',
        sortKey: 'firstName',
        render: (row) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-slate-900">
              {row.firstName} {row.lastName}
            </p>
            <p className="truncate text-xs text-slate-500">{row.email}</p>
          </div>
        ),
      },
      { key: 'role', header: 'Rol', render: (row) => row.roleName },
      { key: 'team', header: 'Equipo', hideOnMobile: true, render: (row) => row.teamName ?? '—' },
      { key: 'position', header: 'Cargo', hideOnMobile: true, render: (row) => row.position ?? '—' },
      {
        key: 'lastLoginAt',
        header: 'Último acceso',
        sortKey: 'lastLoginAt',
        hideOnMobile: true,
        render: (row) => formatDateTime(row.lastLoginAt),
      },
      {
        key: 'status',
        header: 'Estado',
        render: (row) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge value={row.isActive ? 'ACTIVO' : 'INACTIVO'} />
            {row.lockedUntil && new Date(row.lockedUntil) > new Date() && (
              <span title="Cuenta bloqueada por intentos fallidos">
                <Lock className="h-3.5 w-3.5 text-red-500" />
              </span>
            )}
          </div>
        ),
      },
      {
        key: 'actions',
        header: '',
        align: 'right',
        width: '150px',
        render: (row) => (
          <div className="flex items-center justify-end gap-1">
            {can('users.update') && (
              <Button
                variant="ghost"
                size="icon"
                title="Restablecer contraseña"
                aria-label="Restablecer contraseña"
                onClick={() => setResetting(row)}
              >
                <KeyRound className="h-4 w-4" />
              </Button>
            )}
            {can('users.update') && row.lockedUntil && new Date(row.lockedUntil) > new Date() && (
              <Button variant="ghost" size="icon" title="Desbloquear" aria-label="Desbloquear cuenta" onClick={() => unlock.mutate(row)}>
                <Unlock className="h-4 w-4" />
              </Button>
            )}
            {can('users.update') && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Editar usuario"
                onClick={() => {
                  setEditing(row);
                  setFormOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {can('users.delete') && row.id !== currentUser?.id && (
              <Button
                variant="ghost"
                size="icon"
                aria-label="Eliminar usuario"
                className="text-red-500 hover:bg-red-50"
                onClick={() => setToDelete(row)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [can, currentUser, unlock],
  );

  if (usersQuery.isError) return <ErrorState message={errorMessage(usersQuery.error)} onRetry={() => usersQuery.refetch()} />;

  return (
    <>
      <PageHeader
        title="Usuarios y equipos"
        description="Gestión de accesos, roles y equipos de trabajo."
        actions={
          can('users.create') && tab === 'usuarios' ? (
            <Button
              icon={<Plus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              Nuevo usuario
            </Button>
          ) : undefined
        }
      />

      <Card className="mb-4">
        <Tabs
          active={tab}
          onChange={setTab}
          items={[
            { key: 'usuarios', label: 'Usuarios' },
            { key: 'roles', label: 'Roles y permisos' },
            { key: 'equipos', label: 'Equipos' },
          ]}
        />
      </Card>

      {tab === 'usuarios' && (
        <>
          <ResourceToolbar
            search={table.state.search}
            onSearchChange={table.setSearch}
            placeholder="Buscar por nombre o correo…"
            activeFilterCount={table.activeFilterCount}
            onResetFilters={table.resetFilters}
            filters={
              <>
                <FilterSelect
                  label="Rol"
                  value={table.state.filters.roleId}
                  onChange={(value) => table.setFilter('roleId', value)}
                  options={(rolesQuery.data ?? []).map((role) => ({ value: role.id, label: role.name }))}
                />
                <FilterSelect
                  label="Estado"
                  value={table.state.filters.isActive}
                  onChange={(value) => table.setFilter('isActive', value)}
                  options={[
                    { value: 'true', label: 'Activos' },
                    { value: 'false', label: 'Inactivos' },
                  ]}
                />
              </>
            }
          />

          <DataTable
            columns={columns}
            rows={usersQuery.data?.data ?? []}
            rowKey={(row) => row.id}
            loading={usersQuery.isLoading}
            sortBy={table.state.sortBy}
            sortDir={table.state.sortDir}
            onSort={table.toggleSort}
            emptyTitle="Sin usuarios"
            emptyMessage="Cree el primer usuario del sistema."
            emptyAction={
              can('users.create') ? (
                <Button
                  icon={<UsersIcon className="h-4 w-4" />}
                  onClick={() => {
                    setEditing(null);
                    setFormOpen(true);
                  }}
                >
                  Crear usuario
                </Button>
              ) : undefined
            }
          />

          <Pagination meta={usersQuery.data?.meta} onPageChange={table.setPage} onPageSizeChange={table.setPageSize} />
        </>
      )}

      {tab === 'roles' && <RolesPanel roles={rolesQuery.data ?? []} />}
      {tab === 'equipos' && <TeamsPanel teams={teamsQuery.data ?? []} />}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button form="user-form" type="submit" loading={save.isPending}>
              Guardar
            </Button>
          </>
        }
      >
        <form
          id="user-form"
          onSubmit={handleSubmit((values) => save.mutate(values))}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          noValidate
        >
          <Field label="Nombre" required error={errors.firstName?.message}>
            <Input {...register('firstName')} invalid={Boolean(errors.firstName)} />
          </Field>
          <Field label="Apellido" required error={errors.lastName?.message}>
            <Input {...register('lastName')} invalid={Boolean(errors.lastName)} />
          </Field>
          <Field label="Correo electrónico" required error={errors.email?.message} className="sm:col-span-2">
            <Input type="email" {...register('email')} invalid={Boolean(errors.email)} />
          </Field>
          {!editing && (
            <Field
              label="Contraseña inicial"
              required
              error={errors.password?.message}
              hint="Mínimo 10 caracteres con mayúscula, minúscula, número y símbolo."
              className="sm:col-span-2"
            >
              <Input type="text" {...register('password')} invalid={Boolean(errors.password)} />
            </Field>
          )}
          <Field label="Rol" required error={errors.roleId?.message}>
            <Select {...register('roleId')} invalid={Boolean(errors.roleId)}>
              {rolesQuery.data?.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Equipo" error={errors.teamId?.message}>
            <Select {...register('teamId')}>
              <option value="">Sin equipo</option>
              {teamsQuery.data?.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Teléfono" error={errors.phone?.message}>
            <Input {...register('phone')} />
          </Field>
          <Field label="Cargo" error={errors.position?.message}>
            <Input {...register('position')} />
          </Field>
          <div className="flex items-center gap-4 sm:col-span-2">
            <Checkbox label="Usuario activo" {...register('isActive')} />
            {!editing && <Checkbox label="Debe cambiar la contraseña al ingresar" {...register('mustChangePassword')} />}
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(resetting)}
        onClose={() => setResetting(null)}
        title="Restablecer contraseña"
        description={resetting ? `Usuario: ${resetting.email}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setResetting(null)}>
              Cancelar
            </Button>
            <Button onClick={() => resetPassword.mutate()} loading={resetPassword.isPending} disabled={newPassword.length < 10}>
              Restablecer
            </Button>
          </>
        }
      >
        <Field
          label="Nueva contraseña"
          required
          hint="El usuario deberá cambiarla en su próximo ingreso y se cerrarán sus sesiones."
        >
          <Input value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={Boolean(toDelete)}
        title="Eliminar usuario"
        message={`Se dará de baja a "${toDelete?.email ?? ''}". Sus registros históricos se conservan para trazabilidad.`}
        confirmLabel="Eliminar"
        loading={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete)}
        onCancel={() => setToDelete(null)}
      />
    </>
  );
}

function RolesPanel({ roles }: { roles: Role[] }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [selected, setSelected] = useState<Role | null>(null);

  const catalogQuery = useQuery({
    queryKey: ['roles', 'catalog'],
    queryFn: () => apiGet<Array<{ module: string; label: string; permissions: Array<{ code: string; description: string }> }>>('/roles/catalog'),
    enabled: can('roles.read'),
  });

  const detailQuery = useQuery({
    queryKey: ['role', selected?.id],
    queryFn: () => apiGet<Role>(`/roles/${selected!.id}`),
    enabled: Boolean(selected),
  });

  const [checked, setChecked] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (detailQuery.data?.permissions) setChecked(new Set(detailQuery.data.permissions));
  }, [detailQuery.data]);

  const save = useMutation({
    mutationFn: () => apiPatch(`/roles/${selected!.id}`, { permissions: [...checked] }),
    onSuccess: () => {
      toast.success('Permisos actualizados');
      void queryClient.invalidateQueries({ queryKey: ['roles'] });
      setSelected(null);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardBody>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">{role.name}</p>
                  <p className="truncate text-xs text-slate-500">{role.slug}</p>
                </div>
                {role.isSystem && <StatusBadge value="ACTIVO" />}
              </div>
              <p className="mt-2 line-clamp-2 text-sm text-slate-600">{role.description}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{role.usersCount ?? 0} usuarios</span>
                <span>{role.permissionsCount ?? 0} permisos</span>
              </div>
              {can('roles.manage') && role.slug !== 'superadmin' && (
                <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => setSelected(role)}>
                  Configurar permisos
                </Button>
              )}
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Permisos de ${selected?.name ?? ''}`}
        description="Marque las acciones permitidas para este rol."
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setSelected(null)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} loading={save.isPending}>
              Guardar permisos
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          {catalogQuery.data?.map((group) => (
            <div key={group.module} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">{group.label}</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.permissions.map((permission) => (
                  <Checkbox
                    key={permission.code}
                    label={permission.description}
                    checked={checked.has(permission.code)}
                    onChange={(event) => {
                      const next = new Set(checked);
                      if (event.target.checked) next.add(permission.code);
                      else next.delete(permission.code);
                      setChecked(next);
                    }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Modal>
    </>
  );
}

function TeamsPanel({ teams }: { teams: Team[] }) {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => apiPost('/teams', { name, description, isActive: true }),
    onSuccess: () => {
      toast.success('Equipo creado');
      void queryClient.invalidateQueries({ queryKey: ['teams'] });
      setOpen(false);
      setName('');
      setDescription('');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <>
      {can('teams.create') && (
        <div className="mb-3 flex justify-end">
          <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            Nuevo equipo
          </Button>
        </div>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {teams.length === 0 && <p className="text-sm text-slate-500">No hay equipos configurados.</p>}
        {teams.map((team) => (
          <Card key={team.id}>
            <CardBody>
              <p className="font-medium text-slate-900">{team.name}</p>
              <p className="mt-1 line-clamp-2 text-sm text-slate-600">{team.description ?? 'Sin descripción'}</p>
              <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                <span>{team.membersCount} integrantes</span>
                <span>{team.leaderName ?? 'Sin líder'}</span>
              </div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo equipo"
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>
              Crear
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre" required>
            <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
          </Field>
          <Field label="Descripción">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} />
          </Field>
        </div>
      </Modal>
    </>
  );
}
