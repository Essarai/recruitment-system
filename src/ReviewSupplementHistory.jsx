import React from 'react';
export function ReviewSupplementHistory({review}){
 if(!review?.supplements?.length)return null;
 return <div className="review-supplements" aria-label="简历补充记录">{review.supplements.map((item,index)=><div className="review-supplement-entry" key={index}><p><strong>需 HR 补充</strong> · {item.requestedBy}</p><p>{item.reason}</p>{item.response?<><p><strong>HR 补充说明</strong> · {item.respondedBy}</p><p>{item.response}</p></>:item.supersededAt?<p className="muted">该补充要求已随流程变更失效，请按当前审核处理。</p>:<p className="warning">等待 HR 补充，补充后需重新确认；当前不能排期。</p>}</div>)}</div>;
}
