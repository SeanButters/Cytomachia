import { 
  Component,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  NgZone,
} from '@angular/core';
import { WebGPUService } from './webgpu';

@Component({
  selector: 'app-gpu-canvas',
  imports: [],
  templateUrl: './gpu-canvas.html',
  styleUrl: './gpu-canvas.scss',
})
export class GpuCanvasComponent implements AfterViewInit, OnDestroy {
  // Injectable constructors
  constructor(
    private gpu: WebGPUService,
    private zone: NgZone
  ) {}

  // Canvas element
  @ViewChild('canvas', {static: true}) canvasRef!: ElementRef<HTMLCanvasElement>;
  private canvas!: HTMLCanvasElement;

  // Maintain canvas aspect ratio vars
  private resizeObserver?: ResizeObserver;   // Resize observer to maintain canvas dimensions
  private resizePending = false;  // Schedule resize in animation frame to not anger the resize observer

  ///
  /// Angular Lifecycle Hooks
  ///
  async ngAfterViewInit() {
    // Wait until canvas is in DOM to initialize GPU
    this.canvas = this.canvasRef.nativeElement;
    await this.gpu.init(this.canvas);

    // Setup canvas
    this.resizeCanvas();
    this.initResizeObserver();
    window.addEventListener('keydown', this.handleKey);
    this.gpu.renderFrame();

    // Start render compute loop
    this.startGpuLoop();
  }

  ngOnDestroy(): void {
    // Remove any subscriptions on destroy
    window.removeEventListener('keydown', this.handleKey);
    this.resizeObserver?.disconnect();
    this.gpu.destroy();
  }

  ///
  /// Component Methods
  ///
  // Start GPU loop
  private startGpuLoop() {
    this.zone.runOutsideAngular(() => {
      this.gpu.start();
    });
  }

  private handleKey = (e: KeyboardEvent) => {
    if (e.code === 'Space') {
      this.gpu.pause(); // TODO if want to add indicator to FE, need to manually track pause state in front end
    }
    if (e.code === 'KeyN') {
      this.gpu.stepOnce();
    }
  };

  // TODO Helper method to sleep maybe not needed in future?
  // sleep(ms: number) {
  //   return new Promise(resolve => setTimeout(resolve, ms));
  // }

  private initResizeObserver() {
    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize();
    });

    this.resizeObserver.observe(document.body);
  }

  private scheduleResize() {
    if(this.resizePending) return;
    this.resizePending = true;

    requestAnimationFrame(() => {
      this.resizeCanvas();
      this.resizePending = false;
    });
  }

  // Resize canvas to same aspect ratio when window is resized
  private resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;

    const width = Math.floor(this.canvas.clientWidth * dpr);
    const height = Math.floor(this.canvas.clientHeight * dpr);
    if(this.canvas.width === width && this.canvas.height === height) {
      return;
    }

    this.canvas.width = width;
    this.canvas.height = height;

    this.gpu.renderFrame();
  }


}
