import React from 'react';
import {Icon} from './brand.jsx';

export default function ResourceCardCover({kind, label, icon, file, detail, title, description, badges}) {
  return <span className="wb-resource-cover" data-kind={kind} aria-hidden={title || badges ? undefined : true}>
    <span className="wb-resource-cover-label"><Icon name={icon} size={13}/><span>{label}</span>{badges}{detail && <span className="wb-resource-cover-detail">{detail}</span>}</span>
    {title ? <span className="wb-resource-cover-content"><strong title={title}>{title}</strong><span title={description}>{description}</span></span> : <span className="wb-resource-cover-paper">
      <span className="wb-resource-cover-file"><Icon name={icon} size={18}/><span>{file}</span></span>
      <span className="wb-resource-cover-line"/><span className="wb-resource-cover-line"/><span className="wb-resource-cover-line"/>
      <span className="wb-resource-cover-samples"><i/><i/><i/><i/></span>
    </span>}
  </span>;
}
