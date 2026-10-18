import React from 'react';
import {resumePath} from './repository';
export function ResumeLink({app,children,className=''}){
 if(!app.resume?.id)return <span className="muted">暂无附件</span>;
 return <a className={`resume-link ${className}`} href={resumePath(app.resume.id)} target="_blank" rel="noopener noreferrer" title={app.resume.name}>{children}</a>;
}
