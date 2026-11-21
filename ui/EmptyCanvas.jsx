import React from 'react';
import {Button} from './common.jsx';

export default function EmptyCanvas({loading=false,error,onRetry}){
  return <div className="wb-empty-stage" aria-label="HTML 页面预览">
    <div className="wb-canvas-empty" role="status">
      <span>{loading?'正在加载设计稿…':error?'项目未能加载。':'暂无可预览的页面'}</span>
      {error&&<Button onClick={onRetry}>重新加载项目</Button>}
    </div>
  </div>;
}
