import React from 'react';
import searchIcon from '@material-design-icons/svg/outlined/search.svg';
export function MobileSearch({value,onChange,placeholder='搜索姓名、手机号或邮箱'}){
 return <div className="mobile-search"><img src={searchIcon} alt=""/><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e=>onChange(e.target.value)}/></div>;
}
