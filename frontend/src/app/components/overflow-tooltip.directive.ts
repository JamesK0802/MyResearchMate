import { AfterViewInit, Directive, ElementRef, HostListener, Input, OnChanges, OnDestroy, Renderer2 } from '@angular/core';

/** Shows the complete value only when the host's visible text is truncated. */
@Directive({
  selector: '[appOverflowTooltip]',
  standalone: true
})
export class OverflowTooltipDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input('appOverflowTooltip') value = '';

  private tooltip?: HTMLElement;
  private resizeObserver?: ResizeObserver;
  private touchPinned = false;
  private addedTabIndex = false;

  constructor(private element: ElementRef<HTMLElement>, private renderer: Renderer2) {}

  ngAfterViewInit(): void {
    this.refreshAccessibility();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.refreshAccessibility());
      this.resizeObserver.observe(this.element.nativeElement);
    }
  }

  ngOnChanges(): void {
    if (this.tooltip) this.tooltip.textContent = this.tooltipText;
    queueMicrotask(() => this.refreshAccessibility());
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.hide();
  }

  @HostListener('mouseenter')
  onMouseEnter(): void { this.show(); }

  @HostListener('mouseleave')
  onMouseLeave(): void { if (!this.touchPinned) this.hide(); }

  @HostListener('focus')
  onFocus(): void { this.show(); }

  @HostListener('blur')
  onBlur(): void { if (!this.touchPinned) this.hide(); }

  @HostListener('pointerdown', ['$event'])
  onPointerDown(event: PointerEvent): void {
    if (event.pointerType === 'mouse' || !this.isOverflowing()) return;
    this.touchPinned = !this.touchPinned;
    this.touchPinned ? this.show() : this.hide();
  }

  @HostListener('document:pointerdown', ['$event'])
  onDocumentPointerDown(event: PointerEvent): void {
    if (!this.touchPinned || this.element.nativeElement.contains(event.target as Node)) return;
    this.touchPinned = false;
    this.hide();
  }

  @HostListener('window:scroll')
  @HostListener('window:resize')
  onViewportChange(): void {
    if (this.tooltip) this.positionTooltip();
    this.refreshAccessibility();
  }

  private get tooltipText(): string {
    return (this.value || this.element.nativeElement.textContent || '').trim();
  }

  private isOverflowing(): boolean {
    const host = this.element.nativeElement;
    return !!this.tooltipText && (host.scrollWidth > host.clientWidth + 1 || host.scrollHeight > host.clientHeight + 1);
  }

  private refreshAccessibility(): void {
    const host = this.element.nativeElement;
    const truncated = this.isOverflowing();
    this.renderer.setAttribute(host, 'data-text-truncated', String(truncated));
    if (truncated && !host.hasAttribute('tabindex')) {
      this.renderer.setAttribute(host, 'tabindex', '0');
      this.addedTabIndex = true;
    } else if (!truncated && this.addedTabIndex) {
      this.renderer.removeAttribute(host, 'tabindex');
      this.addedTabIndex = false;
      this.hide();
    }
  }

  private show(): void {
    if (!this.isOverflowing() || this.tooltip || typeof document === 'undefined') return;
    const tooltip = this.renderer.createElement('div') as HTMLElement;
    tooltip.id = `overflow-tooltip-${Math.random().toString(36).slice(2, 9)}`;
    tooltip.textContent = this.tooltipText;
    tooltip.setAttribute('role', 'tooltip');
    Object.assign(tooltip.style, {
      position: 'fixed', zIndex: '5000', boxSizing: 'border-box', maxWidth: 'min(360px, calc(100vw - 24px))',
      padding: '8px 11px', border: '1px solid rgba(255,255,255,.12)', borderRadius: '9px',
      background: '#172033', color: '#fff', boxShadow: '0 10px 28px rgba(15,23,42,.24)',
      fontFamily: 'var(--font-sans, Arial, sans-serif)', fontSize: '.76rem', fontWeight: '650',
      lineHeight: '1.42', letterSpacing: '0', whiteSpace: 'normal', overflowWrap: 'anywhere', pointerEvents: 'none'
    });
    this.renderer.appendChild(document.body, tooltip);
    this.renderer.setAttribute(this.element.nativeElement, 'aria-describedby', tooltip.id);
    this.tooltip = tooltip;
    this.positionTooltip();
  }

  private positionTooltip(): void {
    if (!this.tooltip) return;
    const hostRect = this.element.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltip.getBoundingClientRect();
    const gap = 8;
    const margin = 12;
    const left = Math.min(window.innerWidth - tooltipRect.width - margin, Math.max(margin, hostRect.left + hostRect.width / 2 - tooltipRect.width / 2));
    const placeAbove = hostRect.top >= tooltipRect.height + gap + margin;
    const top = placeAbove ? hostRect.top - tooltipRect.height - gap : hostRect.bottom + gap;
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  private hide(): void {
    if (!this.tooltip) return;
    this.renderer.removeAttribute(this.element.nativeElement, 'aria-describedby');
    this.renderer.removeChild(document.body, this.tooltip);
    this.tooltip = undefined;
  }
}
