export const roleLabel=role=>({admin:'管理员',HR:'HR',interviewer:'面试官'}[role]||'未知角色');
export const isRecruiter=user=>['admin','HR'].includes(user?.role);
export const canManageAccounts=user=>user?.role==='admin';
