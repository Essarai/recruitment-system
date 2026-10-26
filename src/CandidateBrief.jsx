import React from 'react';
import phoneIcon from '@material-design-icons/svg/outlined/phone.svg';
import emailIcon from '@material-design-icons/svg/outlined/email.svg';
import schoolIcon from '@material-design-icons/svg/outlined/school.svg';
import ageIcon from '@material-design-icons/svg/outlined/cake.svg';
import {workExperienceLabel,educationOptions} from './model';
export function CandidateBrief({candidate:c,screening=false,showNotes=true}){
 return <><div className="candidate-career"><span title={c.currentTitle}>{c.currentTitle||'职位待补充'}</span><span title={c.company}>{c.company||'公司待补充'}</span><span>{workExperienceLabel(c.experience)||'工作经验待补充'}</span><span title={c.city}>{c.city||'城市待补充'}</span></div><div className="candidate-meta-line">{[[phoneIcon,'电话',c.phone||'待补充','phone'],[emailIcon,'邮箱',c.email||'待补充','email'],[schoolIcon,'学历',[c.highestEducation||'待补充',educationOptions.includes(c.education)?c.education:''].filter(Boolean).join(' · '),'education'],[ageIcon,'年龄',c.age?`${c.age}岁`:'待补充','age']].map(([icon,label,value,key])=><span className={`candidate-meta-item meta-${key}`} key={key} title={`${label}：${value}`}><img src={icon} alt={label}/><span>{value}</span></span>)}</div>{screening?<section className="screening-communication" aria-label="HR 初步沟通结论"><strong>HR 初步沟通结论</strong><p>{c.notes||'HR 尚未填写初步沟通结论'}</p></section>:showNotes&&c.notes&&<small className="sub candidate-note-preview" tabIndex={0} title={c.notes}>备注：{c.notes}</small>}</>;
}
