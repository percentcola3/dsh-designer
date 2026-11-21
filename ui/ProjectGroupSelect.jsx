import React from 'react';
import {Icon} from './brand.jsx';

export default function ProjectGroupSelect({groups, value, disabled, onChange, label = '分组', ariaLabel = '新项目分组', emptyLabel = '未分组', className = '', title, options = [{id: '', name: emptyLabel}, ...groups]}) {
  const id = React.useId();
  const root = React.useRef(null), trigger = React.useRef(null), list = React.useRef(null);
  const [open, setOpen] = React.useState(false), [activeId, setActiveId] = React.useState(value);
  const selected = options.find(option => option.id === value) || options[0];
  const activeIndex = Math.max(0, options.findIndex(option => option.id === activeId));
  const expanded = open && !disabled;

  React.useEffect(() => {
    if (!expanded) return;
    const dismiss = event => {if (!root.current?.contains(event.target)) setOpen(false);};
    document.addEventListener('pointerdown', dismiss, true);
    return () => document.removeEventListener('pointerdown', dismiss, true);
  }, [expanded]);
  React.useEffect(() => {
    if (expanded) list.current?.children[activeIndex]?.scrollIntoView({block: 'nearest'});
  }, [expanded, activeIndex]);
  React.useEffect(() => {if (disabled) setOpen(false);}, [disabled]);

  function choose(option) {
    if (disabled) return;
    onChange(option.id);
    setOpen(false);
    trigger.current?.focus();
  }
  function keyDown(event) {
    if (disabled) return;
    if (event.key === 'Escape' && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (event.key === 'Tab') {setOpen(false); return;}
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      let index = options.findIndex(option => option.id === selected.id);
      if (expanded) index = activeIndex + (event.key === 'ArrowUp' ? -1 : 1);
      if (event.key === 'Home') index = 0;
      if (event.key === 'End') index = options.length - 1;
      setActiveId(options[(index + options.length) % options.length].id);
      setOpen(true);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      if (expanded) choose(options[activeIndex]);
      else {setActiveId(selected.id); setOpen(true);}
    }
  }

  return <div className={`wb-project-group-select ${className}`.trim()} ref={root} onBlur={event => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span id={`${id}-label`} className="wb-project-group-label">{label}</span>
    <button ref={trigger} type="button" className="wb-project-group-trigger" role="combobox" aria-label={ariaLabel} title={title} aria-labelledby={`${id}-label ${id}-value`}
      aria-haspopup="listbox" aria-expanded={expanded} aria-controls={expanded ? `${id}-list` : undefined}
      aria-activedescendant={expanded ? `${id}-option-${activeIndex}` : undefined} disabled={disabled} onKeyDown={keyDown}
      onClick={() => {setActiveId(selected.id); setOpen(!expanded);}}>
      <span id={`${id}-value`}>{selected.name}</span><Icon name="chevron-down" size={14}/>
    </button>
    {expanded && <div ref={list} id={`${id}-list`} className="wb-project-group-list" role="listbox" aria-labelledby={`${id}-label`}>
      {options.map((option, index) => <button key={option.id} id={`${id}-option-${index}`} type="button" role="option" tabIndex={-1}
        aria-selected={option.id === selected.id} data-active={index === activeIndex}
        onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActiveId(option.id)} onClick={() => choose(option)}>
        <span>{option.name}</span>{option.id === selected.id && <Icon name="check" size={14}/>}
      </button>)}
    </div>}
  </div>;
}
