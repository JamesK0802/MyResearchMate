// @vitest-environment jsdom
import { ElementRef, Renderer2 } from '@angular/core';
import { afterEach, describe, expect, it } from 'vitest';
import { OverflowTooltipDirective } from './overflow-tooltip.directive';

const renderer = {
  createElement: (name:string) => document.createElement(name),
  appendChild: (parent:Node, child:Node) => parent.appendChild(child),
  removeChild: (parent:Node, child:Node) => parent.removeChild(child),
  setAttribute: (element:Element, name:string, value:string) => element.setAttribute(name,value),
  removeAttribute: (element:Element, name:string) => element.removeAttribute(name)
} as Renderer2;

describe('OverflowTooltipDirective', () => {
  afterEach(() => document.body.replaceChildren());

  it('shows the full value only when the host text is truncated', () => {
    const host = document.createElement('h2');
    host.textContent = 'A complete long experiment title';
    Object.defineProperties(host, {
      clientWidth: { value:100 }, scrollWidth: { value:240 },
      clientHeight: { value:20 }, scrollHeight: { value:20 }
    });
    document.body.appendChild(host);
    const directive = new OverflowTooltipDirective(new ElementRef(host), renderer);
    directive.value = host.textContent;
    directive.ngAfterViewInit();
    directive.onMouseEnter();

    expect(host.getAttribute('data-text-truncated')).toBe('true');
    expect(host.getAttribute('tabindex')).toBe('0');
    expect(document.querySelector('[role="tooltip"]')?.textContent).toBe(host.textContent);

    directive.ngOnDestroy();
    expect(document.querySelector('[role="tooltip"]')).toBeNull();
  });
});
