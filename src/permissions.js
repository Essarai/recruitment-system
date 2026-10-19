export const roleLabel=role=>({admin:'管理员',HR:'HR',interviewer:'面试官'}[role]||'未知角色');
export const isRecruiter=user=>['admin','HR'].includes(user?.role);
export const canManageAccounts=user=>user?.role==='admin';

export function canManageApplication(user,app){
 if(user?.role==='admin')return true;
 if(user?.role!=='HR'||!app)return false;
 if(app.createdBy)return app.createdBy===user.id;
 const created=[...(app.history||[])].reverse().find(h=>h.action?.startsWith('创建应聘'));
 return !!created&&created.actor===user.name;
}
