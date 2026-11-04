// Special interviews record completion without inventing an interview date.
export const isSpecialInterview=r=>r?.mode==='特殊'&&!!r.specialRecordedAt;
export const hasInterviewArrangement=r=>!!r?.time||isSpecialInterview(r);
