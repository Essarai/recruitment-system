export const roleLabel=role=>({admin:'管理员',HR:'HR',interviewer:'面试官'}[role]||'未知角色');
export const isRecruiter=user=>['admin','HR'].includes(user?.role);
export const canManageAccounts=user=>user?.role==='admin';

export function isApplicationCreator(user,app){
 if(!isRecruiter(user)||!app)return false;
 if(app.createdBy)return app.createdBy===user.id;
 const created=[...(app.history||[])].reverse().find(h=>h.action?.startsWith('创建应聘'));
 return !!created&&!!user.name&&created.actor===user.name;
}

export function canManageApplication(user,app){
 return user?.role==='admin'||user?.role==='HR'&&isApplicationCreator(user,app);
}

export function applicationCreatorName(app,users=[]){
 const account=app.createdBy&&users.find(u=>u.id===app.createdBy);
 const created=[...(app.history||[])].reverse().find(h=>h.action?.startsWith('创建应聘'));
 return account?.name||created?.actor||'未记录';
}

export function canWithdrawApplication(user,app){
 return canManageApplication(user,app)&&app?.status==='进行中'&&!app.withdrawnAt&&!['accepted','declined','needs_info'].includes(app.screening?.status)&&!app.screening?.reviewedAt&&!app.screening?.supplements?.length&&!app.rounds.some(r=>r.review?.supplements?.length||r.feedback?.status&&r.feedback.status!=='none'||r.feedback?.author||r.feedback?.submittedAt||r.feedbackVersions?.length);
}
