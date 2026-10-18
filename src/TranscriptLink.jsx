import React from 'react';
export function TranscriptLink({file}){
 if(!file?.id)return null;
 return <a className="resume-link" href={'/api/transcripts/'+encodeURIComponent(file.id)} target="_blank" rel="noopener noreferrer">{file.name.toLowerCase().endsWith('.pdf')?'预览面试对话':'下载面试对话'} · {file.name}</a>;
}
