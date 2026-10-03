import { useEffect, useState } from 'react';
import {
  UserPlus,
  Users,
  Edit2,
  Trash2,
  Phone,
  AlertCircle,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../hooks/useAppStore';
import {
  fetchUsers,
  createNewUser,
  updateExistingUser,
  deleteExistingUser,
  clearUserActionError,
} from '../../store/slices/adminSlice';
import Modal from '../../components/common/Modal';
import EmptyState from '../../components/common/EmptyState';

export default function AdminUsers() {
  const dispatch = useAppDispatch();
  const { users, userActionLoading, userActionError } = useAppSelector(
    (state) => state.admin
  );

  // New user form state
  const [newForm, setNewForm] = useState({
    name: '',
    employee_code: '',
    role: 'MR',
    phone: '',
    password: '',
  });
  const [createSuccess, setCreateSuccess] = useState(false);

  // Edit user modal state
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState({
    name: '',
    role: 'MR',
    phone: '',
    password: '',
  });

  // Delete user modal state
  const [deletingUser, setDeletingUser] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    dispatch(fetchUsers());
  }, [dispatch]);

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    dispatch(clearUserActionError());
    setCreateSuccess(false);

    const action = await dispatch(
      createNewUser({
        name: newForm.name.trim(),
        employee_code: newForm.employee_code.trim(),
        role: newForm.role,
        phone: newForm.phone.trim() || null,
        password: newForm.password,
      })
    );

    if (createNewUser.fulfilled.match(action)) {
      setCreateSuccess(true);
      setNewForm({
        name: '',
        employee_code: '',
        role: 'MR',
        phone: '',
        password: '',
      });
      setTimeout(() => setCreateSuccess(false), 3000);
    }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      name: user.name || '',
      role: user.role || 'MR',
      phone: user.phone || '',
      password: '',
    });
    dispatch(clearUserActionError());
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingUser) return;

    const payload = {
      name: editForm.name.trim(),
      role: editForm.role,
      phone: editForm.phone.trim() || null,
    };
    if (editForm.password) {
      payload.password = editForm.password;
    }

    const action = await dispatch(
      updateExistingUser({ userId: editingUser.id, userData: payload })
    );

    if (updateExistingUser.fulfilled.match(action)) {
      setEditingUser(null);
    }
  };

  const confirmDelete = async () => {
    if (!deletingUser) return;
    setIsDeleting(true);
    await dispatch(deleteExistingUser(deletingUser.id));
    setIsDeleting(false);
    setDeletingUser(null);
  };

  return (
    <div className="space-y-6">
      {/* Add User Form Card */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-[#2f6f4e]/10 text-[#2f6f4e]">
            <UserPlus size={18} />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
              Add New User
            </h2>
            <p className="text-xs text-[#5b6660]">
              Create credentials for field medical representatives or admins.
            </p>
          </div>
        </div>

        {createSuccess && (
          <div className="mb-4 p-3 rounded-lg bg-[#e3efe8] border border-[#2f6f4e]/30 text-[#2f6f4e] text-xs font-semibold flex items-center gap-2 animate-in fade-in">
            <CheckCircle size={15} />
            <span>User account successfully registered!</span>
          </div>
        )}

        {userActionError && !editingUser && (
          <div className="mb-4 p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs flex items-center gap-2">
            <AlertCircle size={15} className="shrink-0" />
            <span>{userActionError}</span>
          </div>
        )}

        <form onSubmit={handleCreateSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Full Name <span className="text-[#a8403c]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Ramesh Kumar"
                value={newForm.name}
                onChange={(e) => setNewForm({ ...newForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Employee Code <span className="text-[#a8403c]">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MR003 or ADMIN02"
                value={newForm.employee_code}
                onChange={(e) =>
                  setNewForm({ ...newForm, employee_code: e.target.value })
                }
                className="w-full px-3 py-2 text-sm font-mono border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Role <span className="text-[#a8403c]">*</span>
              </label>
              <select
                value={newForm.role}
                onChange={(e) => setNewForm({ ...newForm, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              >
                <option value="MR">MR (Medical Representative)</option>
                <option value="ADMIN">Admin (Full Access)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Phone Number
              </label>
              <input
                type="tel"
                placeholder="+91 9876543210"
                value={newForm.phone}
                onChange={(e) => setNewForm({ ...newForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Password <span className="text-[#a8403c]">*</span>
              </label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={newForm.password}
                onChange={(e) =>
                  setNewForm({ ...newForm, password: e.target.value })
                }
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={userActionLoading}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {userActionLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Registering user…</span>
                </>
              ) : (
                <>
                  <UserPlus size={14} />
                  <span>Add User</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* Users Directory List */}
      <div className="bg-white border border-[#d7dcd9] rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-gray-100 text-gray-700">
              <Users size={18} />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#1c2321]">
              Team Directory ({users.length})
            </h2>
          </div>
        </div>

        {users.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No users found"
            description="There are no users registered in the system yet."
          />
        ) : (
          <div className="space-y-3">
            {users.map((u) => (
              <div
                key={u.id}
                className="p-4 rounded-xl border border-[#d7dcd9] hover:border-[#2f6f4e]/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm sm:text-base text-[#1c2321]">
                      {u.name}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        u.role === 'ADMIN'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-emerald-100 text-[#2f6f4e]'
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                  <div className="text-xs text-[#5b6660] mt-1 flex items-center gap-3">
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-[#1c2321]">
                      {u.employee_code}
                    </span>
                    {u.phone ? (
                      <span className="flex items-center gap-1">
                        <Phone size={11} className="text-gray-400" />
                        {u.phone}
                      </span>
                    ) : (
                      <span className="text-gray-400">No phone</span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center border-t sm:border-t-0 pt-2 sm:pt-0 border-gray-100 w-full sm:w-auto justify-end">
                  <button
                    type="button"
                    onClick={() => openEditModal(u)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#1c2321] hover:bg-gray-100 rounded-lg border border-[#d7dcd9] transition-colors cursor-pointer"
                  >
                    <Edit2 size={13} className="text-[#5b6660]" />
                    <span>Edit</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingUser(u)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-[#a8403c] hover:bg-[#f6e3e1]/60 rounded-lg border border-[#a8403c]/30 transition-colors cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit User Modal */}
      <Modal
        isOpen={!!editingUser}
        onClose={() => setEditingUser(null)}
        title={`Edit User — ${editingUser?.name}`}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4">
          {userActionError && (
            <div className="p-3 rounded-lg bg-[#f6e3e1] border border-[#a8403c]/30 text-[#a8403c] text-xs flex items-center gap-2">
              <AlertCircle size={15} className="shrink-0" />
              <span>{userActionError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              Full Name
            </label>
            <input
              type="text"
              required
              value={editForm.name}
              onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Role
              </label>
              <select
                value={editForm.role}
                onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              >
                <option value="MR">MR</option>
                <option value="ADMIN">Admin</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
                Phone
              </label>
              <input
                type="tel"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#5b6660] uppercase tracking-wider mb-1">
              New Password (Optional)
            </label>
            <input
              type="password"
              placeholder="Leave blank to keep existing password"
              value={editForm.password}
              onChange={(e) =>
                setEditForm({ ...editForm, password: e.target.value })
              }
              className="w-full px-3 py-2 text-sm border border-[#d7dcd9] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#2f6f4e]"
            />
          </div>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setEditingUser(null)}
              className="px-4 py-2 text-xs font-medium text-[#1c2321] border border-[#d7dcd9] rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={userActionLoading}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#2f6f4e] hover:bg-[#1f4d36] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {userActionLoading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Saving…</span>
                </>
              ) : (
                <>
                  <CheckCircle size={14} />
                  <span>Save changes</span>
                </>
              )}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete User Confirmation Modal */}
      <Modal
        isOpen={!!deletingUser}
        onClose={() => setDeletingUser(null)}
        title="Confirm Delete User"
        maxWidth="max-w-md"
      >
        <div className="space-y-4">
          <p className="text-sm text-[#1c2321]">
            Are you sure you want to delete account for{' '}
            <span className="font-bold">{deletingUser?.name}</span> (
            <span className="font-mono">{deletingUser?.employee_code}</span>)?
          </p>
          <p className="text-xs text-[#a8403c] bg-[#f6e3e1] p-3 rounded-lg border border-[#a8403c]/20">
            Warning: This action is permanent and cannot be reversed.
          </p>

          <div className="pt-3 flex items-center justify-end gap-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setDeletingUser(null)}
              className="px-4 py-2 text-xs font-medium text-[#1c2321] border border-[#d7dcd9] rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={confirmDelete}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#a8403c] hover:bg-[#863330] text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-60"
            >
              {isDeleting ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Deleting…</span>
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  <span>Delete account</span>
                </>
              )}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

