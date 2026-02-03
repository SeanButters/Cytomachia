import { 
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { WebGPUService } from './webgpu';

@Component({
  selector: 'app-gpu-canvas',
  imports: [],
  templateUrl: './gpu-canvas.html',
  styleUrl: './gpu-canvas.scss',
})
export class GpuCanvasComponent implements AfterViewInit, OnDestroy {
  // Canvas element
  @ViewChild('canvas', {static: true})
  canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;

  // Canvas GPU configurations
  constructor(private gpu: WebGPUService) {}

  private resizeObserver?: ResizeObserver;

  private observeResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });

    this.resizeObserver.observe(document.body);
  }

  // Wait until canvas is in DOM
  async ngAfterViewInit() {
    this.canvas = this.canvasRef.nativeElement;
    await this.gpu.init(this.canvas);

    this.resizeCanvas();

    this.resizeObserver = new ResizeObserver(() => {
      this.resizeCanvas();
    });
    this.observeResize();
    this.clearCanvas();
  }

  // Remove any subscriptions on destroy
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
  }

  private resizePending = false;
  private scheduleResize() {
    if(this.resizePending) return;
    this.resizePending = true;

    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.resizePending = false;
    });
  }

  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);
    if(this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    // TODO this.renderFram();
  }

  // TODO yoink this method
  public clearCanvas() {
    const pass = this.gpu.encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.gpu.context.getCurrentTexture().createView(),
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    pass.end();
    this.gpu.device.queue.submit([this.gpu.encoder.finish()]);
  }
}
