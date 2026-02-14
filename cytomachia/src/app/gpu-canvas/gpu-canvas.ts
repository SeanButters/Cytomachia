import { 
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  viewChild,
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
  @ViewChild('canvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;

  // WebGPU service
  constructor(private gpu: WebGPUService) {}

  // Resize observer to maintain canvas dimensions
  private resizeObserver?: ResizeObserver;
  private observeResize() {
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });

    this.resizeObserver.observe(document.body);
  }

  sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  // Wait until canvas is in DOM to initialize GPU
  async ngAfterViewInit() {
    this.canvas = this.canvasRef.nativeElement;
    await this.gpu.init(this.canvas);

    this.resizeCanvas();
    this.observeResize();
    this.clearCanvas();
    for (let i = 0; i < 20; i++){
      await this.sleep(2000)
      this.gpu.stepCompute();
      this.gpu.renderFrame();
    }
  }

  // Remove any subscriptions on destroy
  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.gpu.destroy();
  }

  // Schedule resize to not trigger the resize observer
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

    // TODO this.renderFrame();
    this.clearCanvas(); // todo for now
  }

  // TODO replace this
  public clearCanvas() {
    this.gpu.clearTexture();
  }
}
